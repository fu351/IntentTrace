from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ANALYZER_DIR = REPO_ROOT / "analyzer"
sys.path.insert(0, str(ANALYZER_DIR))

from parser import parse_program  # noqa: E402
from schemas import SliceResult, SlicingCriterion  # noqa: E402
from semantic import lower_to_semantic_operations  # noqa: E402


def test_groupby_mean_lowers_to_groupby_and_aggregate_mean() -> None:
  operations = _lower_all_semantic_fixture()

  mean_ops = [
    operation
    for operation in operations
    if operation.source_node_ids == ["node-5"]
  ]

  assert [operation.kind for operation in mean_ops] == ["GroupBy", "Aggregate"]
  assert mean_ops[0].params["groupBy"] == ["state"]
  assert mean_ops[1].params["function"] == "mean"
  assert mean_ops[1].params["measure"] == "temperature"


def test_groupby_count_lowers_to_groupby_and_aggregate_count() -> None:
  operations = _lower_all_semantic_fixture()

  count_ops = [
    operation
    for operation in operations
    if operation.source_node_ids == ["node-6"]
  ]

  assert [operation.kind for operation in count_ops] == ["GroupBy", "Aggregate"]
  assert count_ops[0].params["groupBy"] == ["state"]
  assert count_ops[1].params["function"] == "count"
  assert count_ops[1].params["measure"] == "temperature"
  assert count_ops[1].source_spans[0].start_line == 8


def test_plot_lowers_to_line_plot_with_source_metadata() -> None:
  operations = _lower_all_semantic_fixture()

  plot_op = next(operation for operation in operations if operation.kind == "Plot")

  assert plot_op.params["chartType"] == "line"
  assert plot_op.params["callName"] == "plt.plot"
  assert plot_op.params["variablesUsed"] == ["count_summary"]
  assert plot_op.params["columnsUsed"] == ["state", "temperature"]
  assert plot_op.source_node_ids == ["node-8"]
  assert plot_op.source_spans[0].start_line == 10
  assert plot_op.in_slice is True


def _lower_all_semantic_fixture():
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "semantic_example.py")
  slice_result = SliceResult(
    criterion=SlicingCriterion(),
    nodes=nodes,
    relevant_node_ids=[node.node_id for node in nodes],
  )

  return lower_to_semantic_operations(slice_result)
