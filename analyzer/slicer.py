from __future__ import annotations

from schemas import DependencyEdge, ProgramNode, SliceResult, SlicingCriterion, VisualizationSink


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
  next_index = target_index + 1
  if next_index >= len(program_nodes):
    return set()

  next_node = program_nodes[next_index]
  if next_node.code_snippet.strip() in {"plt.show()", "matplotlib.pyplot.show()"}:
    return {next_index}

  return set()


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
