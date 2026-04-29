import type { FlowGraph, FlowNode } from './vscodeApi';

interface FlowchartProps {
  graph: FlowGraph;
  selectedNodeId: string | null;
  onSelectNode: (node: FlowNode) => void;
}

export function Flowchart({ graph, selectedNodeId, onSelectNode }: FlowchartProps) {
  return (
    <section className="flowchart" aria-label="Semantic flowchart">
      {graph.nodes.map((node, index) => (
        <div className="flow-step" key={node.nodeId}>
          <button
            className="flow-node"
            data-status={node.status}
            data-selected={node.nodeId === selectedNodeId}
            type="button"
            onClick={() => onSelectNode(node)}
          >
            <span className="node-kind">{node.kind}</span>
            <span className="node-title">{node.title}</span>
            <span className="node-description">{node.description}</span>
            {node.warningIds.length > 0 ? (
              <span className="node-warning-count">{node.warningIds.length} warning{node.warningIds.length === 1 ? '' : 's'}</span>
            ) : null}
          </button>
          {index < graph.nodes.length - 1 ? <div className="flow-edge" aria-hidden="true" /> : null}
        </div>
      ))}
    </section>
  );
}
