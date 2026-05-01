from __future__ import annotations

import ast

from schemas import DependencyEdge, ProgramNode, SliceResult, SlicingCriterion, VisualizationSink

PLOT_CALLS = {
  "plt.plot",
  "plt.bar",
  "plt.scatter",
  "plt.hist",
  "matplotlib.pyplot.plot",
  "matplotlib.pyplot.bar",
  "matplotlib.pyplot.scatter",
  "matplotlib.pyplot.hist",
}

PLOT_DISPLAY_CALLS = {
  "plt.show",
  "matplotlib.pyplot.show",
}

PLOT_FORMATTING_CALLS = {
  "plt.xlabel",
  "plt.ylabel",
  "plt.title",
  "plt.legend",
  "plt.xticks",
  "plt.yticks",
  "plt.tight_layout",
  "plt.grid",
  "matplotlib.pyplot.xlabel",
  "matplotlib.pyplot.ylabel",
  "matplotlib.pyplot.title",
  "matplotlib.pyplot.legend",
  "matplotlib.pyplot.xticks",
  "matplotlib.pyplot.yticks",
  "matplotlib.pyplot.tight_layout",
  "matplotlib.pyplot.grid",
}


def build_slicing_criterion(selected_sink: VisualizationSink | None) -> SlicingCriterion:
  return SlicingCriterion(
    target_node_id=selected_sink.node_id if selected_sink else None,
    target_line=selected_sink.source_span.start_line if selected_sink else None,
    variables=selected_sink.variables_used if selected_sink else [],
    sink=selected_sink,
  )


def slice_program(program_nodes: list[ProgramNode], criterion: SlicingCriterion) -> SliceResult:
  target_index = _target_index(program_nodes, criterion)
  if target_index is None:
    return SliceResult(
      criterion=criterion,
      irrelevant_node_ids=[node.node_id for node in program_nodes],
    )

  relevant_indexes = _backward_relevant_indexes(program_nodes, target_index, criterion.variables)
  relevant_indexes.update(_associated_display_indexes(program_nodes, target_index))

  relevant_nodes = [
    node
    for index, node in enumerate(program_nodes)
    if index in relevant_indexes
  ]
  relevant_node_ids = [node.node_id for node in relevant_nodes]
  irrelevant_node_ids = [
    node.node_id
    for index, node in enumerate(program_nodes)
    if index not in relevant_indexes
  ]

  return SliceResult(
    criterion=criterion,
    nodes=relevant_nodes,
    spans=[node.span for node in relevant_nodes],
    relevant_node_ids=relevant_node_ids,
    irrelevant_node_ids=irrelevant_node_ids,
    dependency_edges=_dependency_edges(relevant_nodes),
  )


def _target_index(
  program_nodes: list[ProgramNode],
  criterion: SlicingCriterion,
) -> int | None:
  if criterion.target_node_id:
    for index, node in enumerate(program_nodes):
      if node.node_id == criterion.target_node_id:
        return index

  if criterion.target_line is not None:
    for index, node in enumerate(program_nodes):
      if node.start_line <= criterion.target_line <= node.end_line:
        return index

  return None


def _backward_relevant_indexes(
  program_nodes: list[ProgramNode],
  target_index: int,
  variables: list[str],
) -> set[int]:
  relevant_indexes = {target_index}
  needed = set(variables)

  # The target expression itself may expose additional variables, including
  # aliases such as plt that are useful when the criterion is hand-authored.
  needed.update(program_nodes[target_index].uses)

  for index in range(target_index - 1, -1, -1):
    node = program_nodes[index]
    defines = set(node.defines)

    if defines & needed:
      relevant_indexes.add(index)
      needed.difference_update(defines)
      needed.update(node.uses)

  return relevant_indexes


def _associated_display_indexes(
  program_nodes: list[ProgramNode],
  target_index: int,
) -> set[int]:
  associated: set[int] = set()

  for index in range(target_index + 1, len(program_nodes)):
    node = program_nodes[index]
    call_names = _top_level_call_names(node)

    if call_names & PLOT_CALLS:
      break

    if call_names & (PLOT_FORMATTING_CALLS | PLOT_DISPLAY_CALLS):
      associated.add(index)
      if call_names & PLOT_DISPLAY_CALLS:
        break
      continue

    break

  return associated


def _top_level_call_names(node: ProgramNode) -> set[str]:
  ast_node = node.ast_node
  if ast_node is None:
    try:
      ast_node = ast.parse(node.code_snippet)
    except SyntaxError:
      return set()

  names: set[str] = set()
  for child in ast.walk(ast_node):
    if isinstance(child, ast.Call):
      name = _dotted_name(child.func)
      if name:
        names.add(name)
  return names


def _dotted_name(node: ast.AST) -> str | None:
  if isinstance(node, ast.Name):
    return node.id

  if isinstance(node, ast.Attribute):
    base_name = _dotted_name(node.value)
    if base_name is None:
      return None
    return f"{base_name}.{node.attr}"

  return None


def _dependency_edges(relevant_nodes: list[ProgramNode]) -> list[DependencyEdge]:
  edges: list[DependencyEdge] = []

  for target_index, target_node in enumerate(relevant_nodes):
    for variable in target_node.uses:
      source_node = _latest_prior_definition(relevant_nodes, target_index, variable)
      if source_node is None:
        continue

      edges.append(
        DependencyEdge(
          source=source_node.node_id,
          target=target_node.node_id,
          variable=variable,
        )
      )

  return edges


def _latest_prior_definition(
  relevant_nodes: list[ProgramNode],
  target_index: int,
  variable: str,
) -> ProgramNode | None:
  for source_node in reversed(relevant_nodes[:target_index]):
    if variable in source_node.defines:
      return source_node

  return None
