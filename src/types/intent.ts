import type { DatasetSchema } from './schema';

export interface IntentDSL {
  id?: string;
  prompt: string;
  dataset: DatasetSchema;
  groupBy?: string[];
  measure?: string;
  aggregation?: 'mean' | 'count' | 'sum' | 'min' | 'max' | 'median' | string;
  chartType?: 'bar' | 'line' | 'scatter' | 'histogram' | string;
  operations?: string[];
  expectedVisualization?: {
    chartType?: string;
    x?: string;
    y?: string;
    xLabel?: string;
    yLabel?: string;
    title?: string;
    groupBy?: string[];
  };
}
