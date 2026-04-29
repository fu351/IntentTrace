import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Flowchart } from './Flowchart';
import { NodeDetails } from './NodeDetails';
import { WarningPanel } from './WarningPanel';
import { fixturePayload } from './fixturePayload';
import { getInitialPayload, postNodeClicked, type AnalysisPayload, type FlowNode } from './vscodeApi';
import './styles.css';

export function App() {
  const [payload, setPayload] = useState<AnalysisPayload>(() => getInitialPayload() ?? fixturePayload);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(payload.flowGraph.nodes[0]?.nodeId ?? null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'analysisResult') {
        return;
      }

      const nextPayload = event.data.payload as AnalysisPayload;
      setPayload(nextPayload);
      setSelectedNodeId(nextPayload.flowGraph.nodes[0]?.nodeId ?? null);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const selectedNode = useMemo(
    () => payload.flowGraph.nodes.find((node) => node.nodeId === selectedNodeId) ?? null,
    [payload.flowGraph.nodes, selectedNodeId]
  );

  const selectNode = (node: FlowNode) => {
    setSelectedNodeId(node.nodeId);
    postNodeClicked(node.nodeId);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>IntentTrace Verification View</h1>
          <p>{payload.flowGraph.nodes.length} semantic steps from {shortName(payload.flowGraph.codeId)}</p>
        </div>
        <div className="graph-meta">
          <span>{payload.warnings.length} warnings</span>
          <span>{payload.flowGraph.intentId}</span>
        </div>
      </header>

      <section className="workspace">
        <div className="flow-column">
          <Flowchart graph={payload.flowGraph} selectedNodeId={selectedNodeId} onSelectNode={selectNode} />
        </div>
        <NodeDetails node={selectedNode} warnings={payload.warnings} />
        <WarningPanel warnings={payload.warnings} />
      </section>
    </main>
  );
}

function shortName(value: string): string {
  return value.replace(/\\/g, '/').split('/').pop() ?? value;
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
