from __future__ import annotations

from schemas import FlowEdge, FlowGraph, FlowNode, SemanticOperation, VerificationWarning


def build_flow_graph(
  semantic_ops: list[SemanticOperation],
  warnings: list[VerificationWarning],
  *,
  intent_id: str = "intent-default",
  code_id: str = "code-default",
  graph_id: str = "flowgraph-default",
) -> FlowGraph:
  warnings_by_op_id = _warnings_by_op_id(warnings)

  nodes = [
    FlowNode(
      node_id=f"flow-node-{index}",
      op_id=operation.op_id,
      kind=operation.kind,
      title=operation.label,
      description=operation.lay_description,
      status=_node_status(operation, warnings_by_op_id.get(operation.op_id, [])),
      source_node_ids=operation.source_node_ids,
      source_spans=operation.source_spans,
      warning_ids=[warning.warning_id for warning in warnings_by_op_id.get(operation.op_id, [])],
      params=operation.params,
    )
    for index, operation in enumerate(semantic_ops, start=1)
  ]

  edges = [
    FlowEdge(
      edge_id=f"flow-edge-{index}",
      source=nodes[index - 1].node_id,
      target=nodes[index].node_id,
    )
    for index in range(1, len(nodes))
  ]

  return FlowGraph(
    graph_id=graph_id,
    intent_id=intent_id,
    code_id=code_id,
    nodes=nodes,
    edges=edges,
    warnings=warnings,
  )


def _warnings_by_op_id(warnings: list[VerificationWarning]) -> dict[str, list[VerificationWarning]]:
  grouped: dict[str, list[VerificationWarning]] = {}
  for warning in warnings:
    grouped.setdefault(warning.op_id, []).append(warning)
  return grouped


def _node_status(
  operation: SemanticOperation,
  warnings: list[VerificationWarning],
) -> str:
  if not operation.in_slice:
    return "vestigial"

  if operation.kind == "Unknown" and operation.params.get("displayOnly"):
    return "relevant"

  if operation.kind == "Unknown":
    return "unsupported"

  if any(warning.severity == "error" for warning in warnings):
    return "error"

  if any(warning.severity == "warning" for warning in warnings):
    return "warning"

  return "relevant"
