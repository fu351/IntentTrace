import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { LLMProvider } from '../services/llm/LLMProvider';
import type { DatasetSchema } from '../types/schema';

export function registerInferIntentCommand(provider: LLMProvider): vscode.Disposable {
  return vscode.commands.registerCommand('intenttrace.inferIntent', async () => {
    const userPrompt = await vscode.window.showInputBox({
      title: 'IntentTrace: Infer Intent',
      prompt: 'Describe the chart or analysis you want.',
      placeHolder: 'Make a bar chart of average temperature by state.'
    });

    if (!userPrompt) {
      return;
    }

    const datasetSchema = await loadDatasetSchema();
    if (!datasetSchema) {
      return;
    }

    try {
      const intent = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Inferring IntentTrace intent',
          cancellable: true
        },
        (_progress, cancellationToken) => provider.inferIntent({ userPrompt, datasetSchema, cancellationToken })
      );

      const document = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(intent, null, 2)
      });
      await vscode.window.showTextDocument(document, { preview: false });
    } catch (error) {
      vscode.window.showErrorMessage(`IntentTrace intent inference failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

async function loadDatasetSchema(): Promise<DatasetSchema | undefined> {
  const configuredPath = vscode.workspace.getConfiguration('intenttrace').get<string>('schemaPath');
  const schemaPath = configuredPath ? resolveWorkspacePath(configuredPath) : await pickJsonPath('Select CSV schema JSON');
  if (!schemaPath) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    const schema = extractDatasetSchema(parsed);
    if (!schema) {
      throw new Error('JSON must be a DatasetSchema object or contain a dataset object.');
    }
    return schema;
  } catch (error) {
    vscode.window.showErrorMessage(`IntentTrace could not read dataset schema: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function extractDatasetSchema(value: unknown): DatasetSchema | undefined {
  if (isDatasetSchema(value)) {
    return value;
  }
  if (isRecord(value) && isDatasetSchema(value.dataset)) {
    return value.dataset;
  }
  return undefined;
}

function isDatasetSchema(value: unknown): value is DatasetSchema {
  return isRecord(value)
    && typeof value.sourcePath === 'string'
    && Array.isArray(value.columns);
}

async function pickJsonPath(title: string): Promise<string | undefined> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { JSON: ['json'] },
    title
  });
  return selection?.[0]?.fsPath;
}

function resolveWorkspacePath(value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder ? path.join(workspaceFolder.uri.fsPath, value) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
