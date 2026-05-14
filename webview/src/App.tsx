import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Flowchart } from './Flowchart';
import { DetailsPanel } from './DetailsPanel';
import {
  getInitialState,
  getViewKind,
  postApplyToProject,
  postClearSession,
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
    setPrompt,
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

  const handleClear = () => {
    setPrompt('');
    setSchema(null);
    setIntentJson('');
    setGeneratedCodePath('');
    setPayload(null);
    setWorkflowState('idle');
    setStatusMessage('');
    postClearSession();
  };

  return (
    <main className="app-shell app-shell--sidebar">
      <header className="app-header">
        <div>
          <h1>IntentTrace</h1>
          <p>Verify AI-generated analysis code against your intent.</p>
        </div>
        <button className="clear-button" type="button" onClick={handleClear} disabled={workflowState === 'loading'} title="Clear all fields and start over">
          Clear
        </button>
      </header>

      {statusMessage ? (
        <section className="state-banner" data-state={workflowState}>
          <strong>{workflowState === 'error' ? 'Error' : workflowState === 'loading' ? 'Working' : 'Done'}</strong>
          <span>{statusMessage}</span>
        </section>
      ) : null}

      <section className="sidebar-section">
        <h2 className="sidebar-heading">1. Describe your analysis</h2>
        <textarea
          id="prompt-input"
          className="prompt-input"
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Make a bar chart of average temperature by state."
        />

        <div className="dataset-row">
          <button className="primary-button" type="button" onClick={postPickCsv} disabled={workflowState === 'loading'}>
            {schema ? 'Change CSV' : 'Choose CSV'}
          </button>
          {schema ? (
            <div className="dataset-info">
              <strong>{shortName(schema.sourcePath)}</strong>
              <span>{schema.columns.length} columns{schema.rowCount !== undefined ? `, ${schema.rowCount} rows` : ''}</span>
            </div>
          ) : (
            <span className="sidebar-hint">Select a dataset to get started.</span>
          )}
        </div>

        {schema ? (
          <div className="schema-preview" aria-label="Detected columns">
            {schema.columns.map((column) => (
              <span key={column.name}>{column.name}</span>
            ))}
          </div>
        ) : null}

        <button className="primary-button full-width" type="button" onClick={() => schema ? postInferIntent(prompt, schema) : undefined} disabled={inferDisabled}>
          Infer Intent
        </button>
      </section>

      <section className="sidebar-section">
        <h2 className="sidebar-heading">2. Review intent</h2>
        {currentIntent ? (
          <IntentForm
            intent={currentIntent}
            schema={schema}
            onChange={updateIntent}
          />
        ) : (
          <div className="intent-empty">
            <strong>No intent inferred yet</strong>
            <span>Enter a prompt and choose a CSV above, then click Infer Intent.</span>
          </div>
        )}
        {parsedIntent.error ? <p className="error-text">{parsedIntent.error}</p> : null}
      </section>

      <section className="sidebar-section">
        <h2 className="sidebar-heading">3. Generate &amp; verify</h2>
        <div className="action-row">
          <button type="button" onClick={() => currentIntent ? postGenerateCode(currentIntent) : undefined} disabled={actionDisabled}>
            {generatedCodePath ? 'Modify Code' : 'Generate Code'}
          </button>
          <button type="button" onClick={() => currentIntent ? postRunVerifier(currentIntent) : undefined} disabled={actionDisabled}>
            Run Verifier
          </button>
        </div>

        {generatedCodePath ? (
          <div className="status-card" data-status="done">
            <strong>Code ready</strong>
            <span>{shortName(generatedCodePath)}</span>
            <button className="link-button" type="button" onClick={postOpenGeneratedCode}>Open file</button>
          </div>
        ) : null}

        {payload ? (
          <div className="status-card" data-status={issueCount > 0 ? 'warning' : 'done'}>
            <strong>{issueCount} issue{issueCount === 1 ? '' : 's'} found</strong>
            <span>{payload.flowGraph.nodes.length} semantic steps from {shortName(payload.flowGraph.codeId)}</span>
            <button className="link-button" type="button" onClick={postOpenResultsPanel}>Open results</button>
          </div>
        ) : null}
      </section>

      {payload || generatedCodePath ? (
        <section className="sidebar-section">
          <h2 className="sidebar-heading">4. Apply</h2>
          <button className="apply-button" type="button" disabled={!generatedCodePath} onClick={postApplyToProject}>
            Apply to project
          </button>
          <div className="action-row">
            <button type="button" onClick={postOpenResultsPanel} disabled={!payload}>Flowchart</button>
            <button type="button" onClick={() => currentIntent ? postOpenIntentDocument(currentIntent) : undefined} disabled={!currentIntent}>Intent JSON</button>
          </div>
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

          {payload.intent ? (
            <section className="intent-summary-bar">
              <strong>{payload.intent.intentSummary ?? payload.intent.prompt}</strong>
              <div className="intent-summary-fields">
                {payload.intent.chartType ? <span>Chart: {payload.intent.chartType}</span> : null}
                {payload.intent.groupBy?.length ? <span>Group by: {payload.intent.groupBy.join(', ')}</span> : null}
                {payload.intent.measure ? <span>Measure: {payload.intent.measure}</span> : null}
                {payload.intent.aggregation ? <span>Calculation: {payload.intent.aggregation}</span> : null}
              </div>
            </section>
          ) : null}

          <section className="workspace">
            <div className="flow-column">
              <Flowchart graph={payload.flowGraph} selectedNodeId={selectedNodeId} onSelectNode={selectNode} />
            </div>
            <DetailsPanel node={selectedNode} warnings={payload.warnings} />
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
            <option value="percentage">Percentage</option>
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
            <option value="pie">Pie chart</option>
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
  setPrompt?: (prompt: string) => void;
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

      if (event.data?.type === 'sessionRestored') {
        const state = event.data.state;
        handlers.setPrompt?.(state?.prompt || '');
        if (state?.intent) {
          handlers.setIntentJson?.(JSON.stringify(state.intent, null, 2));
          handlers.setSchema?.(state.intent.dataset ?? state.datasetSchema ?? null);
        } else {
          handlers.setIntentJson?.('');
          handlers.setSchema?.(state?.datasetSchema as DatasetSchema ?? null);
        }
        handlers.setGeneratedCodePath?.(state?.generatedCodePath || '');
        handlers.setWorkflowState('idle');
        handlers.setStatusMessage(state?.statusMessage || '');
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
