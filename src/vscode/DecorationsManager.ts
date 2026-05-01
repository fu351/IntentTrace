import * as path from 'path';
import * as vscode from 'vscode';
import type { FlowGraph, FlowNode } from '../types/flowchart';
import type { SourceSpan } from '../types/program';
import type { VerificationWarning } from '../types/verification';

interface AnalysisState {
  flowGraph: FlowGraph;
  warnings: VerificationWarning[];
}

type DecorationBucket = 'relevant' | 'vestigial' | 'warning' | 'error' | 'unsupported';

export class DecorationsManager implements vscode.Disposable {
  private readonly relevantDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('charts.green'),
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });

  private readonly vestigialDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    opacity: '0.45',
    overviewRulerColor: new vscode.ThemeColor('descriptionForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });

  private readonly warningDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    textDecoration: 'underline wavy',
    overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    light: {
      textDecoration: 'underline wavy #9a6700'
    },
    dark: {
      textDecoration: 'underline wavy #cca700'
    }
  });

  private readonly errorDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    textDecoration: 'underline wavy',
    backgroundColor: new vscode.ThemeColor('inputValidation.errorBackground'),
    overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    light: {
      textDecoration: 'underline wavy #cf222e'
    },
    dark: {
      textDecoration: 'underline wavy #f85149'
    }
  });

  private readonly unsupportedDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    border: '1px dashed',
    borderColor: new vscode.ThemeColor('descriptionForeground'),
    overviewRulerColor: new vscode.ThemeColor('descriptionForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });

  private state: AnalysisState | undefined;
  private readonly visibleEditorListener: vscode.Disposable;

  public constructor() {
    this.visibleEditorListener = vscode.window.onDidChangeVisibleTextEditors(() => {
      this.applyToVisibleEditors();
    });
  }

  public applyAnalysis(flowGraph: FlowGraph, warnings: VerificationWarning[]): void {
    this.state = { flowGraph, warnings };
    this.applyToVisibleEditors();
  }

  public async revealNode(nodeId: string): Promise<void> {
    const node = this.state?.flowGraph.nodes.find((candidate) => candidate.nodeId === nodeId);
    if (!node) {
      vscode.window.showWarningMessage(`IntentTrace could not find flow node ${nodeId}.`);
      return;
    }

    await this.revealFirstSpan(node.sourceSpans);
  }

  public async revealWarning(warningId: string): Promise<void> {
    const warning = this.state?.warnings.find((candidate) => candidate.warningId === warningId);
    if (!warning) {
      vscode.window.showWarningMessage(`IntentTrace could not find warning ${warningId}.`);
      return;
    }

    await this.revealFirstSpan(warning.sourceSpans);
  }

  public dispose(): void {
    this.visibleEditorListener.dispose();
    this.relevantDecoration.dispose();
    this.vestigialDecoration.dispose();
    this.warningDecoration.dispose();
    this.errorDecoration.dispose();
    this.unsupportedDecoration.dispose();
  }

  private applyToVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.applyToEditor(editor);
    }
  }

  private applyToEditor(editor: vscode.TextEditor): void {
    const buckets: Record<DecorationBucket, vscode.DecorationOptions[]> = {
      relevant: [],
      vestigial: [],
      warning: [],
      error: [],
      unsupported: []
    };

    if (this.state) {
      const warningsById = new Map(
        this.state.warnings.map((warning) => [warning.warningId, warning])
      );

      for (const node of this.state.flowGraph.nodes) {
        const bucket = this.bucketForNode(node);
        for (const span of node.sourceSpans) {
          if (!this.spanMatchesEditor(span, editor)) {
            continue;
          }

          buckets[bucket].push({
            range: this.rangeForSpan(editor.document, span),
            hoverMessage: this.hoverForNode(node, warningsById)
          });
        }
      }
    }

    editor.setDecorations(this.relevantDecoration, buckets.relevant);
    editor.setDecorations(this.vestigialDecoration, buckets.vestigial);
    editor.setDecorations(this.warningDecoration, buckets.warning);
    editor.setDecorations(this.errorDecoration, buckets.error);
    editor.setDecorations(this.unsupportedDecoration, buckets.unsupported);
  }

  private bucketForNode(node: FlowNode): DecorationBucket {
    if (node.status === 'error') {
      return 'error';
    }
    if (node.status === 'warning') {
      return 'warning';
    }
    if (node.status === 'vestigial') {
      return 'vestigial';
    }
    if (node.status === 'unsupported') {
      return 'unsupported';
    }
    return 'relevant';
  }

  private hoverForNode(node: FlowNode, warningsById: Map<string, VerificationWarning>): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.isTrusted = false;
    markdown.appendMarkdown(`**${node.title}**  \n${node.description}`);

    for (const warningId of node.warningIds) {
      const warning = warningsById.get(warningId);
      if (!warning) {
        continue;
      }
      markdown.appendMarkdown(`\n\n**${warning.title}**  \n${warning.userMessage}`);
    }

    return markdown;
  }

  private async revealFirstSpan(spans: SourceSpan[]): Promise<void> {
    const span = spans[0];
    if (!span) {
      vscode.window.showWarningMessage('IntentTrace item has no source location.');
      return;
    }

    const uri = vscode.Uri.file(this.resolveSpanPath(span.filePath));
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });
    const range = this.rangeForSpan(document, span);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private spanMatchesEditor(span: SourceSpan, editor: vscode.TextEditor): boolean {
    return normalizePath(this.resolveSpanPath(span.filePath)) === normalizePath(editor.document.uri.fsPath);
  }

  private resolveSpanPath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return path.join(workspaceFolder.uri.fsPath, filePath);
    }

    return filePath;
  }

  private rangeForSpan(document: vscode.TextDocument, span: SourceSpan): vscode.Range {
    const startLine = clamp(span.startLine - 1, 0, Math.max(document.lineCount - 1, 0));
    const endLine = clamp(span.endLine - 1, startLine, Math.max(document.lineCount - 1, 0));
    const startCharacter = Math.max(span.startColumn, 0);
    const endCharacter = span.endColumn > 0
      ? span.endColumn
      : document.lineAt(endLine).range.end.character;

    return new vscode.Range(
      new vscode.Position(startLine, Math.min(startCharacter, document.lineAt(startLine).range.end.character)),
      new vscode.Position(endLine, Math.min(endCharacter, document.lineAt(endLine).range.end.character))
    );
  }
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
