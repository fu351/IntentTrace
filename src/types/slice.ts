import type { ProgramNode, SourceSpan } from './program';

export interface VisualizationSink {
  id: string;
  kind: 'matplotlib' | 'pandas_plot' | 'unknown';
  targetVariables: string[];
  span: SourceSpan;
}

export interface SlicingCriterion {
  sink: VisualizationSink;
  variables: string[];
}

export interface SliceResult {
  criterion: SlicingCriterion;
  nodes: ProgramNode[];
  spans: SourceSpan[];
}
