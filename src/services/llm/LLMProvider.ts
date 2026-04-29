import * as vscode from 'vscode';
import type { IntentDSL } from '../../types/intent';
import type { DatasetSchema } from '../../types/schema';

export interface LLMProvider {
  name: string;

  inferIntent(input: {
    userPrompt: string;
    datasetSchema: DatasetSchema;
    cancellationToken?: vscode.CancellationToken;
  }): Promise<IntentDSL>;

  generateCode(input: {
    intent: IntentDSL;
    datasetSchema: DatasetSchema;
    cancellationToken?: vscode.CancellationToken;
  }): Promise<string>;
}
