from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ANALYZER_DIR = REPO_ROOT / "analyzer"
sys.path.insert(0, str(ANALYZER_DIR))

from flowgraph import build_flow_graph  # noqa: E402
from parser import parse_program  # noqa: E402
from schemas import SliceResult, SlicingCriterion  # noqa: E402
from semantic import lower_to_semantic_operations  # noqa: E402
from verifier import verify_semantics  # noqa: E402


def test_flowgraph_contains_renderable_nodes_and_statuses() -> None:
  nodes = parse_program(ANALYZER_DIR / "fixtures" / "slicing_example.py")
  slice_result = SliceResult(
    criterion=SlicingCriterion(),
    nodes=nodes,
    relevant_node_ids=["node-3", "node-6", "node-7", "node-9", "node-10"],
    irrelevant_node_ids=["node-1", "node-2", "node-4", "node-5", "node-8"],
  )
  semantic_ops = lower_to_semantic_operations(slice_result)
  warnings = verify_semantics(
    semantic_ops,
    {
      "aggregation": "mean",
      "chartType": "line",
    },
  )

  graph = build_flow_graph(
    semantic_ops,
    warnings,
    graph_id="graph-test",
    intent_id="intent-test",
    code_id="code-test",
  )

  assert graph.graph_id == "graph-test"
  assert graph.intent_id == "intent-test"
  assert graph.code_id == "code-test"

  node_kinds = [node.kind for node in graph.nodes]
  assert "ReadCSV" in node_kinds
  assert "DropNA" in node_kinds
  assert "GroupBy" in node_kinds
  assert "Aggregate" in node_kinds
  assert "Plot" in node_kinds

  aggregate_node = next(node for node in graph.nodes if node.kind == "Aggregate" and node.params["function"] == "count")
  assert aggregate_node.status == "error"
  assert aggregate_node.warning_ids
  assert aggregate_node.source_node_ids == ["node-7"]
  assert aggregate_node.source_spans[0].start_line == 9

  humidity_node = next(
    node
    for node in graph.nodes
    if node.kind == "Aggregate" and node.params.get("output") == "humidity"
  )
  assert humidity_node.status == "vestigial"

  assert len(graph.edges) == len(graph.nodes) - 1
  assert graph.edges[0].source == graph.nodes[0].node_id
  assert graph.edges[0].target == graph.nodes[1].node_id
