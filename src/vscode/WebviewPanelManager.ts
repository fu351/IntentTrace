import * as vscode from 'vscode';
import type { FlowGraph } from '../types/flowchart';
import type { VerificationWarning } from '../types/verification';

export interface WebviewAnalysisPayload {
  flowGraph: FlowGraph;
  warnings: VerificationWarning[];
}

export class WebviewPanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private analysisPayload: WebviewAnalysisPayload | undefined;

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'intenttrace.verificationView',
      'IntentTrace',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [this.extensionUri]
      }
    );

    this.panel.webview.html = this.renderHtml();
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

  public dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private renderHtml(): string {
    const initialPayload = JSON.stringify(this.analysisPayload ?? null).replace(/</g, '\\u003c');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IntentTrace Verification View</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 24px;
    }

    header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }

    h1 {
      font-size: 20px;
      font-weight: 600;
      margin: 0;
    }

    p {
      margin: 0;
      color: var(--vscode-descriptionForeground);
    }

    .summary {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .graph {
      display: grid;
      gap: 10px;
    }

    .node {
      border: 1px solid var(--vscode-panel-border);
      border-left-width: 4px;
      border-radius: 6px;
      padding: 10px 12px;
      background: var(--vscode-editorWidget-background);
    }

    .node[data-status="relevant"] {
      border-left-color: var(--vscode-charts-green);
    }

    .node[data-status="vestigial"] {
      border-left-color: var(--vscode-descriptionForeground);
      opacity: 0.78;
    }

    .node[data-status="warning"] {
      border-left-color: var(--vscode-editorWarning-foreground);
    }

    .node[data-status="error"] {
      border-left-color: var(--vscode-editorError-foreground);
    }

    .node[data-status="unsupported"] {
      border-left-color: var(--vscode-editorInfo-foreground);
    }

    .node-title {
      color: var(--vscode-foreground);
      font-weight: 600;
      margin-bottom: 4px;
    }

    .node-meta {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      margin-top: 8px;
    }

    .warnings {
      margin-top: 20px;
      display: grid;
      gap: 8px;
    }

    .warning {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px 12px;
      background: var(--vscode-inputValidation-warningBackground);
    }

    .warning[data-severity="error"] {
      background: var(--vscode-inputValidation-errorBackground);
    }
  </style>
</head>
<body>
  <header>
    <h1>IntentTrace Verification View</h1>
    <div id="summary" class="summary"></div>
  </header>
  <main>
    <section id="graph" class="graph">
      <p>Run the verifier to load analyzer output.</p>
    </section>
    <section id="warnings" class="warnings"></section>
  </main>
  <script id="initial-data" type="application/json">${initialPayload}</script>
  <script>
    const graphContainer = document.getElementById('graph');
    const warningContainer = document.getElementById('warnings');
    const summary = document.getElementById('summary');

    function render(payload) {
      if (!payload || !payload.flowGraph) {
        return;
      }

      const graph = payload.flowGraph;
      const warnings = payload.warnings || [];
      summary.textContent = graph.nodes.length + ' operations, ' + warnings.length + ' warnings';
      graphContainer.replaceChildren(...graph.nodes.map(renderNode));
      warningContainer.replaceChildren(...warnings.map(renderWarning));
    }

    function renderNode(node) {
      const element = document.createElement('article');
      element.className = 'node';
      element.dataset.status = node.status;

      const title = document.createElement('div');
      title.className = 'node-title';
      title.textContent = node.title + ' [' + node.status + ']';

      const description = document.createElement('p');
      description.textContent = node.description;

      const meta = document.createElement('div');
      meta.className = 'node-meta';
      meta.textContent = 'Op ' + node.opId + ' · Source nodes ' + node.sourceNodeIds.join(', ');

      element.append(title, description, meta);
      return element;
    }

    function renderWarning(warning) {
      const element = document.createElement('article');
      element.className = 'warning';
      element.dataset.severity = warning.severity;

      const title = document.createElement('div');
      title.className = 'node-title';
      title.textContent = warning.title + ' [' + warning.kind + ']';

      const message = document.createElement('p');
      message.textContent = warning.userMessage;

      element.append(title, message);
      return element;
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'analysisResult') {
        render(event.data.payload);
      }
    });

    render(JSON.parse(document.getElementById('initial-data').textContent));
  </script>
</body>
</html>`;
  }
}
