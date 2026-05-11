import type { FlowGraph, FlowNode } from './vscodeApi';

interface FlowchartProps {
  graph: FlowGraph;
  selectedNodeId: string | null;
  onSelectNode: (node: FlowNode) => void;
}

const STATUS_ICONS: Record<FlowNode['status'], string> = {
  relevant: '✓',
  vestigial: '−',
  warning: '!',
  error: '✗',
  unsupported: '?'
};

type FlowGroup =
  | { type: 'node'; node: FlowNode; index: number }
  | { type: 'vestigial'; nodes: FlowNode[]; startIndex: number };

function groupNodes(nodes: FlowNode[]): FlowGroup[] {
  const groups: FlowGroup[] = [];
  let vestigialBatch: FlowNode[] = [];
  let batchStart = 0;

  const flushVestigial = () => {
    if (vestigialBatch.length > 0) {
      groups.push({ type: 'vestigial', nodes: vestigialBatch, startIndex: batchStart });
      vestigialBatch = [];
    }
  };

  nodes.forEach((node, index) => {
    if (node.status === 'vestigial') {
      if (vestigialBatch.length === 0) {
        batchStart = index;
      }
      vestigialBatch.push(node);
    } else {
      flushVestigial();
      groups.push({ type: 'node', node, index });
    }
  });
  flushVestigial();
  return groups;
}

export function Flowchart({ graph, selectedNodeId, onSelectNode }: FlowchartProps) {
  const groups = groupNodes(graph.nodes);

  return (
    <section className="flowchart-vertical" aria-label="Semantic flowchart">
      {groups.map((group, gi) => {
        const isLast = gi === groups.length - 1;

        if (group.type === 'vestigial') {
          return (
            <div className="flow-step" key={`vestigial-${group.startIndex}`}>
              <details className="vestigial-group">
                <summary className="vestigial-summary">
                  <span className="flow-dot vestigial-dot">−</span>
                  <span>{group.nodes.length} unrelated step{group.nodes.length === 1 ? '' : 's'}</span>
                </summary>
                <div className="vestigial-list">
                  {group.nodes.map((node) => (
                    <button
                      className="flow-node"
                      data-status="vestigial"
                      data-selected={String(node.nodeId === selectedNodeId)}
                      type="button"
                      key={node.nodeId}
                      onClick={() => onSelectNode(node)}
                    >
                      <span className="flow-dot">−</span>
                      <div className="flow-body">
                        <span className="flow-kind">{node.kind}</span>
                        <span className="flow-title">{node.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </details>
              {!isLast ? <div className="flow-connector" aria-hidden="true" /> : null}
            </div>
          );
        }

        const { node } = group;
        return (
          <div className="flow-step" key={node.nodeId}>
            <button
              className="flow-node"
              data-status={node.status}
              data-selected={String(node.nodeId === selectedNodeId)}
              type="button"
              onClick={() => onSelectNode(node)}
            >
              <span className="flow-dot">{STATUS_ICONS[node.status]}</span>
              <div className="flow-body">
                <span className="flow-kind">{node.kind}</span>
                <span className="flow-title">{node.title}</span>
                <span className="flow-desc">{node.description}</span>
                {node.warningIds.length > 0 ? (
                  <span className="flow-badge">{node.warningIds.length} issue{node.warningIds.length === 1 ? '' : 's'}</span>
                ) : null}
              </div>
            </button>
            {!isLast ? <div className="flow-connector" aria-hidden="true" /> : null}
          </div>
        );
      })}
    </section>
  );
}
