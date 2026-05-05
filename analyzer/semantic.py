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

PLOT_FORMATTING_CALLS = {
  "plt.xlabel": ("xLabel", "Label x-axis", "Label the horizontal axis"),
  "plt.ylabel": ("yLabel", "Label y-axis", "Label the vertical axis"),
  "plt.title": ("title", "Set chart title", "Set the chart title"),
  "plt.legend": ("legend", "Show legend", "Show a legend for the chart"),
  "plt.xticks": ("xTicks", "Format x-axis ticks", "Adjust the horizontal-axis tick labels"),
  "plt.yticks": ("yTicks", "Format y-axis ticks", "Adjust the vertical-axis tick labels"),
  "plt.tight_layout": ("layout", "Tighten chart layout", "Adjust spacing so chart labels fit"),
  "plt.grid": ("grid", "Set chart grid", "Turn chart grid lines on or off"),
  "matplotlib.pyplot.xlabel": ("xLabel", "Label x-axis", "Label the horizontal axis"),
  "matplotlib.pyplot.ylabel": ("yLabel", "Label y-axis", "Label the vertical axis"),
  "matplotlib.pyplot.title": ("title", "Set chart title", "Set the chart title"),
  "matplotlib.pyplot.legend": ("legend", "Show legend", "Show a legend for the chart"),
  "matplotlib.pyplot.xticks": ("xTicks", "Format x-axis ticks", "Adjust the horizontal-axis tick labels"),
  "matplotlib.pyplot.yticks": ("yTicks", "Format y-axis ticks", "Adjust the vertical-axis tick labels"),
  "matplotlib.pyplot.tight_layout": ("layout", "Tighten chart layout", "Adjust spacing so chart labels fit"),
  "matplotlib.pyplot.grid": ("grid", "Set chart grid", "Turn chart grid lines on or off"),
}


def lower_to_semantic_operations(slice_result: SliceResult, sinks: list | None = None) -> list[SemanticOperation]:
  operations: list[SemanticOperation] = []
  relevant_node_ids = set(slice_result.relevant_node_ids)
  sinks_by_node = {s.node_id: s for s in (sinks or [])}

  for node in slice_result.nodes:
    lowered = _lower_node(node, node.node_id in relevant_node_ids, sinks_by_node)
    operations.extend(lowered)

  return _with_op_ids(_coalesce_plot_formatting(operations), start=1)


def _coalesce_plot_formatting(operations: list[SemanticOperation]) -> list[SemanticOperation]:
  coalesced: list[SemanticOperation] = []
  pending: list[SemanticOperation] = []

  def flush_pending() -> None:
    if not pending:
      return
    coalesced.append(_combined_plot_formatting(pending) if len(pending) > 1 else pending[0])
    pending.clear()

  for operation in operations:
    if operation.kind == "PlotFormatting":
      pending.append(operation)
      continue

    flush_pending()
    coalesced.append(operation)

  flush_pending()
  return coalesced


def _combined_plot_formatting(operations: list[SemanticOperation]) -> SemanticOperation:
  formats = [
    {
      "formatType": operation.params.get("formatType"),
      "value": operation.params.get("value"),
      "callName": operation.params.get("callName"),
    }
    for operation in operations
  ]
  values = {
    str(item["formatType"]): item["value"]
    for item in formats
    if item.get("formatType") and item.get("value") is not None
  }
  format_types = [
    str(item["formatType"])
    for item in formats
    if item.get("formatType")
  ]
  return SemanticOperation(
    op_id="",
    kind="PlotFormatting",
    label="Plot formatting",
    lay_description=_plot_formatting_description(format_types),
    source_node_ids=[
      node_id
      for operation in operations
      for node_id in operation.source_node_ids
    ],
    source_spans=[
      span
      for operation in operations
      for span in operation.source_spans
    ],
    params={
      "formats": formats,
      "values": values,
      "formatTypes": format_types,
    },
    in_slice=any(operation.in_slice for operation in operations),
  )


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


def _lower_node(node: ProgramNode, in_slice: bool, sinks_by_node: dict[str, "VisualizationSink"] | None = None) -> list[SemanticOperation]:
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

  select_cols = _find_select_columns(ast_node)
  if select_cols is not None:
    return [_select_columns_operation(node, select_cols, in_slice)]

  filter_rows = _find_filter_rows(ast_node)
  if filter_rows is not None:
    return [_filter_rows_operation(node, filter_rows, in_slice)]

  sort_call = _find_sort_values(ast_node)
  if sort_call is not None:
    return [_sort_operation(node, sort_call, in_slice)]

  parse_date = _find_parse_date(ast_node)
  if parse_date is not None:
    return [_parse_date_operation(node, parse_date, in_slice)]

  groupby = _find_method_call(ast_node, {"groupby"})
  aggregate = _find_method_call(ast_node, {"mean", "count", "agg"})
  if groupby is not None and aggregate is not None:
    return [
      _groupby_operation(node, groupby, in_slice),
      _aggregate_operation(node, groupby, aggregate, in_slice),
    ]

  plot = _find_call(ast_node, set(PLOT_CHART_TYPES))
  if plot is not None:
    return [_plot_operation(node, plot, in_slice, sinks_by_node)]

  plot_formatting = _find_call(ast_node, set(PLOT_FORMATTING_CALLS))
  if plot_formatting is not None:
    return [_plot_formatting_operation(node, plot_formatting, in_slice)]

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


def _plot_operation(node: ProgramNode, call: ast.Call, in_slice: bool, sinks_by_node: dict[str, "VisualizationSink"] | None = None) -> SemanticOperation:
  call_name = _dotted_name(call.func) or "plot"
  chart_type = PLOT_CHART_TYPES[call_name]
  columns = _columns_used_in_call(call)
  params = {
    "chartType": chart_type,
    "callName": call_name,
    "variablesUsed": _variables_used_in_call(call),
    "columnsUsed": columns,
  }
  # attach provenance if available from sinks
  if sinks_by_node and node.node_id in sinks_by_node:
    sink = sinks_by_node[node.node_id]
    params["provenanceOrigins"] = getattr(sink, "provenance_origins", [])
    params["provenanceConfidence"] = getattr(sink, "provenance_confidence", 0.0)

  return _operation(
    kind="Plot",
    label=f"{_chart_label(chart_type)} chart",
    lay_description=f"Draw a {_chart_label(chart_type).lower()} chart for the selected result.",
    node=node,
    in_slice=in_slice,
    params=params,
  )


def _plot_formatting_operation(node: ProgramNode, call: ast.Call, in_slice: bool) -> SemanticOperation:
  call_name = _dotted_name(call.func) or "plot formatting"
  format_type, label, description = PLOT_FORMATTING_CALLS[call_name]
  value = _first_string_argument(call)
  return _operation(
    kind="PlotFormatting",
    label=label,
    lay_description=f'{description} as "{value}".' if value else f"{description}.",
    node=node,
    in_slice=in_slice,
    params={
      "formatType": format_type,
      "value": value,
      "callName": call_name,
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


def _find_select_columns(node: ast.AST) -> ast.AST | None:
  # detect patterns like df[['a','b']] or df.drop(columns=[...])
  for child in ast.walk(node):
    # bracket selection with list/tuple of strings: df[['a','b']]
    if isinstance(child, ast.Subscript):
      value = child.value
      if isinstance(value, ast.Name) and isinstance(child.slice, (ast.List, ast.Tuple)):
        if all(isinstance(el, ast.Constant) and isinstance(el.value, str) for el in child.slice.elts):
          return child

    # method call .drop(..., axis=1) or .drop(columns=[...])
    if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute) and child.func.attr == "drop":
      # check keywords
      cols = _keyword_string_list(child, "columns")
      if cols:
        return child
      # axis=1 with first arg(s)
      for kw in child.keywords:
        if kw.arg == "axis":
          if isinstance(kw.value, ast.Constant) and kw.value.value == 1:
            return child
      # positional first arg could be column name or list
      if child.args:
        first = child.args[0]
        if isinstance(first, (ast.Constant, ast.List, ast.Tuple)):
          return child

  return None


def _find_filter_rows(node: ast.AST) -> ast.AST | None:
  # detect boolean indexing df[cond] or df.query(...)
  for child in ast.walk(node):
    # bracket with condition: df[ something that's not a simple string/list slice ]
    if isinstance(child, ast.Subscript):
      # if the slice is a Compare, BoolOp, Call, Name, UnaryOp, etc. treat as filter
      sl = child.slice
      if not isinstance(sl, (ast.Constant, ast.List, ast.Tuple)):
        # avoid column selection which uses Constant or List/Tuple of strings
        return child

    # df.query('...')
    if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute) and child.func.attr == "query":
      return child

  return None


def _columns_in_expr(node: ast.AST) -> list[str]:
  cols: set[str] = set()
  for child in ast.walk(node):
    if isinstance(child, ast.Subscript):
      col = _constant_string(child.slice)
      if col:
        cols.add(col)
  return sorted(cols)


def _select_columns_operation(node: ProgramNode, expr: ast.AST, in_slice: bool) -> SemanticOperation:
  # expr may be a Subscript or a Call (drop)
  columns: list[str] = []
  input_name = None
  if isinstance(expr, ast.Subscript):
    if isinstance(expr.value, ast.Name):
      input_name = expr.value.id
    columns = _string_values(expr.slice) if hasattr(expr, "slice") else []
  elif isinstance(expr, ast.Call):
    # drop or other call
    input_name = _base_object_name(expr) or _base_object_name(expr)
    columns = _keyword_string_list(expr, "columns") or _string_arguments(expr)

  return _operation(
    kind="SelectColumns",
    label=f"Select columns ({_human_list(columns)})" if columns else "Select columns",
    lay_description=f"Select the columns {_human_list(columns)} from the input." if columns else "Select a subset of columns.",
    node=node,
    in_slice=in_slice,
    params={
      "columns": columns,
      "input": input_name,
      "output": _first_or_none(node.defines),
    },
  )


def _filter_rows_operation(node: ProgramNode, expr: ast.AST, in_slice: bool) -> SemanticOperation:
  # expr may be Subscript or Call(query)
  input_name = None
  columns: list[str] = []
  if isinstance(expr, ast.Subscript):
    if isinstance(expr.value, ast.Name):
      input_name = expr.value.id
    columns = _columns_in_expr(expr.slice) if hasattr(expr, "slice") else []
  elif isinstance(expr, ast.Call) and isinstance(expr.func, ast.Attribute) and expr.func.attr == "query":
    input_name = _base_object_name(expr) or None
    # try to extract columns from string - not reliable; leave empty
    columns = []

  return _operation(
    kind="FilterRows",
    label="Filter rows",
    lay_description="Keep only rows matching the filter condition.",
    node=node,
    in_slice=in_slice,
    params={
      "input": input_name,
      "columns": columns,
      "astType": node.ast_type,
    },
  )


def _find_sort_values(node: ast.AST) -> ast.Call | None:
  for child in ast.walk(node):
    if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
      if child.func.attr in ("sort_values", "sort_index"):
        return child
  return None


def _sort_operation(node: ProgramNode, call: ast.Call, in_slice: bool) -> SemanticOperation:
  # extract 'by' argument (list or string)
  cols = _keyword_string_list(call, "by") or _string_arguments(call)
  asc = None
  for kw in call.keywords:
    if kw.arg == "ascending" and isinstance(kw.value, ast.Constant):
      asc = kw.value.value

  input_name = _base_object_name(call) or None
  return _operation(
    kind="Sort",
    label=f"Sort by {_human_list(cols)}" if cols else "Sort",
    lay_description="Sort the rows by the specified columns.",
    node=node,
    in_slice=in_slice,
    params={
      "by": cols,
      "ascending": asc,
      "input": input_name,
      "output": _first_or_none(node.defines),
    },
  )


def _find_parse_date(node: ast.AST) -> ast.Call | None:
  # detect pd.to_datetime(...) or read_csv(parse_dates=...)
  for child in ast.walk(node):
    if isinstance(child, ast.Call):
      # pd.to_datetime or to_datetime
      func = child.func
      if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.attr == "to_datetime":
        return child
      if isinstance(func, ast.Name) and func.id == "to_datetime":
        return child
      # read_csv(parse_dates=...)
      if isinstance(func, ast.Attribute) and func.attr == "read_csv":
        for kw in child.keywords:
          if kw.arg == "parse_dates":
            return child
  return None


def _parse_date_operation(node: ProgramNode, call: ast.Call, in_slice: bool) -> SemanticOperation:
  cols: list[str] = []
  format_str = None
  func = call.func
  # pd.to_datetime(series) -> try to extract column from arg
  if isinstance(func, ast.Attribute) and func.attr == "to_datetime":
    if call.args:
      cols = _columns_in_expr(call.args[0])
    for kw in call.keywords:
      if kw.arg == "format" and isinstance(kw.value, ast.Constant):
        format_str = kw.value.value

  # read_csv(parse_dates=[...])
  if isinstance(func, ast.Attribute) and func.attr == "read_csv":
    pdates = _keyword_string_list(call, "parse_dates")
    if pdates:
      cols = pdates

  return _operation(
    kind="ParseDate",
    label=f"Parse dates ({_human_list(cols)})" if cols else "Parse dates",
    lay_description="Convert string columns into datetime types.",
    node=node,
    in_slice=in_slice,
    params={
      "columns": cols,
      "format": format_str,
      "input": _base_object_name(call) or None,
      "output": _first_or_none(node.defines),
    },
  )


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


def _plot_formatting_description(format_types: list[str]) -> str:
  labels = {
    "xLabel": "x-axis label",
    "yLabel": "y-axis label",
    "title": "title",
    "legend": "legend",
    "xTicks": "x-axis ticks",
    "yTicks": "y-axis ticks",
    "layout": "layout",
    "grid": "grid",
  }
  readable = [
    labels.get(format_type, format_type)
    for format_type in format_types
  ]
  return f"Set the chart {_human_list(readable)}."


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
