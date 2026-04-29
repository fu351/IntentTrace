export interface SourceSpan {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface ProgramNode {
  id: string;
  kind: string;
  label: string;
  span: SourceSpan;
  reads: string[];
  writes: string[];
}

export interface GeneratedCodeArtifact {
  language: 'python';
  code: string;
  filePath?: string;
  generatedFromIntentId?: string;
}
