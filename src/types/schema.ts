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
