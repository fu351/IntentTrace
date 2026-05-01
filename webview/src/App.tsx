import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Flowchart } from './Flowchart';
import { NodeDetails } from './NodeDetails';
import { WarningPanel } from './WarningPanel';
import {
  getInitialState,
  getViewKind,
  postGenerateCode,
  postInferIntent,
  postNodeClicked,
  postOpenGeneratedCode,
  postOpenIntentDocument,
  postOpenResultsPanel,
  postPickCsv,
  postRunVerifier,
  type AnalysisPayload,
  type DatasetSchema,
  type FlowNode,
  type IntentDSL
} from './vscodeApi';
import './styles.css';

type WorkflowState = 'idle' | 'loading' | 'error';

export function App() {
  return getViewKind() === 'sidebar' ? <SidebarApp /> : <ResultsApp />;
}

function SidebarApp() {
  const initialState = getInitialState();
  const [prompt, setPrompt] = useState(initialState.prompt ?? '');
  const [schema, setSchema] = useState<DatasetSchema | null>(initialState.datasetSchema ?? initialState.intent?.dataset ?? null);
  const [intentJson, setIntentJson] = useState(() => initialState.intent ? JSON.stringify(initialState.intent, null, 2) : '');
  const [payload, setPayload] = useState<AnalysisPayload | null>(initialState.analysisPayload ?? null);
  const [workflowState, setWorkflowState] = useState<WorkflowState>('idle');
  const [statusMessage, setStatusMessage] = useState(initialState.statusMessage ?? '');
  const [generatedCodePath, setGeneratedCodePath] = useState(initialState.generatedCodePath ?? '');

  useIntentTraceMessages({
    setWorkflowState,
    setStatusMessage,
    setSchema,
    setIntentJson,
    setGeneratedCodePath,
    setPayload
  });

  const parsedIntent = useMemo(() => parseIntent(intentJson), [intentJson]);
  const inferDisabled = workflowState === 'loading' || !prompt.trim() || !schema;
  const actionDisabled = workflowState === 'loading' || !parsedIntent.intent;
  const issueCount = payload?.warnings.filter((warning) => warning.severity !== 'info').length ?? 0;
  const currentIntent = parsedIntent.intent;

  const updateIntent = (patch: Partial<IntentDSL>) => {
    if (!currentIntent) {
      return;
    }
    setIntentJson(JSON.stringify({ ...currentIntent, ...patch }, null, 2));
  };

  return (
    <main className="app-shell app-shell--sidebar">
      <header className="app-header">
        <div>
          <h1>IntentTrace</h1>
          <p>Prompt, generate and verify Python analysis code.</p>
        </div>
      </header>

      <section className="workflow-panel" aria-label="IntentTrace workflow">
        <label className="field-label" htmlFor="prompt-input">Analysis prompt</label>
        <textarea
          id="prompt-input"
          className="prompt-input"
          rows={4}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Make a bar chart of average temperature by state."
        />

        <div className="dataset-row">
          <button className="primary-button" type="button" onClick={postPickCsv} disabled={workflowState === 'loading'}>
            Choose CSV
          </button>
          <div>
            <strong>{schema ? shortName(schema.sourcePath) : 'No CSV selected'}</strong>
            <span>{schema ? `${schema.columns.length} columns${schema.rowCount !== undefined ? `, ${schema.rowCount} rows` : ''}` : 'Select a dataset before inferring intent.'}</span>
          </div>
        </div>

        {schema ? (
          <div className="schema-preview" aria-label="Detected columns">
            {schema.columns.map((column) => (
              <span key={column.name}>{column.name}</span>
            ))}
          </div>
        ) : null}

        <div className="action-row">
          <button type="button" onClick={() => schema ? postInferIntent(prompt, schema) : undefined} disabled={inferDisabled}>
            Infer Intent
          </button>
          <button type="button" onClick={() => parsedIntent.intent ? postGenerateCode(parsedIntent.intent) : undefined} disabled={actionDisabled}>
            Generate Code
          </button>
          <button type="button" onClick={() => parsedIntent.intent ? postRunVerifier(parsedIntent.intent) : undefined} disabled={actionDisabled}>
            Run Verifier
          </button>
        </div>
      </section>

      <section className="workflow-panel" aria-label="Open IntentTrace panels">
        <div className="section-heading">
          <h2>Panels</h2>
        </div>
        <div className="action-row">
          <button type="button" onClick={postOpenResultsPanel} disabled={!payload}>
            Open Flowchart Results
          </button>
          <button type="button" onClick={postOpenGeneratedCode} disabled={!generatedCodePath}>
            Open Generated Code
          </button>
          <button type="button" onClick={() => currentIntent ? postOpenIntentDocument(currentIntent) : undefined} disabled={!currentIntent}>
            Open Technical Intent
          </button>
        </div>
        {payload ? (
          <div className="result-summary">
            <strong>{issueCount} issue{issueCount === 1 ? '' : 's'}</strong>
            <span>{payload.flowGraph.nodes.length} semantic step{payload.flowGraph.nodes.length === 1 ? '' : 's'} from {shortName(payload.flowGraph.codeId)}</span>
          </div>
        ) : (
          <p className="sidebar-note">Run the verifier to enable the flowchart results panel.</p>
        )}
      </section>

      <section className="intent-editor" aria-label="Intent review">
        <div className="section-heading">
          <h2>Intent Review</h2>
          {parsedIntent.error ? <span className="parse-error">Needs review</span> : null}
        </div>
        {currentIntent ? (
          <IntentForm
            intent={currentIntent}
            schema={schema}
            onChange={updateIntent}
          />
        ) : (
          <div className="intent-empty">
            <strong>No intent inferred yet</strong>
            <span>Choose a CSV and click Infer Intent. The result will appear here as editable fields.</span>
          </div>
        )}
        {parsedIntent.error ? <p className="error-text">{parsedIntent.error}</p> : null}
      </section>

      {statusMessage ? (
        <section className="state-banner" data-state={workflowState}>
          <strong>{workflowState === 'error' ? 'Needs attention' : workflowState === 'loading' ? 'Working' : 'Status'}</strong>
          <span>{statusMessage}</span>
        </section>
      ) : null}
    </main>
  );
}

function ResultsApp() {
  const initialState = getInitialState();
  const [payload, setPayload] = useState<AnalysisPayload | null>(initialState.analysisPayload ?? null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialState.analysisPayload?.flowGraph.nodes[0]?.nodeId ?? null);
  const [workflowState, setWorkflowState] = useState<WorkflowState>('idle');
  const [statusMessage, setStatusMessage] = useState(initialState.statusMessage ?? '');

  useIntentTraceMessages({
    setWorkflowState,
    setStatusMessage,
    setPayload,
    onPayload: (nextPayload) => setSelectedNodeId(nextPayload.flowGraph.nodes[0]?.nodeId ?? null)
  });

  const selectedNode = useMemo(
    () => payload?.flowGraph.nodes.find((node) => node.nodeId === selectedNodeId) ?? null,
    [payload?.flowGraph.nodes, selectedNodeId]
  );

  const selectNode = (node: FlowNode) => {
    setSelectedNodeId(node.nodeId);
    postNodeClicked(node.nodeId);
  };

  return (
    <main className="app-shell app-shell--results">
      <header className="app-header">
        <div>
          <h1>IntentTrace Verification View</h1>
          <p>{payload ? `${payload.flowGraph.nodes.length} semantic steps from ${shortName(payload.flowGraph.codeId)}` : 'Run the verifier from the IntentTrace sidebar.'}</p>
        </div>
        {payload ? (
          <div className="graph-meta">
            <span>{payload.warnings.length} warnings</span>
            <span>{payload.flowGraph.intentId}</span>
          </div>
        ) : null}
      </header>

      {statusMessage ? (
        <section className="state-banner" data-state={workflowState}>
          <strong>{workflowState === 'error' ? 'Analyzer error' : workflowState === 'loading' ? 'Analyzing code' : 'Status'}</strong>
          <span>{statusMessage}</span>
        </section>
      ) : null}

      {!payload ? (
        <section className="empty-state">
          <h2>No verification output yet</h2>
          <p>Use the IntentTrace sidebar to enter a prompt, generate code and run the verifier.</p>
        </section>
      ) : null}

      {payload ? (
        <>
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
        </>
      ) : null}
    </main>
  );
}

interface IntentFormProps {
  intent: IntentDSL;
  schema: DatasetSchema | null;
  onChange: (patch: Partial<IntentDSL>) => void;
}

function IntentForm({ intent, schema, onChange }: IntentFormProps) {
  const columns = schema?.columns.map((column) => column.name) ?? intent.dataset.columns.map((column) => column.name);
  const groupByValue = intent.groupBy?.join(', ') ?? '';
  const expectedVisualization = intent.expectedVisualization ?? {};
  const updateExpectedVisualization = (key: string, value: string) => {
    onChange({
      expectedVisualization: {
        ...expectedVisualization,
        [key]: value || undefined
      }
    });
  };

  return (
    <div className="intent-form">
      <label className="intent-field">
        <span>Request</span>
        <textarea
          rows={3}
          value={intent.prompt}
          onChange={(event) => onChange({ prompt: event.target.value })}
          placeholder="Describe the chart or analysis."
        />
      </label>

      <label className="intent-field">
        <span>Group rows by</span>
        <ColumnInput
          value={groupByValue}
          columns={columns}
          onChange={(value) => onChange({ groupBy: splitColumns(value) })}
          placeholder="state"
        />
      </label>

      <label className="intent-field">
        <span>Measure</span>
        <ColumnInput
          value={intent.measure ?? ''}
          columns={columns}
          onChange={(value) => onChange({ measure: value || undefined })}
          placeholder="temperature"
        />
      </label>

      <div className="intent-grid">
        <label className="intent-field">
          <span>Calculation</span>
          <select value={intent.aggregation ?? ''} onChange={(event) => onChange({ aggregation: event.target.value || undefined })}>
            <option value="">Not specified</option>
            <option value="mean">Average</option>
            <option value="count">Count</option>
            <option value="sum">Total</option>
            <option value="min">Minimum</option>
            <option value="max">Maximum</option>
            <option value="median">Median</option>
          </select>
        </label>

        <label className="intent-field">
          <span>Chart type</span>
          <select value={intent.chartType ?? ''} onChange={(event) => onChange({ chartType: event.target.value || undefined })}>
            <option value="">Not specified</option>
            <option value="bar">Bar chart</option>
            <option value="line">Line chart</option>
            <option value="scatter">Scatter plot</option>
            <option value="histogram">Histogram</option>
          </select>
        </label>
      </div>

      <div className="intent-grid">
        <label className="intent-field">
          <span>X-axis label</span>
          <input
            value={String(expectedVisualization.xLabel ?? expectedVisualization.x ?? '')}
            onChange={(event) => updateExpectedVisualization('xLabel', event.target.value)}
            placeholder={intent.groupBy?.[0] ?? 'State'}
          />
        </label>

        <label className="intent-field">
          <span>Y-axis label</span>
          <input
            value={String(expectedVisualization.yLabel ?? expectedVisualization.y ?? '')}
            onChange={(event) => updateExpectedVisualization('yLabel', event.target.value)}
            placeholder={intent.measure ?? 'Average temperature'}
          />
        </label>
      </div>

      <label className="intent-field">
        <span>Chart title</span>
        <input
          value={String(expectedVisualization.title ?? '')}
          onChange={(event) => updateExpectedVisualization('title', event.target.value)}
          placeholder="Average temperature by state"
        />
      </label>

      <div className="intent-dataset">
        <span>Dataset</span>
        <strong>{shortName(intent.dataset.sourcePath)}</strong>
      </div>
    </div>
  );
}

interface ColumnInputProps {
  value: string;
  columns: string[];
  placeholder: string;
  onChange: (value: string) => void;
}

function ColumnInput({ value, columns, placeholder, onChange }: ColumnInputProps) {
  return (
    <>
      <input
        list={`${placeholder}-columns`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <datalist id={`${placeholder}-columns`}>
        {columns.map((column) => (
          <option value={column} key={column} />
        ))}
      </datalist>
    </>
  );
}

interface MessageHandlers {
  setWorkflowState: (state: WorkflowState) => void;
  setStatusMessage: (message: string) => void;
  setSchema?: (schema: DatasetSchema) => void;
  setIntentJson?: (intentJson: string) => void;
  setGeneratedCodePath?: (codePath: string) => void;
  setPayload?: (payload: AnalysisPayload) => void;
  onPayload?: (payload: AnalysisPayload) => void;
}

function useIntentTraceMessages(handlers: MessageHandlers): void {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'workflowStatus') {
        handlers.setWorkflowState(event.data.message ? 'loading' : 'idle');
        handlers.setStatusMessage(event.data.message || '');
        return;
      }

      if (event.data?.type === 'workflowInfo') {
        handlers.setWorkflowState('idle');
        handlers.setStatusMessage(event.data.message || '');
        return;
      }

      if (event.data?.type === 'workflowError') {
        handlers.setWorkflowState('error');
        handlers.setStatusMessage(event.data.message || 'IntentTrace failed.');
        return;
      }

      if (event.data?.type === 'schemaSelected' && handlers.setSchema) {
        const nextSchema = event.data.schema as DatasetSchema;
        handlers.setSchema(nextSchema);
        handlers.setWorkflowState('idle');
        handlers.setStatusMessage(`Loaded schema from ${shortName(nextSchema.sourcePath)}.`);
        return;
      }

      if (event.data?.type === 'intentReady' && handlers.setIntentJson && handlers.setSchema) {
        const intent = event.data.intent as IntentDSL;
        handlers.setIntentJson(JSON.stringify(intent, null, 2));
        handlers.setSchema(intent.dataset);
        handlers.setWorkflowState('idle');
        handlers.setStatusMessage('Intent inferred. Review or edit the fields before generating code or verifying.');
        return;
      }

      if (event.data?.type === 'codeGenerated' && handlers.setGeneratedCodePath) {
        handlers.setGeneratedCodePath(event.data.codeFilePath || '');
        handlers.setWorkflowState('idle');
        handlers.setStatusMessage(`Generated code saved to ${shortName(event.data.codeFilePath || '')}.`);
        return;
      }

      if (event.data?.type === 'analysisLoading') {
        handlers.setWorkflowState('loading');
        handlers.setStatusMessage(event.data.message || 'Running analyzer...');
        return;
      }

      if (event.data?.type === 'analysisError') {
        handlers.setWorkflowState('error');
        handlers.setStatusMessage(event.data.message || 'Analyzer failed.');
        return;
      }

      if (event.data?.type !== 'analysisResult' || !handlers.setPayload) {
        return;
      }

      const nextPayload = event.data.payload as AnalysisPayload;
      handlers.setPayload(nextPayload);
      handlers.onPayload?.(nextPayload);
      handlers.setWorkflowState('idle');
      handlers.setStatusMessage('Verification complete.');
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handlers]);
}

function parseIntent(value: string): { intent: IntentDSL | null; error: string | null } {
  if (!value.trim()) {
    return { intent: null, error: null };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isIntent(parsed)) {
      return { intent: null, error: 'Intent must include prompt and dataset fields.' };
    }
    return { intent: parsed, error: null };
  } catch (error) {
    return { intent: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function splitColumns(value: string): string[] | undefined {
  const columns = value
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
  return columns.length > 0 ? columns : undefined;
}

function isIntent(value: unknown): value is IntentDSL {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { prompt?: unknown }).prompt === 'string'
    && isDatasetSchema((value as { dataset?: unknown }).dataset);
}

function isDatasetSchema(value: unknown): value is DatasetSchema {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { sourcePath?: unknown }).sourcePath === 'string'
    && Array.isArray((value as { columns?: unknown }).columns);
}

function shortName(value: string): string {
  return value.replace(/\\/g, '/').split('/').pop() ?? value;
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
