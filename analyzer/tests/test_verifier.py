from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ANALYZER_DIR = REPO_ROOT / "analyzer"
sys.path.insert(0, str(ANALYZER_DIR))

from schemas import SemanticOperation, SourceSpan  # noqa: E402
from verifier import verify_semantics  # noqa: E402


def test_verifier_reports_wrong_aggregation_and_chart_type() -> None:
  warnings = verify_semantics(
    [
      _semantic_operation(
        op_id="op-1",
        kind="Aggregate",
        params={"function": "count", "measure": "temperature"},
      ),
      _semantic_operation(
        op_id="op-2",
        kind="Plot",
        params={"chartType": "line", "columnsUsed": ["state", "temperature"]},
      ),
    ],
    {
      "aggregation": "mean",
      "chartType": "bar",
    },
  )

  warning_kinds = {warning.kind for warning in warnings}
  assert "wrong_aggregation" in warning_kinds
  assert "wrong_chart_type" in warning_kinds

  aggregation_warning = next(warning for warning in warnings if warning.kind == "wrong_aggregation")
  assert aggregation_warning.warning_id == "warning-1"
  assert aggregation_warning.op_id == "op-1"
  assert aggregation_warning.node_ids == ["node-1"]
  assert aggregation_warning.expected == "mean"
  assert aggregation_warning.actual == "count"
  assert aggregation_warning.source_spans[0].start_line == 10

  chart_warning = next(warning for warning in warnings if warning.kind == "wrong_chart_type")
  assert chart_warning.op_id == "op-2"
  assert chart_warning.expected == "bar"
  assert chart_warning.actual == "line"


def test_verifier_reports_grouping_measure_vestigial_and_unknown() -> None:
  warnings = verify_semantics(
    [
      _semantic_operation(
        op_id="op-1",
        kind="GroupBy",
        params={"groupBy": ["region"]},
      ),
      _semantic_operation(
        op_id="op-2",
        kind="Aggregate",
        params={"function": "mean", "measure": "humidity"},
      ),
      _semantic_operation(
        op_id="op-3",
        kind="Unknown",
        params={"astType": "Expr"},
      ),
      _semantic_operation(
        op_id="op-4",
        kind="Plot",
        params={"chartType": "bar", "columnsUsed": ["state", "humidity"]},
        in_slice=False,
      ),
    ],
    {
      "groupBy": ["state"],
      "measure": "temperature",
    },
  )

  warning_kinds = {warning.kind for warning in warnings}
  assert "wrong_grouping" in warning_kinds
  assert "wrong_measure" in warning_kinds
  assert "unsupported_pattern" in warning_kinds
  assert "vestigial_code" in warning_kinds

  vestigial_warning = next(warning for warning in warnings if warning.kind == "vestigial_code")
  assert vestigial_warning.severity == "info"
  assert vestigial_warning.op_id == "op-4"


def test_verifier_groups_vestigial_code_into_one_note() -> None:
  warnings = verify_semantics(
    [
      _semantic_operation(op_id="op-1", kind="ReadCSV", params={}, in_slice=True),
      _semantic_operation(op_id="op-2", kind="Unknown", params={}, in_slice=False),
      _semantic_operation(op_id="op-3", kind="Aggregate", params={}, in_slice=False),
    ],
    {},
  )

  vestigial_warnings = [warning for warning in warnings if warning.kind == "vestigial_code"]
  assert len(vestigial_warnings) == 1
  assert vestigial_warnings[0].node_ids == ["node-2", "node-3"]
  assert "2 steps" in vestigial_warnings[0].user_message


def test_verifier_maps_label_mismatches_to_plot_formatting_ops() -> None:
  warnings = verify_semantics(
    [
      _semantic_operation(
        op_id="op-1",
        kind="PlotFormatting",
        params={"formatType": "xLabel", "value": "Region"},
      ),
      _semantic_operation(
        op_id="op-2",
        kind="PlotFormatting",
        params={"formatType": "yLabel", "value": "Count"},
      ),
      _semantic_operation(
        op_id="op-3",
        kind="PlotFormatting",
        params={"formatType": "title", "value": "Humidity by state"},
      ),
    ],
    {
      "groupBy": ["state"],
      "measure": "temperature",
      "expectedVisualization": {
        "title": "Average temperature by state",
      },
    },
  )

  warning_kinds = {warning.kind for warning in warnings}
  assert warning_kinds == {"wrong_x_label", "wrong_y_label", "wrong_title"}

  x_warning = next(warning for warning in warnings if warning.kind == "wrong_x_label")
  assert x_warning.op_id == "op-1"
  assert x_warning.node_ids == ["node-1"]
  assert x_warning.title == "Wrong x-axis label"

  y_warning = next(warning for warning in warnings if warning.kind == "wrong_y_label")
  assert y_warning.op_id == "op-2"
  assert y_warning.expected == "temperature"


def _semantic_operation(
  *,
  op_id: str,
  kind: str,
  params: dict,
  in_slice: bool = True,
) -> SemanticOperation:
  return SemanticOperation(
    op_id=op_id,
    kind=kind,
    label=kind,
    lay_description=kind,
    source_node_ids=[f"node-{op_id.split('-')[-1]}"],
    source_spans=[
      SourceSpan(
        file_path="example.py",
        start_line=10,
        start_column=0,
        end_line=10,
        end_column=20,
      )
    ],
    params=params,
    in_slice=in_slice,
  )
