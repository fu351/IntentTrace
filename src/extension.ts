import * as vscode from 'vscode';
import { registerRunVerifierCommand } from './commands/runVerifier';
import { PythonAnalysisService } from './services/PythonAnalysisService';
import { WebviewPanelManager } from './vscode/WebviewPanelManager';

export function activate(context: vscode.ExtensionContext): void {
  const webviewPanelManager = new WebviewPanelManager(context.extensionUri);
  const analysisService = new PythonAnalysisService(context.extensionUri);

  const startCommand = vscode.commands.registerCommand('intenttrace.start', () => {
    webviewPanelManager.open();
  });
  const runVerifierCommand = registerRunVerifierCommand(context, analysisService, webviewPanelManager);

  context.subscriptions.push(startCommand, runVerifierCommand, webviewPanelManager);
}

export function deactivate(): void {
  // No background resources to clean up yet.
}
