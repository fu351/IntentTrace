import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { LLMProvider } from '../services/llm/LLMProvider';
import type { IntentDSL } from '../types/intent';
import type { DatasetSchema } from '../types/schema';

export function registerGenerateCodeCommand(provider: LLMProvider): vscode.Disposable {
  return vscode.commands.registerCommand('intenttrace.generateCode', async () => {
    const intent = await loadIntent();
    if (!intent) {
      return;
    }

    const datasetSchema = intent.dataset;
    if (!datasetSchema) {
      vscode.window.showErrorMessage('IntentTrace intent is missing dataset schema information.');
      return;
    }

    try {
      const code = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Generating Python analysis code',
          cancellable: true
        },
        (_progress, cancellationToken) => provider.generateCode({ intent, datasetSchema, cancellationToken })
      );

      const document = await vscode.workspace.openTextDocument({
        language: 'python',
        content: code.endsWith('\n') ? code : `${code}\n`
      });
      await vscode.window.showTextDocument(document, { preview: false });
    } catch (error) {
      vscode.window.showErrorMessage(`IntentTrace code generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

async function loadIntent(): Promise<IntentDSL | undefined> {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument?.uri.scheme === 'file' && activeDocument.languageId === 'json') {
    const parsed = parseIntent(activeDocument.getText());
    if (parsed) {
      return parsed;
    }
  }

  const configuredPath = vscode.workspace.getConfiguration('intenttrace').get<string>('intentPath');
  const intentPath = configuredPath ? resolveWorkspacePath(configuredPath) : await pickJsonPath('Select confirmed IntentTrace intent JSON');
  if (!intentPath) {
    return undefined;
  }

  try {
    return parseIntent(await fs.readFile(intentPath, 'utf8'));
  } catch (error) {
    vscode.window.showErrorMessage(`IntentTrace could not read intent JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function parseIntent(raw: string): IntentDSL | undefined {
  try {
    const parsed = JSON.parse(raw);
    if (isIntent(parsed)) {
      return parsed;
    }
    vscode.window.showErrorMessage('IntentTrace intent JSON must include prompt and dataset fields.');
    return undefined;
  } catch (error) {
    vscode.window.showErrorMessage(`IntentTrace intent JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function isIntent(value: unknown): value is IntentDSL {
  return isRecord(value)
    && typeof value.prompt === 'string'
    && isDatasetSchema(value.dataset);
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
