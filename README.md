# IntentTrace

IntentTrace is a VS Code extension for checking whether LLM-generated Python data-analysis code still matches a confirmed intent specification. It combines VS Code's Language Model API for intent/code generation with a deterministic Python analyzer for AST parsing, slicing, semantic lowering, verification warnings and flowgraph rendering.

IntentTrace is intended for local `.vsix` distribution during the project demo. It is not configured for Marketplace publishing.

## What Is Included

- VS Code commands for starting the IntentTrace webview, inferring intent, generating Python code and running verification.
- A React webview flowchart UI built into `webview/dist`.
- A Python analyzer under `analyzer/` that runs from the packaged extension folder.
- Demo files under `demo/` showing wrong aggregation, wrong chart type and vestigial code.

The verifier does not use an LLM. Slicing, semantic mismatch detection, warning generation and flowgraph node status are handled by the deterministic Python analyzer.

## Prerequisites

- VS Code `1.90.0` or newer.
- Node.js compatible with the project toolchain. Node `20.19+` or `22.12+` is recommended for the current Vite version.
- Python 3 available as `python`, `python3` or `py -3`.
- For intent inference and code generation, sign in to a VS Code Language Model provider such as GitHub Copilot. No OpenAI or Anthropic API key is required for the default path.
- The `code` command must be on your PATH if you want to use `npm run install:local`.

The analyzer only parses Python source for the verifier demo; it does not execute the analysis script.

## Build And Package A Local VSIX

From the repo root:

```powershell
npm install
npm run package:vsix
```

This builds the webview, compiles the extension TypeScript and writes:

```text
dist/intenttrace.vsix
```

The package includes the compiled extension entrypoint, built webview assets, analyzer Python files, analyzer fixtures and demo files. It should not rely on absolute paths from the original developer machine.

## Install Locally From VSIX

Option 1, from the command line:

```powershell
npm run install:local
```

Option 2, from VS Code:

1. Open the Extensions view.
2. Open the `...` menu.
3. Choose `Install from VSIX...`.
4. Select `dist/intenttrace.vsix`.
5. Reload VS Code if prompted.

To reinstall after rebuilding, run `npm run package:vsix` again and then `npm run install:local`.

## Run The Demo

1. Open this cloned repo folder in VS Code.
2. Install the local VSIX using one of the methods above.
3. Open `demo/analysis_bad.py`.
4. Set the workspace setting `intenttrace.intentPath` to:

```json
"demo/intent_weather.json"
```

You can set it in `.vscode/settings.json` for the workspace:

```json
{
  "intenttrace.intentPath": "demo/intent_weather.json"
}
```

5. Run `IntentTrace: Run Verifier` from the Command Palette.

Expected demo result:

- The IntentTrace webview opens with a semantic flowchart.
- The relevant slice includes reading the CSV, dropping missing values, grouping by state, counting temperature and plotting.
- Backup, print and unrelated humidity analysis nodes are dimmed as vestigial.
- Warnings show wrong aggregation because the code uses `count` instead of `mean`.
- Warnings show wrong chart type because the code uses `plt.plot` instead of `plt.bar`.
- Clicking nodes or warnings navigates back to the source line in `demo/analysis_bad.py`.

## Commands

- `IntentTrace: Start` opens the verification webview.
- `IntentTrace: Infer Intent` uses the VS Code Language Model API to convert a prompt and dataset schema into editable IntentDSL JSON.
- `IntentTrace: Generate Code` uses the VS Code Language Model API to generate starter Python code from confirmed IntentDSL.
- `IntentTrace: Run Verifier` runs the packaged Python analyzer on the active Python file and sends the results to the webview.

## Useful Developer Commands

```powershell
npm run compile
npm run compile:all
npm run package:vsix
npm run install:local
npm test
python analyzer/main.py verify --code demo/analysis_bad.py --intent demo/intent_weather.json
```

`npm run compile:all` is the safest build check before packaging because it compiles both the webview and extension host code.

## Notes For Classmates

- You do not need Marketplace publishing access.
- You do not need an OpenAI or Anthropic API key.
- If `IntentTrace: Infer Intent` or `IntentTrace: Generate Code` reports that no language model is available, sign in to a VS Code Language Model provider and try again.
- If `IntentTrace: Run Verifier` cannot find Python, make sure Python 3 is available from your terminal as `python`, `python3` or `py -3`.
