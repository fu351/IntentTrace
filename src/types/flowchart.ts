import type { SourceSpan } from './program';
import type { VerificationWarning } from './verification';

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
