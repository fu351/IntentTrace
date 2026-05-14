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


def test_value_counts_normalize_lowers_to_percentage_aggregate(tmp_path: Path) -> None:
  code_path = tmp_path / "value_counts_percentage.py"
  code_path.write_text(
    "\n".join(
      [
        "import pandas as pd",
        "df = pd.read_csv('weather.csv')",
        "shares = df['state'].value_counts(normalize=True)",
      ]
    ),
    encoding="utf-8",
  )

  nodes = parse_program(code_path)
  slice_result = SliceResult(
    criterion=SlicingCriterion(),
    nodes=nodes,
    relevant_node_ids=[node.node_id for node in nodes],
  )

  operations = lower_to_semantic_operations(slice_result)
  aggregate_op = next(operation for operation in operations if operation.kind == "Aggregate")

  assert aggregate_op.params["function"] == "percentage"
  assert aggregate_op.params["measure"] == "state"
  assert aggregate_op.label == "Percentage of state"


def test_groupby_divide_by_sum_times_hundred_lowers_to_percentage(tmp_path: Path) -> None:
  code_path = tmp_path / "groupby_percentage.py"
  code_path.write_text(
    "\n".join(
      [
        "import pandas as pd",
        "df = pd.read_csv('weather.csv')",
        "pct = df.groupby('state')['temperature'].sum() / df['temperature'].sum() * 100",
      ]
    ),
    encoding="utf-8",
  )

  nodes = parse_program(code_path)
  slice_result = SliceResult(
    criterion=SlicingCriterion(),
    nodes=nodes,
    relevant_node_ids=[node.node_id for node in nodes],
  )

  operations = lower_to_semantic_operations(slice_result)
  kinds = [operation.kind for operation in operations]
  assert "GroupBy" in kinds
  assert "Aggregate" in kinds

  groupby_op = next(operation for operation in operations if operation.kind == "GroupBy")
  aggregate_op = next(operation for operation in operations if operation.kind == "Aggregate")

  assert groupby_op.params["groupBy"] == ["state"]
  assert aggregate_op.params["function"] == "percentage"
  assert aggregate_op.params["measure"] == "temperature"


def test_pie_plot_lowers_to_pie_chart(tmp_path: Path) -> None:
  code_path = tmp_path / "pie_example.py"
  code_path.write_text(
    "\n".join(
      [
        "import pandas as pd",
        "import matplotlib.pyplot as plt",
        "df = pd.read_csv('weather.csv')",
        "summary = df.groupby('state')['temperature'].mean().reset_index()",
        "plt.pie(summary['temperature'], labels=summary['state'])",
      ]
    ),
    encoding="utf-8",
  )

  nodes = parse_program(code_path)
  slice_result = SliceResult(
    criterion=SlicingCriterion(),
    nodes=nodes,
    relevant_node_ids=[node.node_id for node in nodes],
  )

  operations = lower_to_semantic_operations(slice_result)
  plot_op = next(operation for operation in operations if operation.kind == "Plot")

  assert plot_op.params["chartType"] == "pie"
  assert plot_op.params["callName"] == "plt.pie"
  assert plot_op.label == "Pie chart"


def test_pie_method_call_lowers_to_pie_chart(tmp_path: Path) -> None:
  code_path = tmp_path / "pie_method_example.py"
  code_path.write_text(
    "\n".join(
      [
        "import pandas as pd",
        "df = pd.read_csv('weather.csv')",
        "summary = df.groupby('state')['temperature'].mean()",
        "summary.plot(kind='pie')",
      ]
    ),
    encoding="utf-8",
  )

  nodes = parse_program(code_path)
  slice_result = SliceResult(
    criterion=SlicingCriterion(),
    nodes=nodes,
    relevant_node_ids=[node.node_id for node in nodes],
  )

  operations = lower_to_semantic_operations(slice_result)
  plot_op = next(operation for operation in operations if operation.kind == "Plot")

  assert plot_op.params["chartType"] == "pie"


def test_plot_formatting_lowers_to_semantic_nodes() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "plot_formatting_example.py")
  slice_result = SliceResult(
    criterion=SlicingCriterion(),
    nodes=nodes,
    relevant_node_ids=[node.node_id for node in nodes],
  )

  operations = lower_to_semantic_operations(slice_result)
  formatting_ops = [
    operation
    for operation in operations
    if operation.kind == "PlotFormatting"
  ]

  assert len(formatting_ops) == 1
  assert formatting_ops[0].label == "Plot formatting"
  assert formatting_ops[0].params["formatTypes"] == ["xLabel", "yLabel", "title"]
  assert formatting_ops[0].params["values"] == {
    "xLabel": "Region",
    "yLabel": "Count",
    "title": "Humidity by state",
  }
  assert formatting_ops[0].source_node_ids == ["node-6", "node-7", "node-8"]
  assert formatting_ops[0].source_spans[0].start_line == 7


def _lower_all_semantic_fixture():
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "semantic_example.py")
  slice_result = SliceResult(
    criterion=SlicingCriterion(),
    nodes=nodes,
    relevant_node_ids=[node.node_id for node in nodes],
  )

  return lower_to_semantic_operations(slice_result)
