export interface SourceSpan {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface VerificationWarning {
  warningId: string;
  kind: string;
  severity: 'info' | 'warning' | 'error';
  opId: string;
  nodeIds: string[];
  sourceSpans: SourceSpan[];
  title: string;
  userMessage: string;
  technicalMessage: string;
  expected: unknown;
  actual: unknown;
}

export interface FlowNode {
  nodeId: string;
  opId: string;
  kind: string;
  title: string;
  description: string;
  status: 'relevant' | 'vestigial' | 'warning' | 'error' | 'unsupported';
  sourceNodeIds: string[];
  sourceSpans: SourceSpan[];
  warningIds: string[];
  params: Record<string, unknown>;
}

export interface FlowEdge {
  edgeId: string;
  source: string;
  target: string;
  label?: string | null;
}

export interface FlowGraph {
  graphId: string;
  intentId: string;
  codeId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  warnings: VerificationWarning[];
}

export interface AnalysisPayload {
  flowGraph: FlowGraph;
  warnings: VerificationWarning[];
}

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __INTENTTRACE_INITIAL_DATA__?: AnalysisPayload | null;
  }
}

const vscode = typeof window.acquireVsCodeApi === 'function'
  ? window.acquireVsCodeApi()
  : undefined;

export function getInitialPayload(): AnalysisPayload | null {
  return window.__INTENTTRACE_INITIAL_DATA__ ?? null;
}

export function postNodeClicked(nodeId: string): void {
  vscode?.postMessage({
    type: 'nodeClicked',
    nodeId
  });
}

export function postWarningClicked(warningId: string): void {
  vscode?.postMessage({
    type: 'warningClicked',
    warningId
  });
}
