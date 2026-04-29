import type { SourceSpan } from './program';

export interface SemanticOperation {
  id: string;
  type:
    | 'ReadCSV'
    | 'SelectColumns'
    | 'DropNA'
    | 'FilterRows'
    | 'GroupBy'
    | 'Aggregate'
    | 'Sort'
    | 'ParseDate'
    | 'Plot'
    | 'Unknown';
  inputs: string[];
  outputs: string[];
  span?: SourceSpan;
  metadata?: Record<string, unknown>;
}
