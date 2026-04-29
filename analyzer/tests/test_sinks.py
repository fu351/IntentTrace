from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ANALYZER_DIR = REPO_ROOT / "analyzer"
sys.path.insert(0, str(ANALYZER_DIR))

from parser import parse_program  # noqa: E402
from sinks import detect_visualization_sinks, select_sink  # noqa: E402


def test_detects_matplotlib_plot_sink_with_variables_and_columns() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "simple_plot.py")

  sinks = detect_visualization_sinks(nodes)
  selected_sink = select_sink(sinks, {"chartType": "line"})

  assert selected_sink is not None
  assert selected_sink.sink_id == "sink-1"
  assert selected_sink.node_id == "node-5"
  assert selected_sink.call_name == "plt.plot"
  assert selected_sink.inferred_chart_type == "line"
  assert selected_sink.source_span.start_line == 7
  assert "summary" in selected_sink.variables_used
  assert selected_sink.columns_used == ["state", "temperature"]


def test_select_sink_prefers_intent_chart_type_when_multiple_sinks(tmp_path: Path) -> None:
  code_path = tmp_path / "multiple_plots.py"
  code_path.write_text(
    "\n".join(
      [
        "import matplotlib.pyplot as plt",
        "plt.scatter(summary['x'], summary['y'])",
        "plt.bar(summary['state'], summary['temperature'])",
      ]
    ),
    encoding="utf-8",
  )

  nodes = parse_program(code_path)
  sinks = detect_visualization_sinks(nodes)

  selected_sink = select_sink(sinks, {"chartType": "bar"})

  assert selected_sink is not None
  assert selected_sink.call_name == "plt.bar"
  assert selected_sink.inferred_chart_type == "bar"
