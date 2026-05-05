from __future__ import annotations

import ast
from typing import Any

from dataflow import DataflowAnalyzer, Provenance
from schemas import ProgramNode, VisualizationSink


SUPPORTED_CALLS = {
  "plt.plot": "line",
  "plt.bar": "bar",
  "plt.scatter": "scatter",
  "plt.hist": "histogram",
  "matplotlib.pyplot.plot": "line",
  "matplotlib.pyplot.bar": "bar",
  "matplotlib.pyplot.scatter": "scatter",
  "matplotlib.pyplot.hist": "histogram",
}


def detect_visualization_sinks(program_nodes: list[ProgramNode]) -> list[VisualizationSink]:
  sinks: list[VisualizationSink] = []
  analyzer = DataflowAnalyzer()

  for node in program_nodes:
    ast_node = node.ast_node or _parse_node_snippet(node)
    if ast_node is None:
      continue

    # Run a small dataflow analysis on the statement to find plot calls and provenance
    try:
      module = ast.Module(body=[ast_node], type_ignores=[])
      df_result = analyzer.analyze(module)
      candidates = analyzer.find_plot_sinks(module, df_result)
    except Exception:
      # Fallback to previous simple iteration on failure
      candidates = [(call, Provenance(origins=set(), taints=set(), confidence=0.0)) for call in _iter_supported_plot_calls(ast_node)]

    for call, prov in candidates:
      call_name = _dotted_name(call.func)
      if call_name is None:
        continue

      # simple heuristic mapping for unknown dotted names
      chart_type = SUPPORTED_CALLS.get(call_name)
      if chart_type is None:
        lname = call_name.lower()
        if 'hist' in lname:
          chart_type = 'histogram'
        elif 'bar' in lname:
          chart_type = 'bar'
        elif 'scatter' in lname:
          chart_type = 'scatter'
        elif 'plot' in lname:
          chart_type = 'line'
        else:
          # unknown chart type; skip
          continue

      sinks.append(
        VisualizationSink(
          sink_id=f"sink-{len(sinks) + 1}",
          node_id=node.node_id,
          source_span=node.span,
          call_name=call_name,
          variables_used=_variables_used_in_call(call),
          columns_used=_columns_used_in_call(call),
          inferred_chart_type=chart_type,
          provenance_origins=sorted(list(prov.origins)) if prov else [],
          provenance_confidence=prov.confidence if prov else 0.0,
        )
      )

  return sinks


def select_sink(
  sinks: list[VisualizationSink],
  intent: dict[str, Any] | None = None,
) -> VisualizationSink | None:
  if not sinks:
    return None

  if len(sinks) == 1:
    return sinks[0]

  intended_chart_type = _intent_chart_type(intent)
  if intended_chart_type:
    for sink in sinks:
      if sink.inferred_chart_type == intended_chart_type:
        return sink
  # fallback: pick the sink with highest provenance_confidence
  best = max(sinks, key=lambda s: getattr(s, "provenance_confidence", 0.0))
  return best


def _iter_supported_plot_calls(node: ast.AST) -> list[ast.Call]:
  calls: list[ast.Call] = []

  for child in ast.walk(node):
    if not isinstance(child, ast.Call):
      continue

    call_name = _dotted_name(child.func)
    if call_name in SUPPORTED_CALLS:
      calls.append(child)

  return calls


def _parse_node_snippet(node: ProgramNode) -> ast.AST | None:
  try:
    return ast.parse(node.code_snippet)
  except SyntaxError:
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


def _variables_used_in_call(call: ast.Call) -> list[str]:
  variables: set[str] = set()

  for value in _call_data_arguments(call):
    for child in ast.walk(value):
      if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load):
        variables.add(child.id)

  return sorted(variables)


def _columns_used_in_call(call: ast.Call) -> list[str]:
  columns: set[str] = set()

  for value in _call_data_arguments(call):
    for child in ast.walk(value):
      if isinstance(child, ast.Subscript):
        column_name = _constant_string(child.slice)
        if column_name:
          columns.add(column_name)

  return sorted(columns)


def _call_data_arguments(call: ast.Call) -> list[ast.AST]:
  values: list[ast.AST] = [*call.args]
  values.extend(keyword.value for keyword in call.keywords)
  return values


def _constant_string(node: ast.AST) -> str | None:
  if isinstance(node, ast.Constant) and isinstance(node.value, str):
    return node.value

  return None


def _intent_chart_type(intent: dict[str, Any] | None) -> str | None:
  if not intent:
    return None

  chart_type = intent.get("chartType")
  if isinstance(chart_type, str):
    return _normalize_chart_type(chart_type)

  expected_visualization = intent.get("expectedVisualization")
  if isinstance(expected_visualization, dict):
    nested_chart_type = expected_visualization.get("chartType")
    if isinstance(nested_chart_type, str):
      return _normalize_chart_type(nested_chart_type)

  return None


def _normalize_chart_type(chart_type: str) -> str:
  normalized = chart_type.strip().lower()
  if normalized == "hist":
    return "histogram"
  return normalized
