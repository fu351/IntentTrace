import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { CsvSchemaService } from '../services/CsvSchemaService';
import type { LLMProvider } from '../services/llm/LLMProvider';
import { PythonAnalysisService } from '../services/PythonAnalysisService';
import type { IntentDSL } from '../types/intent';
import type { DatasetSchema } from '../types/schema';
import type { FlowGraph } from '../types/flowchart';
import type { VerificationWarning } from '../types/verification';
import { DecorationsManager } from './DecorationsManager';
import { WebviewPanelManager } from './WebviewPanelManager';

export interface WebviewAnalysisPayload {
  flowGraph: FlowGraph;
  warnings: VerificationWarning[];
}

interface SidebarState {
  datasetSchema?: DatasetSchema;
  intent?: IntentDSL;
  prompt?: string;
  generatedCodePath?: string;
  analysisPayload?: WebviewAnalysisPayload;
  statusMessage?: string;
}

type SidebarMessage =
  | { type: 'pickCsv' }
  | { type: 'inferIntent'; userPrompt: string; datasetSchema: DatasetSchema }
  | { type: 'generateCode'; intent: IntentDSL }
  | { type: 'runVerifier'; intent: IntentDSL }
  | { type: 'openResultsPanel' }
  | { type: 'openGeneratedCode' }
  | { type: 'openIntentDocument'; intent: IntentDSL }
  | { type: 'nodeClicked'; nodeId: string }
  | { type: 'warningClicked'; warningId: string };

export class IntentTraceSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'intenttrace.sidebar';

  private view: vscode.WebviewView | undefined;
  private state: SidebarState = {};

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly llmProvider: LLMProvider,
    private readonly schemaService: CsvSchemaService,
    private readonly analysisService: PythonAnalysisService,
    private readonly decorationsManager: DecorationsManager,
    private readonly resultPanelManager: WebviewPanelManager
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist')
      ]
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  public open(): void {
    void this.revealSidebar();
  }

  public showGuidance(message: string): void {
    this.state.statusMessage = message;
    this.open();
    this.postMessage({
      type: 'workflowInfo',
      message
    });
  }

  public showAnalysis(payload: WebviewAnalysisPayload): void {
    this.state.analysisPayload = payload;
    this.state.statusMessage = 'Verification complete. Open Flowchart Results to inspect the result.';
    this.resultPanelManager.showAnalysis(payload);
    this.postMessage({
      type: 'analysisResult',
      payload
    });
  }

  public showLoading(message = 'Running analyzer...'): void {
    this.state.statusMessage = message;
    this.resultPanelManager.showLoading(message);
    this.postMessage({
      type: 'analysisLoading',
      message
    });
  }

  public showError(message: string): void {
    this.state.statusMessage = message;
    this.resultPanelManager.showError(message);
    this.postMessage({
      type: 'analysisError',
      message
    });
  }

  public dispose(): void {
    this.view = undefined;
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isSidebarMessage(message)) {
      return;
    }

    if (message.type === 'nodeClicked') {
      await this.decorationsManager.revealNode(message.nodeId);
      return;
    }

    if (message.type === 'warningClicked') {
      await this.decorationsManager.revealWarning(message.warningId);
      return;
    }

    try {
      if (message.type === 'pickCsv') {
        await this.pickCsv();
        return;
      }

      if (message.type === 'inferIntent') {
        await this.inferIntent(message.userPrompt, message.datasetSchema);
        return;
      }

      if (message.type === 'generateCode') {
        await this.generateCode(message.intent);
        return;
      }

      if (message.type === 'runVerifier') {
        await this.runVerifier(message.intent);
        return;
      }

      if (message.type === 'openResultsPanel') {
        this.openResultsPanel();
        return;
      }

      if (message.type === 'openGeneratedCode') {
        await this.openGeneratedCode();
        return;
      }

      if (message.type === 'openIntentDocument') {
        await this.openIntentDocument(message.intent);
      }
    } catch (error) {
      this.postWorkflowError(error instanceof Error ? error.message : String(error));
    }
  }

  private async pickCsv(): Promise<void> {
    this.postWorkflowStatus('Reading CSV schema...');
    const schema = await this.schemaService.pickAndInferSchema();
    if (!schema) {
      this.postWorkflowStatus('');
      return;
    }

    this.state.datasetSchema = schema;
    this.state.statusMessage = `Loaded schema from ${path.basename(schema.sourcePath)}.`;
    this.postMessage({
      type: 'schemaSelected',
      schema
    });
  }

  private async inferIntent(userPrompt: string, datasetSchema: DatasetSchema): Promise<void> {
    if (!userPrompt.trim()) {
      throw new Error('Enter a prompt before inferring intent.');
    }

    this.state.prompt = userPrompt.trim();
    this.state.datasetSchema = datasetSchema;
    this.postWorkflowStatus('Inferring editable intent with the VS Code Language Model API...');

    const intent = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Inferring IntentTrace intent',
        cancellable: true
      },
      (_progress, cancellationToken) => this.llmProvider.inferIntent({
        userPrompt: userPrompt.trim(),
        datasetSchema,
        cancellationToken
      })
    );

    this.state.intent = intent;
    this.state.statusMessage = 'Intent inferred. Review or edit it before generating code or verifying.';
    this.postMessage({
      type: 'intentReady',
      intent
    });
  }

  private async generateCode(intent: IntentDSL): Promise<void> {
    if (!isIntent(intent)) {
      throw new Error('Intent JSON must include prompt and dataset fields before generating code.');
    }

    this.state.intent = intent;
    this.state.datasetSchema = intent.dataset;
    this.postWorkflowStatus('Generating Python code with the VS Code Language Model API...');

    const code = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Generating Python analysis code',
        cancellable: true
      },
      (_progress, cancellationToken) => this.llmProvider.generateCode({
        intent,
        datasetSchema: intent.dataset,
        cancellationToken
      })
    );

    const codeUri = await this.writeGeneratedCode(code);
    this.state.generatedCodePath = codeUri.fsPath;
    const document = await vscode.workspace.openTextDocument(codeUri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });
    this.state.statusMessage = `Generated code saved to ${path.basename(codeUri.fsPath)}.`;
    this.postMessage({
      type: 'codeGenerated',
      codeFilePath: codeUri.fsPath
    });
  }

  private async runVerifier(intent: IntentDSL): Promise<void> {
    if (!isIntent(intent)) {
      throw new Error('Intent JSON must include prompt and dataset fields before verification.');
    }

    const codeFileUri = getActivePythonFileUri() ?? (this.state.generatedCodePath ? vscode.Uri.file(this.state.generatedCodePath) : undefined);
    if (!codeFileUri) {
      throw new Error('Open a Python file or generate code before running the verifier.');
    }

    this.showLoading('Running deterministic analyzer on the active Python file...');
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running IntentTrace verifier',
        cancellable: false
      },
      () => this.analysisService.runVerifier({ codeFileUri, intent })
    );

    this.showAnalysis({
      flowGraph: result.flowGraph,
      warnings: result.warnings
    });
    this.decorationsManager.applyAnalysis(result.flowGraph, result.warnings);
  }

  private openResultsPanel(): void {
    if (this.state.analysisPayload) {
      this.resultPanelManager.showAnalysis(this.state.analysisPayload);
      return;
    }
    this.resultPanelManager.open();
  }

  private async openGeneratedCode(): Promise<void> {
    if (!this.state.generatedCodePath) {
      throw new Error('Generate code before opening the generated Python file.');
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(this.state.generatedCodePath));
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });
  }

  private async openIntentDocument(intent: IntentDSL): Promise<void> {
    if (!isIntent(intent)) {
      throw new Error('Intent JSON must include prompt and dataset fields.');
    }

    this.state.intent = intent;
    const document = await vscode.workspace.openTextDocument({
      language: 'json',
      content: JSON.stringify(intent, null, 2)
    });
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });
  }

  private async writeGeneratedCode(code: string): Promise<vscode.Uri> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const normalizedCode = code.endsWith('\n') ? code : `${code}\n`;

    if (workspaceFolder) {
      const outputDir = path.join(workspaceFolder.uri.fsPath, '.intenttrace');
      await fs.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, 'generated_analysis.py');
      await fs.writeFile(outputPath, normalizedCode, 'utf8');
      return vscode.Uri.file(outputPath);
    }

    const targetUri = await vscode.window.showSaveDialog({
      filters: { Python: ['py'] },
      saveLabel: 'Save generated analysis',
      title: 'Save generated IntentTrace analysis'
    });
    if (!targetUri) {
      throw new Error('Generated code must be saved before it can be verified.');
    }
    await fs.writeFile(targetUri.fsPath, normalizedCode, 'utf8');
    return targetUri;
  }

  private postWorkflowStatus(message: string): void {
    this.state.statusMessage = message;
    this.postMessage({
      type: 'workflowStatus',
      message
    });
  }

  private postWorkflowError(message: string): void {
    this.state.statusMessage = message;
    this.postMessage({
      type: 'workflowError',
      message
    });
    vscode.window.showErrorMessage(`IntentTrace: ${message}`);
  }

  private postMessage(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }

  private async revealSidebar(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.view.extension.intenttrace');
    } catch {
      // Some hosts only expose the generated view focus command.
    }

    try {
      await vscode.commands.executeCommand(`${IntentTraceSidebarProvider.viewType}.focus`);
    } catch {
      // The activity-bar container command above is enough to make the view discoverable.
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const initialState = JSON.stringify(this.state).replace(/</g, '\\u003c');
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist', 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist', 'assets', 'index.css')
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <title>IntentTrace</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__INTENTTRACE_VIEW_KIND__ = 'sidebar'; window.__INTENTTRACE_INITIAL_STATE__ = ${initialState};</script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getActivePythonFileUri(): vscode.Uri | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== 'file' || path.extname(editor.document.uri.fsPath).toLowerCase() !== '.py') {
    return undefined;
  }
  return editor.document.uri;
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

function isSidebarMessage(value: unknown): value is SidebarMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'pickCsv') {
    return true;
  }
  if (value.type === 'inferIntent') {
    return typeof value.userPrompt === 'string' && isDatasetSchema(value.datasetSchema);
  }
  if (value.type === 'generateCode' || value.type === 'runVerifier') {
    return isRecord(value.intent);
  }
  if (value.type === 'openResultsPanel' || value.type === 'openGeneratedCode') {
    return true;
  }
  if (value.type === 'openIntentDocument') {
    return isRecord(value.intent);
  }
  if (value.type === 'nodeClicked') {
    return typeof value.nodeId === 'string';
  }
  if (value.type === 'warningClicked') {
    return typeof value.warningId === 'string';
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
