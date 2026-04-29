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
  const [viewState, setViewState] = useState<'fixture' | 'loading' | 'ready' | 'error'>(() => getInitialPayload() ? 'ready' : 'fixture');
  const [statusMessage, setStatusMessage] = useState<string>(() => getInitialPayload() ? '' : 'Showing built-in demo data. Run the verifier to load live analyzer output.');

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'analysisLoading') {
        setViewState('loading');
        setStatusMessage(event.data.message || 'Running analyzer...');
        return;
      }

      if (event.data?.type === 'analysisError') {
        setViewState('error');
        setStatusMessage(event.data.message || 'Analyzer failed.');
        return;
      }

      if (event.data?.type !== 'analysisResult') {
        return;
      }

      const nextPayload = event.data.payload as AnalysisPayload;
      setPayload(nextPayload);
      setSelectedNodeId(nextPayload.flowGraph.nodes[0]?.nodeId ?? null);
      setViewState('ready');
      setStatusMessage('');
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

      {viewState !== 'ready' ? (
        <section className="state-banner" data-state={viewState}>
          <strong>{stateTitle(viewState)}</strong>
          <span>{statusMessage}</span>
        </section>
      ) : null}

      {payload.flowGraph.nodes.length === 0 ? (
        <section className="empty-state">
          <h2>No semantic steps found</h2>
          <p>Open a Python analysis file and run IntentTrace again.</p>
        </section>
      ) : null}

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

function stateTitle(state: 'fixture' | 'loading' | 'ready' | 'error'): string {
  if (state === 'loading') {
    return 'Analyzing code';
  }
  if (state === 'error') {
    return 'Analyzer error';
  }
  if (state === 'fixture') {
    return 'Demo preview';
  }
  return '';
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
