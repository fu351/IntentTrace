from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ANALYZER_DIR = REPO_ROOT / "analyzer"
sys.path.insert(0, str(ANALYZER_DIR))

from parser import parse_program  # noqa: E402
from sinks import detect_visualization_sinks, select_sink  # noqa: E402
from slicer import build_slicing_criterion, slice_program  # noqa: E402


def test_backward_slice_keeps_nodes_that_influence_plot() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "slicing_example.py")
  sink = select_sink(detect_visualization_sinks(nodes), {"chartType": "line"})
  criterion = build_slicing_criterion(sink)

  result = slice_program(nodes, criterion)

  snippets = {node.node_id: node.code_snippet for node in nodes}
  relevant_snippets = [snippets[node_id] for node_id in result.relevant_node_ids]

  assert 'df = pd.read_csv("weather.csv")' in relevant_snippets
  assert 'df = df.dropna(subset=["state", "temperature"])' in relevant_snippets
  assert 'summary = df.groupby("state")["temperature"].count().reset_index()' in relevant_snippets
  assert 'plt.plot(summary["state"], summary["temperature"])' in relevant_snippets
  assert "plt.show()" in relevant_snippets


def test_backward_slice_marks_unrelated_top_level_nodes_irrelevant() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "slicing_example.py")
  sink = select_sink(detect_visualization_sinks(nodes), {"chartType": "line"})
  criterion = build_slicing_criterion(sink)

  result = slice_program(nodes, criterion)

  snippets = {node.node_id: node.code_snippet for node in nodes}
  irrelevant_snippets = [snippets[node_id] for node_id in result.irrelevant_node_ids]

  assert "backup = df.copy()" in irrelevant_snippets
  assert "print(df.head())" in irrelevant_snippets
  assert 'humidity = df.groupby("state")["humidity"].mean().reset_index()' in irrelevant_snippets


def test_backward_slice_reports_dependency_edges() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "slicing_example.py")
  sink = select_sink(detect_visualization_sinks(nodes), {"chartType": "line"})
  criterion = build_slicing_criterion(sink)

  result = slice_program(nodes, criterion)

  edges = {
    (edge.source, edge.target, edge.variable)
    for edge in result.dependency_edges
  }

  assert ("node-3", "node-6", "df") in edges
  assert ("node-6", "node-7", "df") in edges
  assert ("node-7", "node-9", "summary") in edges


def test_backward_slice_keeps_plot_formatting_with_selected_plot() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "plot_formatting_example.py")
  sink = select_sink(detect_visualization_sinks(nodes), {"chartType": "bar"})
  criterion = build_slicing_criterion(sink)

  result = slice_program(nodes, criterion)

  snippets = {node.node_id: node.code_snippet for node in nodes}
  relevant_snippets = [snippets[node_id] for node_id in result.relevant_node_ids]

  assert 'plt.bar(summary["state"], summary["temperature"])' in relevant_snippets
  assert 'plt.xlabel("Region")' in relevant_snippets
  assert 'plt.ylabel("Count")' in relevant_snippets
  assert 'plt.title("Humidity by state")' in relevant_snippets
  assert "plt.show()" in relevant_snippets
