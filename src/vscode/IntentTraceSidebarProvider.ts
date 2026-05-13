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
import { WebviewPanelManager, type WebviewAnalysisPayload } from './WebviewPanelManager';

interface SidebarState {
  datasetSchema?: DatasetSchema;
  intent?: IntentDSL;
  prompt?: string;
  generatedCodePath?: string;
  activeCodeFilePath?: string;
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
  | { type: 'warningClicked'; warningId: string }
  | { type: 'fixWarning'; warningId: string }
  | { type: 'deleteWarningCode'; warningId: string }
  | { type: 'editIntentForWarning'; warningId: string }
  | { type: 'ignoreWarning'; warningId: string }
  | { type: 'applyToProject' }
  | { type: 'clearSession' };

export class IntentTraceSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'intenttrace.sidebar';

  private view: vscode.WebviewView | undefined;
  private state: SidebarState = {};
  private readonly activeEditorListener: vscode.Disposable;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly llmProvider: LLMProvider,
    private readonly schemaService: CsvSchemaService,
    private readonly analysisService: PythonAnalysisService,
    private readonly decorationsManager: DecorationsManager,
    private readonly resultPanelManager: WebviewPanelManager
  ) {
    this.activeEditorListener = vscode.window.onDidChangeActiveTextEditor(() => {
      void this.tryRestoreFileSession();
    });
  }

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

    if (this.state.intent) {
      this.sendCurrentSessionToWebview();
    } else {
      void this.tryRestoreFileSession();
    }
  }

  private sendCurrentSessionToWebview(): void {
    if (!this.state.intent) {
      return;
    }
    this.postMessage({
      type: 'sessionRestored',
      state: {
        prompt: this.state.prompt,
        intent: this.state.intent,
        datasetSchema: this.state.datasetSchema ?? this.state.intent?.dataset,
        generatedCodePath: this.state.generatedCodePath,
        statusMessage: this.state.statusMessage || 'Session restored.',
      }
    });
  }

  private clearSessionState(filePath: string | undefined): void {
    this.state = {
      activeCodeFilePath: filePath,
      statusMessage: undefined,
    };
    this.postMessage({
      type: 'sessionRestored',
      state: {
        prompt: '',
        intent: null,
        datasetSchema: null,
        generatedCodePath: '',
        statusMessage: '',
      }
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

  public async handleFixWarning(warningId: string): Promise<void> {
    const warning = this.state.analysisPayload?.warnings.find((w) => w.warningId === warningId);
    if (!warning) {
      return;
    }
    vscode.window.showInformationMessage(`IntentTrace: Auto-fix for "${warning.title}" is not yet implemented. Edit the code manually, then re-run the verifier.`);
  }

  public async handleDeleteWarningCode(warningId: string): Promise<void> {
    try {
      await this.deleteWarningCode(warningId);
    } catch (error) {
      this.postWorkflowError(error instanceof Error ? error.message : String(error));
    }
  }

  public handleEditIntentForWarning(): void {
    this.open();
    this.postMessage({
      type: 'workflowInfo',
      message: 'Edit the intent fields in the sidebar, then re-run the verifier.'
    });
  }

  public dispose(): void {
    this.activeEditorListener.dispose();
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

    if (message.type === 'fixWarning') {
      await this.handleFixWarning(message.warningId);
      return;
    }

    if (message.type === 'editIntentForWarning') {
      this.handleEditIntentForWarning();
      return;
    }

    if (message.type === 'ignoreWarning') {
      return;
    }

    if (message.type === 'deleteWarningCode') {
      await this.handleDeleteWarningCode(message.warningId);
      return;
    }

    if (message.type === 'clearSession') {
      const filePath = this.state.activeCodeFilePath;
      this.clearSessionState(undefined);
      this.decorationsManager.clear();
      this.resultPanelManager.clear();
      if (filePath) {
        void this.deleteSessionFile(filePath);
      }
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

      if (message.type === 'applyToProject') {
        await this.applyToProject();
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
    await this.persistSession();
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

    const activeFilePath = this.resolveActiveCodeFilePath();
    const existingCode = await this.readExistingCode(activeFilePath);
    const isModify = existingCode !== undefined;

    this.postWorkflowStatus(
      isModify
        ? 'Modifying existing code with the VS Code Language Model API...'
        : 'Generating Python code with the VS Code Language Model API...'
    );

    const code = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: isModify ? 'Modifying Python analysis code' : 'Generating Python analysis code',
        cancellable: true
      },
      (_progress, cancellationToken) => this.llmProvider.generateCode({
        intent,
        datasetSchema: intent.dataset,
        existingCode,
        cancellationToken
      })
    );

    let codeUri: vscode.Uri;
    if (isModify && activeFilePath) {
      const normalizedCode = code.endsWith('\n') ? code : `${code}\n`;
      await fs.writeFile(activeFilePath, normalizedCode, 'utf8');
      codeUri = vscode.Uri.file(activeFilePath);
    } else {
      codeUri = await this.writeGeneratedCode(code);
    }

    this.state.generatedCodePath = codeUri.fsPath;
    this.state.activeCodeFilePath = codeUri.fsPath;
    const document = await vscode.workspace.openTextDocument(codeUri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });
    this.state.statusMessage = isModify
      ? `Code modified in ${path.basename(codeUri.fsPath)}.`
      : `Generated code saved to ${path.basename(codeUri.fsPath)}.`;
    await this.persistSession();
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

    this.state.activeCodeFilePath = codeFileUri.fsPath;
    this.showAnalysis({
      flowGraph: result.flowGraph,
      warnings: result.warnings,
      intent: intent as unknown as Record<string, unknown>
    });
    this.decorationsManager.applyAnalysis(result.flowGraph, result.warnings);
    await this.persistSession();
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

  private resolveActiveCodeFilePath(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.scheme === 'file' && path.extname(editor.document.uri.fsPath).toLowerCase() === '.py') {
      return editor.document.uri.fsPath;
    }
    return this.state.generatedCodePath ?? this.getDefaultGeneratedCodePath();
  }

  private async readExistingCode(filePath: string | undefined): Promise<string | undefined> {
    if (!filePath) {
      return undefined;
    }
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.trim().length > 0 ? content : undefined;
    } catch {
      return undefined;
    }
  }

  private getDefaultGeneratedCodePath(): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return undefined;
    }
    return path.join(workspaceFolder.uri.fsPath, '.intenttrace', 'generated_analysis.py');
  }

  private async applyToProject(): Promise<void> {
    const activeFile = this.state.activeCodeFilePath ?? this.state.generatedCodePath;
    if (!activeFile) {
      throw new Error('Generate and verify code before applying to the project.');
    }

    const isIntentTraceFile = activeFile.includes('.intenttrace');

    if (!isIntentTraceFile) {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(activeFile));
      await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
      await document.save();
      this.postMessage({
        type: 'workflowInfo',
        message: `Saved ${path.basename(activeFile)}.`
      });
      return;
    }

    const sourceCode = await fs.readFile(activeFile, 'utf8');
    if (!sourceCode.trim()) {
      throw new Error('The generated code file is empty.');
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const defaultName = this.state.intent?.prompt
      ? this.state.intent.prompt.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) + '.py'
      : 'analysis.py';

    const defaultUri = workspaceFolder
      ? vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, defaultName))
      : undefined;

    const targetUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { Python: ['py'] },
      saveLabel: 'Apply to project',
      title: 'Choose where to save the verified analysis'
    });
    if (!targetUri) {
      return;
    }

    await fs.writeFile(targetUri.fsPath, sourceCode, 'utf8');
    this.state.activeCodeFilePath = targetUri.fsPath;
    this.state.generatedCodePath = targetUri.fsPath;
    const document = await vscode.workspace.openTextDocument(targetUri);
    await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
    await this.persistSession();
    this.postMessage({
      type: 'workflowInfo',
      message: `Applied to ${path.basename(targetUri.fsPath)}.`
    });
  }

  private async deleteWarningCode(warningId: string): Promise<void> {
    const payload = this.state.analysisPayload;
    const intent = this.state.intent;
    const warning = payload?.warnings.find((w) => w.warningId === warningId);
    if (!payload || !warning || !intent) {
      throw new Error('Run the verifier before deleting code.');
    }

    const spans = warning.sourceSpans.filter((span) => span.startLine > 0);
    if (spans.length === 0) {
      throw new Error('This warning does not have source lines to delete.');
    }

    const filePath = spans[0].filePath || this.state.generatedCodePath;
    if (!filePath) {
      throw new Error('This warning does not have a source file.');
    }

    const targetUri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(targetUri);

    const lineCount = spans.reduce((total, span) => total + (span.endLine - span.startLine + 1), 0);
    const choice = await vscode.window.showWarningMessage(
      `Delete ${lineCount} line${lineCount === 1 ? '' : 's'} of ${warning.kind.replace(/_/g, ' ')}?`,
      { modal: true },
      'Delete'
    );
    if (choice !== 'Delete') {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const sortedSpans = [...spans].sort((a, b) => b.startLine - a.startLine);
    for (const span of sortedSpans) {
      const startLine = Math.max(span.startLine - 1, 0);
      const endLine = Math.min(span.endLine, document.lineCount);
      edit.delete(targetUri, new vscode.Range(startLine, 0, endLine, 0));
    }

    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      const updatedDocument = await vscode.workspace.openTextDocument(targetUri);
      await updatedDocument.save();
    }

    this.postWorkflowStatus('Code deleted. Rerunning verifier...');
    await this.runVerifier(intent);
  }

  private async persistSession(): Promise<void> {
    const filePath = this.state.activeCodeFilePath ?? this.state.generatedCodePath;
    if (!filePath) {
      return;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }
    const sessionsDir = path.join(workspaceFolder.uri.fsPath, '.intenttrace', 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });
    const sessionPath = path.join(sessionsDir, `${safeFileName(filePath)}.json`);
    const session = {
      prompt: this.state.prompt,
      datasetSchema: this.state.datasetSchema,
      intent: this.state.intent,
      generatedCodePath: this.state.generatedCodePath,
      activeCodeFilePath: this.state.activeCodeFilePath,
      statusMessage: this.state.statusMessage,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf8');
  }

  private async deleteSessionFile(filePath: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }
    const sessionPath = path.join(workspaceFolder.uri.fsPath, '.intenttrace', 'sessions', `${safeFileName(filePath)}.json`);
    try {
      await fs.unlink(sessionPath);
    } catch {
      // File may not exist
    }
  }

  private async tryRestoreFileSession(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      return;
    }
    const filePath = editor.document.uri.fsPath;
    if (path.extname(filePath).toLowerCase() !== '.py') {
      return;
    }
    if (filePath === this.state.activeCodeFilePath) {
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const sessionPath = path.join(workspaceFolder.uri.fsPath, '.intenttrace', 'sessions', `${safeFileName(filePath)}.json`);
    try {
      const raw = await fs.readFile(sessionPath, 'utf8');
      const session = JSON.parse(raw);
      if (!session || !session.intent) {
        this.clearSessionState(filePath);
        return;
      }

      this.state = {
        ...this.state,
        prompt: session.prompt,
        datasetSchema: session.datasetSchema,
        intent: session.intent,
        generatedCodePath: session.generatedCodePath,
        activeCodeFilePath: filePath,
        statusMessage: session.statusMessage,
      };

      this.postMessage({
        type: 'sessionRestored',
        state: {
          prompt: session.prompt,
          intent: session.intent,
          datasetSchema: session.datasetSchema ?? session.intent?.dataset,
          generatedCodePath: session.generatedCodePath,
          statusMessage: 'Session restored. Ready to verify.',
        }
      });
    } catch {
      this.clearSessionState(filePath);
    }
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
  if (value.type === 'openResultsPanel' || value.type === 'openGeneratedCode' || value.type === 'applyToProject' || value.type === 'clearSession') {
    return true;
  }
  if (value.type === 'openIntentDocument') {
    return isRecord(value.intent);
  }
  if (value.type === 'nodeClicked') {
    return typeof value.nodeId === 'string';
  }
  if (value.type === 'warningClicked' || value.type === 'fixWarning' || value.type === 'deleteWarningCode' || value.type === 'editIntentForWarning' || value.type === 'ignoreWarning') {
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

function safeFileName(filePath: string): string {
  return filePath
    .replace(/^[A-Za-z]:/, '')
    .replace(/[\\/:\s]+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/^_+/, '')
    .slice(-160) || 'active-file';
}
