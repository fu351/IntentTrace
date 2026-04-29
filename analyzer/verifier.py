from __future__ import annotations

from typing import Any

from schemas import SemanticOperation, VerificationWarning


def verify_semantics(
  semantic_ops: list[SemanticOperation],
  intent: dict[str, Any],
  schema: dict[str, Any] | None = None,
) -> list[VerificationWarning]:
  _ = schema
  warnings: list[VerificationWarning] = []

  expected_aggregation = _intent_string(intent, "aggregation")
  if expected_aggregation:
    for operation in _sliced_ops(semantic_ops, "Aggregate"):
      actual = _normalized_string(operation.params.get("function"))
      if actual and actual != expected_aggregation:
        warnings.append(
          _warning(
            kind="wrong_aggregation",
            severity="error",
            operation=operation,
            title="Aggregation does not match",
            user_message=f"The code uses {actual}, but the intent asks for {expected_aggregation}.",
            technical_message="Sliced Aggregate operation params.function differs from intent.aggregation.",
            expected=expected_aggregation,
            actual=actual,
          )
        )

  expected_chart_type = _intent_string(intent, "chartType")
  if expected_chart_type:
    for operation in _sliced_ops(semantic_ops, "Plot"):
      actual = _normalized_chart_type(operation.params.get("chartType"))
      if actual and actual != expected_chart_type:
        warnings.append(
          _warning(
            kind="wrong_chart_type",
            severity="error",
            operation=operation,
            title="Chart type does not match",
            user_message=f"The code draws a {actual} chart, but the intent asks for {expected_chart_type}.",
            technical_message="Sliced Plot operation params.chartType differs from intent.chartType.",
            expected=expected_chart_type,
            actual=actual,
          )
        )

  expected_group_by = _intent_list(intent, "groupBy")
  if expected_group_by:
    for operation in _sliced_ops(semantic_ops, "GroupBy"):
      actual = _normalized_list(operation.params.get("groupBy"))
      missing = [column for column in expected_group_by if column not in actual]
      if missing:
        warnings.append(
          _warning(
            kind="wrong_grouping",
            severity="error",
            operation=operation,
            title="Grouping does not match",
            user_message=f"The code is missing grouping by {_human_list(missing)}.",
            technical_message="Sliced GroupBy operation params.groupBy does not contain all intent.groupBy columns.",
            expected=expected_group_by,
            actual=actual,
          )
        )

  expected_measure = _intent_string(intent, "measure")
  if expected_measure:
    _append_measure_warnings(warnings, semantic_ops, expected_measure)

  for operation in semantic_ops:
    if not operation.in_slice:
      warnings.append(
        _warning(
          kind="vestigial_code",
          severity="info",
          operation=operation,
          title="Code is outside the selected slice",
          user_message="This operation does not affect the selected visualization.",
          technical_message="Semantic operation has inSlice=false.",
          expected="operation in selected computation",
          actual="operation outside selected computation",
        )
      )
    elif operation.kind == "Unknown":
      warnings.append(
        _warning(
          kind="unsupported_pattern",
          severity="warning",
          operation=operation,
          title="Unsupported code pattern",
          user_message="IntentTrace cannot yet explain this sliced statement.",
          technical_message="Sliced semantic operation kind is Unknown.",
          expected="supported semantic operation",
          actual=operation.params.get("astType", "Unknown"),
        )
      )

  return _with_warning_ids(warnings)


def _append_measure_warnings(
  warnings: list[VerificationWarning],
  semantic_ops: list[SemanticOperation],
  expected_measure: str,
) -> None:
  for operation in _sliced_ops(semantic_ops, "Aggregate"):
    actual = _normalized_string(operation.params.get("measure"))
    if actual and actual != expected_measure:
      warnings.append(
        _warning(
          kind="wrong_measure",
          severity="error",
          operation=operation,
          title="Measure does not match",
          user_message=f"The code aggregates {actual}, but the intent asks for {expected_measure}.",
          technical_message="Sliced Aggregate operation params.measure differs from intent.measure.",
          expected=expected_measure,
          actual=actual,
        )
      )

  for operation in _sliced_ops(semantic_ops, "Plot"):
    actual_columns = _normalized_list(operation.params.get("columnsUsed"))
    if actual_columns and expected_measure not in actual_columns:
      warnings.append(
        _warning(
          kind="wrong_measure",
          severity="error",
          operation=operation,
          title="Plotted measure does not match",
          user_message=f"The chart does not plot {expected_measure}.",
          technical_message="Sliced Plot operation params.columnsUsed does not include intent.measure.",
          expected=expected_measure,
          actual=actual_columns,
        )
      )


def _warning(
  *,
  kind: str,
  severity: str,
  operation: SemanticOperation,
  title: str,
  user_message: str,
  technical_message: str,
  expected: Any,
  actual: Any,
) -> VerificationWarning:
  return VerificationWarning(
    warning_id="",
    kind=kind,
    severity=severity,
    op_id=operation.op_id,
    node_ids=operation.source_node_ids,
    source_spans=operation.source_spans,
    title=title,
    user_message=user_message,
    technical_message=technical_message,
    expected=expected,
    actual=actual,
  )


def _with_warning_ids(warnings: list[VerificationWarning]) -> list[VerificationWarning]:
  return [
    VerificationWarning(
      warning_id=f"warning-{index}",
      kind=warning.kind,
      severity=warning.severity,
      op_id=warning.op_id,
      node_ids=warning.node_ids,
      source_spans=warning.source_spans,
      title=warning.title,
      user_message=warning.user_message,
      technical_message=warning.technical_message,
      expected=warning.expected,
      actual=warning.actual,
    )
    for index, warning in enumerate(warnings, start=1)
  ]


def _sliced_ops(semantic_ops: list[SemanticOperation], kind: str) -> list[SemanticOperation]:
  return [
    operation
    for operation in semantic_ops
    if operation.in_slice and operation.kind == kind
  ]


def _intent_string(intent: dict[str, Any], key: str) -> str | None:
  direct = _normalized_chart_type(intent.get(key)) if key == "chartType" else _normalized_string(intent.get(key))
  if direct:
    return direct

  expected_visualization = intent.get("expectedVisualization")
  if isinstance(expected_visualization, dict):
    nested = expected_visualization.get(key)
    if key == "chartType":
      return _normalized_chart_type(nested)
    return _normalized_string(nested)

  return None


def _intent_list(intent: dict[str, Any], key: str) -> list[str]:
  direct = _normalized_list(intent.get(key))
  if direct:
    return direct

  expected_visualization = intent.get("expectedVisualization")
  if isinstance(expected_visualization, dict):
    return _normalized_list(expected_visualization.get(key))

  return []


def _normalized_string(value: Any) -> str | None:
  if isinstance(value, str) and value.strip():
    return value.strip().lower()
  return None


def _normalized_chart_type(value: Any) -> str | None:
  normalized = _normalized_string(value)
  if normalized == "hist":
    return "histogram"
  return normalized


def _normalized_list(value: Any) -> list[str]:
  if isinstance(value, str):
    normalized = _normalized_string(value)
    return [normalized] if normalized else []

  if isinstance(value, list):
    normalized_values = [
      normalized
      for item in value
      if (normalized := _normalized_string(item))
    ]
    return normalized_values

  return []


def _human_list(values: list[str]) -> str:
  if not values:
    return ""
  if len(values) == 1:
    return values[0]
  return ", ".join(values[:-1]) + f" and {values[-1]}"
