from __future__ import annotations

import ast
from typing import Any

from schemas import ProgramNode, SemanticOperation, SliceResult


PLOT_CHART_TYPES = {
  "plt.plot": "line",
  "plt.bar": "bar",
  "plt.scatter": "scatter",
  "plt.hist": "histogram",
  "matplotlib.pyplot.plot": "line",
  "matplotlib.pyplot.bar": "bar",
  "matplotlib.pyplot.scatter": "scatter",
  "matplotlib.pyplot.hist": "histogram",
}


def lower_to_semantic_operations(slice_result: SliceResult) -> list[SemanticOperation]:
  operations: list[SemanticOperation] = []
  relevant_node_ids = set(slice_result.relevant_node_ids)

  for node in slice_result.nodes:
    lowered = _lower_node(node, node.node_id in relevant_node_ids)
    operations.extend(_with_op_ids(lowered, start=len(operations) + 1))

  return operations


def _with_op_ids(operations: list[SemanticOperation], start: int) -> list[SemanticOperation]:
  return [
    SemanticOperation(
      op_id=f"op-{index}",
      kind=operation.kind,
      label=operation.label,
      lay_description=operation.lay_description,
      source_node_ids=operation.source_node_ids,
      source_spans=operation.source_spans,
      params=operation.params,
      in_slice=operation.in_slice,
    )
    for index, operation in enumerate(operations, start=start)
  ]


def _lower_node(node: ProgramNode, in_slice: bool) -> list[SemanticOperation]:
  ast_node = node.ast_node or _parse_node_snippet(node)
  if ast_node is None:
    return [_unknown_operation(node, in_slice)]
  _attach_parent_links(ast_node)

  read_csv = _find_call(ast_node, {"pd.read_csv", "pandas.read_csv"})
  if read_csv is not None:
    return [_read_csv_operation(node, read_csv, in_slice)]

  dropna = _find_method_call(ast_node, {"dropna"})
  if dropna is not None:
    return [_dropna_operation(node, dropna, in_slice)]

  groupby = _find_method_call(ast_node, {"groupby"})
  aggregate = _find_method_call(ast_node, {"mean", "count", "agg"})
  if groupby is not None and aggregate is not None:
    return [
      _groupby_operation(node, groupby, in_slice),
      _aggregate_operation(node, groupby, aggregate, in_slice),
    ]

  plot = _find_call(ast_node, set(PLOT_CHART_TYPES))
  if plot is not None:
    return [_plot_operation(node, plot, in_slice)]

  show_plot = _find_call(ast_node, {"plt.show", "matplotlib.pyplot.show"})
  if show_plot is not None:
    return [_show_plot_operation(node, in_slice)]

  return [_unknown_operation(node, in_slice)]


def _read_csv_operation(node: ProgramNode, call: ast.Call, in_slice: bool) -> SemanticOperation:
  source = _first_string_argument(call)
  return _operation(
    kind="ReadCSV",
    label=f"Load {source}" if source else "Load CSV data",
    lay_description=f"Read the weather data from {source}." if source else "Read rows from a CSV file.",
    node=node,
    in_slice=in_slice,
    params={"source": source, "output": _first_or_none(node.defines)},
  )


def _dropna_operation(node: ProgramNode, call: ast.Call, in_slice: bool) -> SemanticOperation:
  subset = _keyword_string_list(call, "subset")
  return _operation(
    kind="DropNA",
    label="Remove incomplete rows",
    lay_description=_dropna_description(subset),
    node=node,
    in_slice=in_slice,
    params={"subset": subset, "input": _base_object_name(call), "output": _first_or_none(node.defines)},
  )


def _groupby_operation(node: ProgramNode, call: ast.Call, in_slice: bool) -> SemanticOperation:
  group_columns = _string_arguments(call)
  return _operation(
    kind="GroupBy",
    label=f"Group by {_human_list(group_columns)}" if group_columns else "Group rows",
    lay_description=f"Put rows with the same {_human_list(group_columns)} together." if group_columns else "Put related rows into groups.",
    node=node,
    in_slice=in_slice,
    params={"groupBy": group_columns, "input": _base_object_name(call)},
  )


def _aggregate_operation(
  node: ProgramNode,
  groupby_call: ast.Call,
  aggregate_call: ast.Call,
  in_slice: bool,
) -> SemanticOperation:
  method = _method_name(aggregate_call) or "aggregate"
  measure = _measure_column(groupby_call) or _agg_measure(aggregate_call)
  params = {
    "function": "aggregate" if method == "agg" else method,
    "measure": measure,
    "output": _first_or_none(node.defines),
  }
  if method == "agg":
    params["spec"] = _simple_agg_spec(aggregate_call)

  return _operation(
    kind="Aggregate",
    label=_aggregate_label(params["function"], measure),
    lay_description=_aggregate_description(params["function"], measure),
    node=node,
    in_slice=in_slice,
    params=params,
  )


def _plot_operation(node: ProgramNode, call: ast.Call, in_slice: bool) -> SemanticOperation:
  call_name = _dotted_name(call.func) or "plot"
  chart_type = PLOT_CHART_TYPES[call_name]
  columns = _columns_used_in_call(call)
  return _operation(
    kind="Plot",
    label=f"{_chart_label(chart_type)} chart",
    lay_description=f"Draw a {_chart_label(chart_type).lower()} chart for the selected result.",
    node=node,
    in_slice=in_slice,
    params={
      "chartType": chart_type,
      "callName": call_name,
      "variablesUsed": _variables_used_in_call(call),
      "columnsUsed": columns,
    },
  )


def _show_plot_operation(node: ProgramNode, in_slice: bool) -> SemanticOperation:
  return _operation(
    kind="Unknown",
    label="Show chart",
    lay_description="Display the chart that was created in the previous step.",
    node=node,
    in_slice=in_slice,
    params={"astType": node.ast_type, "displayOnly": True},
  )


def _unknown_operation(node: ProgramNode, in_slice: bool) -> SemanticOperation:
  label, description = _unknown_label_and_description(node)
  return _operation(
    kind="Unknown",
    label=label,
    lay_description=description,
    node=node,
    in_slice=in_slice,
    params={"astType": node.ast_type, "codeSnippet": node.code_snippet},
  )


def _operation(
  *,
  kind: str,
  label: str,
  lay_description: str,
  node: ProgramNode,
  in_slice: bool,
  params: dict[str, Any],
) -> SemanticOperation:
  return SemanticOperation(
    op_id="",
    kind=kind,
    label=label,
    lay_description=lay_description,
    source_node_ids=[node.node_id],
    source_spans=[node.span],
    params=params,
    in_slice=in_slice,
  )


def _parse_node_snippet(node: ProgramNode) -> ast.AST | None:
  try:
    return ast.parse(node.code_snippet)
  except SyntaxError:
    return None


def _find_call(node: ast.AST, call_names: set[str]) -> ast.Call | None:
  for child in ast.walk(node):
    if isinstance(child, ast.Call) and _dotted_name(child.func) in call_names:
      return child
  return None


def _find_method_call(node: ast.AST, method_names: set[str]) -> ast.Call | None:
  for child in ast.walk(node):
    if isinstance(child, ast.Call) and _method_name(child) in method_names:
      return child
  return None


def _dotted_name(node: ast.AST) -> str | None:
  if isinstance(node, ast.Name):
    return node.id

  if isinstance(node, ast.Attribute):
    base_name = _dotted_name(node.value)
    if base_name is None:
      return None
    return f"{base_name}.{node.attr}"

  return None


def _method_name(call: ast.Call) -> str | None:
  if isinstance(call.func, ast.Attribute):
    return call.func.attr
  return None


def _base_object_name(call: ast.Call) -> str | None:
  if not isinstance(call.func, ast.Attribute):
    return None

  value = call.func.value
  while isinstance(value, ast.Call) and isinstance(value.func, ast.Attribute):
    value = value.func.value

  if isinstance(value, ast.Name):
    return value.id

  return None


def _first_string_argument(call: ast.Call) -> str | None:
  if not call.args:
    return None
  return _constant_string(call.args[0])


def _string_arguments(call: ast.Call) -> list[str]:
  values: list[str] = []
  for argument in call.args:
    values.extend(_string_values(argument))
  return values


def _keyword_string_list(call: ast.Call, keyword_name: str) -> list[str]:
  for keyword in call.keywords:
    if keyword.arg == keyword_name:
      return _string_values(keyword.value)
  return []


def _string_values(node: ast.AST) -> list[str]:
  if isinstance(node, ast.Constant) and isinstance(node.value, str):
    return [node.value]

  if isinstance(node, (ast.List, ast.Tuple)):
    values: list[str] = []
    for element in node.elts:
      values.extend(_string_values(element))
    return values

  return []


def _constant_string(node: ast.AST) -> str | None:
  if isinstance(node, ast.Constant) and isinstance(node.value, str):
    return node.value
  return None


def _measure_column(groupby_call: ast.Call) -> str | None:
  parent = getattr(groupby_call, "parent", None)
  if isinstance(parent, ast.Subscript):
    return _constant_string(parent.slice)
  return None


def _agg_measure(call: ast.Call) -> str | None:
  spec = _simple_agg_spec(call)
  if not spec:
    return None
  return next(iter(spec.keys()))


def _simple_agg_spec(call: ast.Call) -> dict[str, str]:
  if not call.args or not isinstance(call.args[0], ast.Dict):
    return {}

  spec: dict[str, str] = {}
  for key, value in zip(call.args[0].keys, call.args[0].values):
    key_name = _constant_string(key) if key else None
    value_name = _constant_string(value)
    if key_name and value_name:
      spec[key_name] = value_name

  return spec


def _variables_used_in_call(call: ast.Call) -> list[str]:
  variables: set[str] = set()
  for value in [*call.args, *(keyword.value for keyword in call.keywords)]:
    for child in ast.walk(value):
      if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load):
        variables.add(child.id)
  return sorted(variables)


def _columns_used_in_call(call: ast.Call) -> list[str]:
  columns: set[str] = set()
  for value in [*call.args, *(keyword.value for keyword in call.keywords)]:
    for child in ast.walk(value):
      if isinstance(child, ast.Subscript):
        column = _constant_string(child.slice)
        if column:
          columns.add(column)
  return sorted(columns)


def _first_or_none(values: list[str]) -> str | None:
  return values[0] if values else None


def _human_list(values: list[str]) -> str:
  if not values:
    return ""
  if len(values) == 1:
    return values[0]
  return ", ".join(values[:-1]) + f" and {values[-1]}"


def _dropna_description(subset: list[str]) -> str:
  if subset:
    return f"Keep only rows that have {_human_list(subset)} values."
  return "Remove rows with missing values."


def _aggregate_description(function: str, measure: str | None) -> str:
  function_label = _aggregation_label(function)
  if measure:
    return f"Calculate the {function_label} of {measure} for each group."
  return f"Calculate the {function_label} for each group."


def _aggregate_label(function: str, measure: str | None) -> str:
  label = _aggregation_label(function)
  if measure:
    return f"{label.capitalize()} {measure}"
  return f"{label.capitalize()} values"


def _aggregation_label(function: str) -> str:
  labels = {
    "mean": "average",
    "count": "count",
    "sum": "total",
    "aggregate": "summary",
  }
  return labels.get(function, function)


def _chart_label(chart_type: str) -> str:
  labels = {
    "line": "Line",
    "bar": "Bar",
    "scatter": "Scatter",
    "histogram": "Histogram",
  }
  return labels.get(chart_type, chart_type.capitalize())


def _unknown_label_and_description(node: ProgramNode) -> tuple[str, str]:
  snippet = node.code_snippet.strip()
  if "print(" in snippet:
    return "Print preview", "Print a quick preview for the developer; it does not build the final chart."
  if ".copy(" in snippet:
    return "Backup copy", "Make a copy of the data; this copy is not used by the final chart."
  return "Other code", "This statement is outside the small pandas/matplotlib patterns IntentTrace explains today."


def _attach_parent_links(node: ast.AST) -> None:
  for parent in ast.walk(node):
    for child in ast.iter_child_nodes(parent):
      setattr(child, "parent", parent)
