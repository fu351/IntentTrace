export interface DatasetColumn {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'unknown';
  nullable: boolean;
  sampleValues?: unknown[];
}

export interface DatasetSchema {
  sourcePath: string;
  columns: DatasetColumn[];
  rowCount?: number;
}

export interface IntentDSL {
  prompt: string;
  dataset: DatasetSchema;
  operations: string[];
  expectedVisualization?: {
    chartType?: string;
    x?: string;
    y?: string;
    groupBy?: string[];
  };
}
