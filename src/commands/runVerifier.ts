import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { PythonAnalysisService } from '../services/PythonAnalysisService';
import { WebviewPanelManager } from '../vscode/WebviewPanelManager';

export function registerRunVerifierCommand(
  context: vscode.ExtensionContext,
  analysisService: PythonAnalysisService,
  webviewPanelManager: WebviewPanelManager
): vscode.Disposable {
  return vscode.commands.registerCommand('intenttrace.runVerifier', async () => {
    const codeFileUri = getActivePythonFileUri();
    if (!codeFileUri) {
      vscode.window.showErrorMessage('Open a Python file before running IntentTrace.');
      return;
    }

    const intent = await loadIntent(context.extensionUri);
    if (!intent) {
      return;
    }

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Running IntentTrace verifier',
          cancellable: false
        },
        () => analysisService.runVerifier({ codeFileUri, intent })
      );

      webviewPanelManager.showAnalysis({
        flowGraph: result.flowGraph,
        warnings: result.warnings
      });
    } catch (error) {
      vscode.window.showErrorMessage(`IntentTrace analyzer failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function getActivePythonFileUri(): vscode.Uri | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const uri = editor.document.uri;
  if (uri.scheme !== 'file' || path.extname(uri.fsPath).toLowerCase() !== '.py') {
    return undefined;
  }

  return uri;
}

async function loadIntent(extensionUri: vscode.Uri): Promise<Record<string, unknown> | undefined> {
  const configuredPath = vscode.workspace.getConfiguration('intenttrace').get<string>('intentPath');
  const intentPath = configuredPath
    ? resolveWorkspacePath(configuredPath)
    : await defaultOrPromptIntentPath(extensionUri);

  if (!intentPath) {
    return undefined;
  }

  try {
    const raw = await fs.readFile(intentPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isJsonObject(parsed)) {
      throw new Error('Intent JSON must be an object.');
    }
    return parsed;
  } catch (error) {
    vscode.window.showErrorMessage(`IntentTrace could not read intent JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function defaultOrPromptIntentPath(extensionUri: vscode.Uri): Promise<string | undefined> {
  const fixtureIntentPath = path.join(extensionUri.fsPath, 'analyzer', 'fixtures', 'intent_mean_bar.json');
  if (await pathExists(fixtureIntentPath)) {
    return fixtureIntentPath;
  }

  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'Intent JSON': ['json']
    },
    title: 'Select IntentTrace intent JSON'
  });

  return selection?.[0]?.fsPath;
}

function resolveWorkspacePath(value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    return path.join(workspaceFolder.uri.fsPath, value);
  }

  return value;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
