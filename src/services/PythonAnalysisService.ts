import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { FlowGraph } from '../types/flowchart';
import type { VerificationWarning } from '../types/verification';

export interface RunVerifierInput {
  codeFileUri: vscode.Uri;
  intent: Record<string, unknown>;
}

export interface AnalyzerResult {
  flowGraph: FlowGraph;
  warnings: VerificationWarning[];
  [key: string]: unknown;
}

interface PythonCandidate {
  command: string;
  baseArgs: string[];
}

export class PythonAnalysisService {
  public constructor(private readonly extensionUri: vscode.Uri) {}

  public async runVerifier(input: RunVerifierInput): Promise<AnalyzerResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'intenttrace-'));
    const intentPath = path.join(tempDir, 'intent.json');

    try {
      await fs.writeFile(intentPath, JSON.stringify(input.intent, null, 2), 'utf8');

      const analyzerPath = path.join(this.extensionUri.fsPath, 'analyzer', 'main.py');
      const result = await this.runAnalyzer(analyzerPath, input.codeFileUri.fsPath, intentPath);
      return this.parseAnalyzerResult(result.stdout);
    } finally {
      await fs.rm(tempDir, { force: true, recursive: true });
    }
  }

  private async runAnalyzer(analyzerPath: string, codePath: string, intentPath: string): Promise<{ stdout: string; stderr: string }> {
    const args = [
      analyzerPath,
      'verify',
      '--code',
      codePath,
      '--intent',
      intentPath
    ];

    const candidates: PythonCandidate[] = [
      { command: 'python', baseArgs: [] },
      { command: 'python3', baseArgs: [] }
    ];

    if (process.platform === 'win32') {
      candidates.push({ command: 'py', baseArgs: ['-3'] });
    }

    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        return await execFileAsync(candidate.command, [...candidate.baseArgs, ...args]);
      } catch (error) {
        if (!isMissingExecutableError(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Unable to find a Python executable.');
  }

  private parseAnalyzerResult(stdout: string): AnalyzerResult {
    let payload: unknown;
    try {
      payload = JSON.parse(stdout);
    } catch (error) {
      throw new Error(`Analyzer returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!isAnalyzerResult(payload)) {
      throw new Error('Analyzer JSON is missing flowGraph or warnings.');
    }

    return payload;
  }
}

function execFileAsync(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr.trim() || stdout.trim() || error.message;
        error.message = message;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function isMissingExecutableError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isAnalyzerResult(value: unknown): value is AnalyzerResult {
  return typeof value === 'object'
    && value !== null
    && 'flowGraph' in value
    && 'warnings' in value
    && Array.isArray((value as { warnings: unknown }).warnings);
}
