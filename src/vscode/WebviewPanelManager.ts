import * as vscode from 'vscode';
import type { FlowGraph } from '../types/flowchart';
import type { VerificationWarning } from '../types/verification';

export interface WebviewAnalysisPayload {
  flowGraph: FlowGraph;
  warnings: VerificationWarning[];
}

export interface WebviewPanelHandlers {
  onNodeClicked?(nodeId: string): void | Promise<void>;
  onWarningClicked?(warningId: string): void | Promise<void>;
}

export class WebviewPanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private analysisPayload: WebviewAnalysisPayload | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly handlers: WebviewPanelHandlers = {}
  ) {}

  public open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'intenttrace.verificationView',
      'IntentTrace',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist')
        ]
      }
    );

    this.panel.webview.html = this.renderHtml();
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isNodeClickedMessage(message)) {
        void this.handlers.onNodeClicked?.(message.nodeId);
        return;
      }

      if (isWarningClickedMessage(message)) {
        void this.handlers.onWarningClicked?.(message.warningId);
      }
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  public showAnalysis(payload: WebviewAnalysisPayload): void {
    this.analysisPayload = payload;
    this.open();
    this.panel?.webview.postMessage({
      type: 'analysisResult',
      payload
    });
  }

  public setAnalysis(payload: WebviewAnalysisPayload): void {
    this.analysisPayload = payload;
    this.panel?.webview.postMessage({
      type: 'analysisResult',
      payload
    });
  }

  public showLoading(message = 'Running analyzer...'): void {
    this.open();
    this.panel?.webview.postMessage({
      type: 'analysisLoading',
      message
    });
  }

  public showError(message: string): void {
    this.open();
    this.panel?.webview.postMessage({
      type: 'analysisError',
      message
    });
  }

  public dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private renderHtml(): string {
    if (!this.panel) {
      return '';
    }

    const initialState = JSON.stringify({
      analysisPayload: this.analysisPayload
    }).replace(/</g, '\\u003c');
    const nonce = getNonce();
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'assets', 'index.js')
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'assets', 'index.css')
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
  <title>IntentTrace Verification View</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__INTENTTRACE_VIEW_KIND__ = 'results'; window.__INTENTTRACE_INITIAL_STATE__ = ${initialState};</script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function isNodeClickedMessage(message: unknown): message is { type: 'nodeClicked'; nodeId: string } {
  return typeof message === 'object'
    && message !== null
    && (message as { type?: unknown }).type === 'nodeClicked'
    && typeof (message as { nodeId?: unknown }).nodeId === 'string';
}

function isWarningClickedMessage(message: unknown): message is { type: 'warningClicked'; warningId: string } {
  return typeof message === 'object'
    && message !== null
    && (message as { type?: unknown }).type === 'warningClicked'
    && typeof (message as { warningId?: unknown }).warningId === 'string';
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
