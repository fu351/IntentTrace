const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const packageJson = JSON.parse(read('package.json'));
const sidebarView = packageJson.contributes?.views?.intenttrace?.find((view) => view.id === 'intenttrace.sidebar');

assert(sidebarView, 'intenttrace.sidebar view is missing from package.json.');
assert(sidebarView.type === 'webview', 'intenttrace.sidebar must be contributed with type="webview".');
assert(packageJson.activationEvents.includes('onView:intenttrace.sidebar'), 'Missing onView activation event for sidebar.');

const extensionSource = read('src/extension.ts');
assert(extensionSource.includes('registerWebviewViewProvider'), 'Extension does not register a WebviewViewProvider.');
assert(extensionSource.includes('IntentTraceSidebarProvider.viewType'), 'Sidebar provider view type is not registered.');
assert(!extensionSource.includes("from './commands/inferIntent'"), 'Command Palette infer path should not bypass the sidebar workflow.');
assert(!extensionSource.includes("from './commands/generateCode'"), 'Command Palette generate path should not bypass the sidebar workflow.');
assert(!extensionSource.includes("from './commands/runVerifier'"), 'Command Palette verifier path should not bypass the sidebar workflow.');
for (const oldCommandFile of ['inferIntent.ts', 'generateCode.ts', 'runVerifier.ts']) {
  assert(!fs.existsSync(path.join(root, 'src/commands', oldCommandFile)), `Dead command module should not remain: ${oldCommandFile}.`);
}

const sidebarSource = read('src/vscode/IntentTraceSidebarProvider.ts');
const webviewApiSource = read('webview/src/vscodeApi.ts');
const appSource = read('webview/src/App.tsx');

const messageTypes = [
  'pickCsv',
  'inferIntent',
  'generateCode',
  'runVerifier',
  'openResultsPanel',
  'openGeneratedCode',
  'openIntentDocument',
  'nodeClicked',
  'warningClicked'
];

for (const type of messageTypes) {
  assert(webviewApiSource.includes(`type: '${type}'`) || webviewApiSource.includes(`type: "${type}"`), `Webview API does not post ${type}.`);
  assert(sidebarSource.includes(`'${type}'`) || sidebarSource.includes(`"${type}"`), `Sidebar provider does not handle ${type}.`);
}

for (const label of [
  'Choose CSV',
  'Infer Intent',
  'Generate Code',
  'Run Verifier',
  'Open Flowchart Results',
  'Open Generated Code',
  'Open Technical Intent'
]) {
  assert(appSource.includes(label), `Sidebar button label is missing: ${label}.`);
}
assert(appSource.includes('Intent Review'), 'Sidebar should show a plain-language intent review panel.');
assert(!appSource.includes('Confirmed Intent JSON'), 'Sidebar should not expose raw JSON as the main intent editor.');

assert(sidebarSource.includes("'.intenttrace'"), 'Generated code should be saved under .intenttrace.');
assert(sidebarSource.includes("'generated_analysis.py'"), 'Generated code filename should be generated_analysis.py.');
assert(!sidebarSource.includes('pickJsonPath'), 'Sidebar workflow must not ask for JSON file input.');
assert(!sidebarSource.includes('showOpenDialog') || sidebarSource.includes('pickAndInferSchema'), 'Sidebar should only open a file picker through CSV schema selection.');

const panelSource = read('src/vscode/WebviewPanelManager.ts');
assert(panelSource.includes('retainContextWhenHidden: true'), 'Results panel must retain context when hidden.');
assert(panelSource.includes('ViewColumn.Beside'), 'Results panel should open beside source code.');

const decorationsSource = read('src/vscode/DecorationsManager.ts');
assert(decorationsSource.includes('viewColumn: vscode.ViewColumn.One'), 'Source navigation should open code in the source editor column.');

const lmSource = read('src/services/llm/VSCodeLMProvider.ts');
assert(lmSource.includes('vscode.lm'), 'VS Code LM provider must use the VS Code Language Model API.');
assert(lmSource.includes('not available') && lmSource.includes('Sign in'), 'LM provider should expose actionable availability/sign-in errors.');

for (const requiredPath of [
  'media/intenttrace.svg',
  'src/services/CsvSchemaService.ts',
  'webview/src/App.tsx',
  'webview/src/vscodeApi.ts',
  'analyzer/main.py'
]) {
  assert(fs.existsSync(path.join(root, requiredPath)), `Required runtime/source file is missing: ${requiredPath}.`);
}

console.log('IntentTrace extension smoke checks passed.');
