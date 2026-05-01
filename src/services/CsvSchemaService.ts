import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { DatasetColumn, DatasetSchema } from '../types/schema';

const SAMPLE_ROW_LIMIT = 50;
const SAMPLE_VALUE_LIMIT = 5;

export class CsvSchemaService {
  public async pickAndInferSchema(): Promise<DatasetSchema | undefined> {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { CSV: ['csv'] },
      title: 'Select CSV for IntentTrace'
    });

    const csvUri = selection?.[0];
    return csvUri ? this.inferSchema(csvUri) : undefined;
  }

  public async inferSchema(csvUri: vscode.Uri): Promise<DatasetSchema> {
    const raw = await fs.readFile(csvUri.fsPath, 'utf8');
    const rows = parseCsv(raw, SAMPLE_ROW_LIMIT + 1);
    if (rows.length === 0 || rows[0].length === 0) {
      throw new Error('CSV file is empty or does not contain a header row.');
    }

    const headers = rows[0].map((header, index) => header.trim() || `column_${index + 1}`);
    const dataRows = rows.slice(1);

    return {
      sourcePath: toWorkspaceRelativePath(csvUri.fsPath),
      columns: headers.map((header, index) => inferColumn(header, dataRows.map((row) => row[index]))),
      rowCount: Math.max(0, countDataRows(raw))
    };
  }
}

function inferColumn(name: string, values: Array<string | undefined>): DatasetColumn {
  const normalized = values.map((value) => value?.trim() ?? '');
  const nonEmptyValues = normalized.filter((value) => value.length > 0);
  const samples = Array.from(new Set(nonEmptyValues)).slice(0, SAMPLE_VALUE_LIMIT);

  return {
    name,
    type: inferType(nonEmptyValues),
    nullable: normalized.length === 0 || normalized.some((value) => value.length === 0),
    sampleValues: samples
  };
}

function inferType(values: string[]): DatasetColumn['type'] {
  if (values.length === 0) {
    return 'unknown';
  }

  if (values.every((value) => value === 'true' || value === 'false' || value === 'True' || value === 'False')) {
    return 'boolean';
  }

  if (values.every((value) => Number.isFinite(Number(value)))) {
    return 'number';
  }

  if (values.every((value) => isLikelyDate(value))) {
    return 'date';
  }

  return 'string';
}

function isLikelyDate(value: string): boolean {
  if (!/[/-]/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function parseCsv(raw: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
        if (rows.length >= maxRows) {
          return rows;
        }
      }
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function countDataRows(raw: string): number {
  const rows = parseCsv(raw, Number.MAX_SAFE_INTEGER);
  return Math.max(0, rows.length - 1);
}

function toWorkspaceRelativePath(filePath: string): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.find((folder) => {
    const relative = path.relative(folder.uri.fsPath, filePath);
    return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
  });

  return workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, filePath) : filePath;
}
