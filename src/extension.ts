import * as vscode from 'vscode';
import { registerGenerateCodeCommand } from './commands/generateCode';
import { registerInferIntentCommand } from './commands/inferIntent';
import { registerRunVerifierCommand } from './commands/runVerifier';
import { LLMProviderFactory } from './services/llm/LLMProviderFactory';
import { PythonAnalysisService } from './services/PythonAnalysisService';
import { DecorationsManager } from './vscode/DecorationsManager';
import { WebviewPanelManager } from './vscode/WebviewPanelManager';

export function activate(context: vscode.ExtensionContext): void {
  const decorationsManager = new DecorationsManager();
  const webviewPanelManager = new WebviewPanelManager(context.extensionUri, {
    onNodeClicked: (nodeId) => decorationsManager.revealNode(nodeId),
    onWarningClicked: (warningId) => decorationsManager.revealWarning(warningId)
  });
  const analysisService = new PythonAnalysisService(context.extensionUri);
  const llmProvider = new LLMProviderFactory().createDefaultProvider();

  const startCommand = vscode.commands.registerCommand('intenttrace.start', () => {
    webviewPanelManager.open();
  });
  const inferIntentCommand = registerInferIntentCommand(llmProvider);
  const generateCodeCommand = registerGenerateCodeCommand(llmProvider);
  const runVerifierCommand = registerRunVerifierCommand(
    context,
    analysisService,
    webviewPanelManager,
    decorationsManager
  );

  context.subscriptions.push(
    startCommand,
    inferIntentCommand,
    generateCodeCommand,
    runVerifierCommand,
    webviewPanelManager,
    decorationsManager
  );
}

export function deactivate(): void {
  // No background resources to clean up yet.
}
