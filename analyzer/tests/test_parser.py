from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ANALYZER_DIR = REPO_ROOT / "analyzer"
sys.path.insert(0, str(ANALYZER_DIR))

from parser import parse_program  # noqa: E402


def test_read_csv_assignment_defines_df() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "simple_plot.py")

  read_csv_node = next(node for node in nodes if "read_csv" in node.code_snippet)

  assert read_csv_node.node_id == "node-3"
  assert read_csv_node.kind == "assignment"
  assert read_csv_node.start_line == 5
  assert read_csv_node.end_line == 5
  assert read_csv_node.code_snippet == 'df = pd.read_csv("sales.csv")'
  assert read_csv_node.defines == ["df"]
  assert "pd" in read_csv_node.uses
  assert read_csv_node.ast_type == "Assign"


def test_groupby_assignment_defines_summary_and_uses_df() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "simple_plot.py")

  groupby_node = next(node for node in nodes if "groupby" in node.code_snippet)

  assert groupby_node.kind == "assignment"
  assert groupby_node.start_line == 6
  assert groupby_node.end_line == 6
  assert groupby_node.defines == ["summary"]
  assert "df" in groupby_node.uses
  assert groupby_node.ast_type == "Assign"


def test_plot_call_uses_summary() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "simple_plot.py")

  plot_node = next(node for node in nodes if node.code_snippet.startswith("plt.plot"))

  assert plot_node.kind == "expression"
  assert plot_node.start_line == 7
  assert plot_node.end_line == 7
  assert plot_node.defines == []
  assert "summary" in plot_node.uses
  assert "plt" in plot_node.uses
  assert plot_node.ast_type == "Expr"
