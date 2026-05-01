import * as vscode from 'vscode';
import { CsvSchemaService } from './services/CsvSchemaService';
import { LLMProviderFactory } from './services/llm/LLMProviderFactory';
import { PythonAnalysisService } from './services/PythonAnalysisService';
import { DecorationsManager } from './vscode/DecorationsManager';
import { IntentTraceSidebarProvider } from './vscode/IntentTraceSidebarProvider';
import { WebviewPanelManager } from './vscode/WebviewPanelManager';

export function activate(context: vscode.ExtensionContext): void {
  const decorationsManager = new DecorationsManager();
  const analysisService = new PythonAnalysisService(context.extensionUri);
  const schemaService = new CsvSchemaService();
  const llmProvider = new LLMProviderFactory().createDefaultProvider();
  const resultPanelManager = new WebviewPanelManager(context.extensionUri, {
    onNodeClicked: (nodeId) => decorationsManager.revealNode(nodeId),
    onWarningClicked: (warningId) => decorationsManager.revealWarning(warningId)
  });
  const sidebarProvider = new IntentTraceSidebarProvider(
    context,
    llmProvider,
    schemaService,
    analysisService,
    decorationsManager,
    resultPanelManager
  );

  const startCommand = vscode.commands.registerCommand('intenttrace.start', () => {
    sidebarProvider.open();
  });
  const inferIntentCommand = vscode.commands.registerCommand('intenttrace.inferIntent', () => {
    sidebarProvider.showGuidance('Use the sidebar prompt and Choose CSV first, then click Infer Intent.');
  });
  const generateCodeCommand = vscode.commands.registerCommand('intenttrace.generateCode', () => {
    sidebarProvider.showGuidance('Use the sidebar Intent Review fields, then click Generate Code.');
  });
  const runVerifierCommand = vscode.commands.registerCommand('intenttrace.runVerifier', () => {
    sidebarProvider.showGuidance('Use the sidebar Run Verifier button so IntentTrace can use the current intent JSON without asking for a file.');
  });
  const sidebarRegistration = vscode.window.registerWebviewViewProvider(
    IntentTraceSidebarProvider.viewType,
    sidebarProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }
  );

  context.subscriptions.push(
    startCommand,
    inferIntentCommand,
    generateCodeCommand,
    runVerifierCommand,
    sidebarRegistration,
    sidebarProvider,
    resultPanelManager,
    decorationsManager
  );
}

export function deactivate(): void {
  // No background resources to clean up yet.
}
