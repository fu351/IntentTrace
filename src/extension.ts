import * as vscode from 'vscode';
import { registerRunVerifierCommand } from './commands/runVerifier';
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

  const startCommand = vscode.commands.registerCommand('intenttrace.start', () => {
    webviewPanelManager.open();
  });
  const runVerifierCommand = registerRunVerifierCommand(
    context,
    analysisService,
    webviewPanelManager,
    decorationsManager
  );

  context.subscriptions.push(startCommand, runVerifierCommand, webviewPanelManager, decorationsManager);
}

export function deactivate(): void {
  // No background resources to clean up yet.
}
