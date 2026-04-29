import type { SourceSpan } from './program';

export interface VerificationWarning {
  warningId: string;
  kind:
    | 'wrong_aggregation'
    | 'wrong_chart_type'
    | 'wrong_grouping'
    | 'wrong_measure'
    | 'vestigial_code'
    | 'ambiguous_target_output'
    | 'unsupported_pattern';
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
