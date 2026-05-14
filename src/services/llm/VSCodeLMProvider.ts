import * as vscode from 'vscode';
import type { IntentDSL } from '../../types/intent';
import type { DatasetSchema } from '../../types/schema';
import type { LLMProvider } from './LLMProvider';

export class VSCodeLMProvider implements LLMProvider {
  public readonly name = 'VS Code Language Model API';

  public async inferIntent(input: {
    userPrompt: string;
    datasetSchema: DatasetSchema;
    cancellationToken?: vscode.CancellationToken;
  }): Promise<IntentDSL> {
    const text = await this.sendJsonRequest([
      vscode.LanguageModelChatMessage.User(buildInferIntentPrompt(input.userPrompt, input.datasetSchema))
    ], input.cancellationToken);

    const parsed = parseJsonObject(text);
    return normalizeIntent(parsed, input.userPrompt, input.datasetSchema);
  }

  public async generateCode(input: {
    intent: IntentDSL;
    datasetSchema: DatasetSchema;
    existingCode?: string;
    cancellationToken?: vscode.CancellationToken;
  }): Promise<string> {
    const prompt = input.existingCode
      ? buildModifyCodePrompt(input.intent, input.datasetSchema, input.existingCode)
      : buildGenerateCodePrompt(input.intent, input.datasetSchema);

    const text = await this.sendJsonRequest([
      vscode.LanguageModelChatMessage.User(prompt)
    ], input.cancellationToken);

    return stripMarkdownFence(text).trim();
  }

  private async sendJsonRequest(
    messages: vscode.LanguageModelChatMessage[],
    cancellationToken?: vscode.CancellationToken
  ): Promise<string> {
    const model = await this.selectModel();
    const response = await model.sendRequest(
      messages,
      {
        justification: 'IntentTrace uses the language model only to infer editable intent JSON or generate starter Python code.'
      },
      cancellationToken
    );

    let text = '';
    for await (const chunk of response.text) {
      text += chunk;
    }
    return text;
  }

  private async selectModel(): Promise<vscode.LanguageModelChat> {
    if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') {
      throw new Error('The VS Code Language Model API is not available in this VS Code build. Update VS Code and sign in to a language model provider such as GitHub Copilot.');
    }

    const configuredModel = vscode.workspace.getConfiguration('intenttrace').get<string>('languageModel');
    const selectors: vscode.LanguageModelChatSelector[] = configuredModel
      ? [{ id: configuredModel }]
      : [{ vendor: 'copilot' }, {}];

    for (const selector of selectors) {
      let models: vscode.LanguageModelChat[];
      try {
        models = await vscode.lm.selectChatModels(selector);
      } catch (error) {
        throw new Error(`VS Code could not list language models: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (models.length > 0) {
        return models[0];
      }
    }

    throw new Error('No VS Code language model is available. Sign in to GitHub Copilot or another VS Code language model provider, then try Infer Intent again.');
  }
}

function buildInferIntentPrompt(userPrompt: string, datasetSchema: DatasetSchema): string {
  return [
    'You are IntentTrace. Convert a user data-analysis request and CSV schema into an editable IntentDSL JSON object.',
    'Return only valid JSON. Do not include markdown.',
    'The JSON must use these top-level fields when inferable: prompt, dataset, groupBy, measure, aggregation, chartType, operations, expectedVisualization.',
    'Valid aggregation values include: mean, count, sum, min, max, median, percentage. Use "percentage" when the user asks for a share, proportion, or percent of a total.',
    'When labels are obvious, include expectedVisualization.xLabel, expectedVisualization.yLabel, and expectedVisualization.title.',
    'Do not invent columns that are not present in the schema.',
    'Use simple operation names such as ReadCSV, DropNA, GroupBy, Aggregate, Plot.',
    '',
    `User prompt: ${userPrompt}`,
    '',
    `Dataset schema JSON: ${JSON.stringify(datasetSchema, null, 2)}`,
    '',
    'Return IntentDSL JSON now.'
  ].join('\n');
}

function buildGenerateCodePrompt(intent: IntentDSL, datasetSchema: DatasetSchema): string {
  return [
    'You are IntentTrace. Generate a concise top-level Python pandas/matplotlib script from a confirmed IntentDSL.',
    'Return only Python code. Do not include markdown fences or explanations.',
    'Use pandas as pd and matplotlib.pyplot as plt.',
    'Use the CSV path from dataset.sourcePath.',
    'Keep the code simple so deterministic program analysis can inspect it.',
    'Do not perform slicing, verification, warning generation, or semantic mismatch detection.',
    '',
    `IntentDSL JSON: ${JSON.stringify(intent, null, 2)}`,
    '',
    `Dataset schema JSON: ${JSON.stringify(datasetSchema, null, 2)}`,
    '',
    'Return Python code now.'
  ].join('\n');
}

function buildModifyCodePrompt(intent: IntentDSL, datasetSchema: DatasetSchema, existingCode: string): string {
  return [
    'You are IntentTrace. You have an existing Python analysis script and a new IntentDSL.',
    'The new intent may describe an ADDITIONAL visualization, not a replacement.',
    'If the new intent describes a different chart than what already exists in the code, ADD the new visualization code after the existing code. Do not remove or replace existing plots.',
    'If the new intent describes the same visualization with modified parameters (e.g., changed aggregation, different columns), then modify the existing code in place.',
    'Return the complete Python script. Do not include markdown fences or explanations.',
    'Preserve existing imports, variable names, and data loading code.',
    'Use pandas as pd and matplotlib.pyplot as plt.',
    'Keep the code simple so deterministic program analysis can inspect it.',
    '',
    `IntentDSL JSON: ${JSON.stringify(intent, null, 2)}`,
    '',
    `Dataset schema JSON: ${JSON.stringify(datasetSchema, null, 2)}`,
    '',
    'Existing Python code:',
    existingCode,
    '',
    'Return the complete Python script now.'
  ].join('\n');
}

function parseJsonObject(text: string): Record<string, unknown> {
  const candidate = stripMarkdownFence(text).trim();
  try {
    const parsed = JSON.parse(candidate);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to a bracket extraction attempt.
  }

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  throw new Error('Language model did not return a valid JSON object.');
}

function normalizeIntent(value: Record<string, unknown>, userPrompt: string, datasetSchema: DatasetSchema): IntentDSL {
  return {
    ...value,
    prompt: typeof value.prompt === 'string' ? value.prompt : userPrompt,
    dataset: datasetSchema,
    groupBy: normalizeStringArray(value.groupBy),
    measure: normalizeString(value.measure),
    aggregation: normalizeString(value.aggregation),
    chartType: normalizeString(value.chartType),
    operations: normalizeStringArray(value.operations)
  };
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return values.length > 0 ? values : undefined;
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json|python)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}
