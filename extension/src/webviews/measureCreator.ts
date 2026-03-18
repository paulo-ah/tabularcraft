import * as vscode from 'vscode';
import { ConnectionManager, MeasureInfo } from '../connectionManager';

let panel: vscode.WebviewPanel | undefined;
let currentContext:
    | {
        database: string;
        table: string;
    }
    | undefined;

export function openMeasureCreator(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    database: string,
    table: string
): void {
    currentContext = { database, table };
    const title = `New Measure - ${table}`;

    if (!panel) {
        panel = vscode.window.createWebviewPanel(
            'tabularcraft.measureCreator',
            title,
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
            currentContext = undefined;
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(async (message: { command: string; payload?: MeasureInfo }) => {
            if (!panel || !currentContext || message.command !== 'create' || !message.payload) {
                return;
            }

            try {
                await connectionManager.upsertMeasure(currentContext.database, currentContext.table, message.payload);
                panel.webview.postMessage({ command: 'saved', text: `Measure '${message.payload.name}' created.` });
                vscode.commands.executeCommand('tabularcraft.refreshTree');
            } catch (err) {
                panel.webview.postMessage({
                    command: 'error',
                    text: err instanceof Error ? err.message : String(err),
                });
            }
        }, null, context.subscriptions);
    } else {
        panel.reveal(vscode.ViewColumn.One);
    }

    panel.title = title;
    panel.webview.html = buildHtml(table);
}

function buildHtml(table: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>New Measure</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 14px; }
  h2 { margin-top: 0; }
  .group { margin-bottom: 10px; }
  label { display: block; margin-bottom: 4px; font-weight: 600; }
  input, textarea { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; }
  textarea { min-height: 130px; font-family: var(--vscode-editor-font-family); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #status { min-height: 18px; margin-top: 10px; }
  .ok { color: var(--vscode-testing-iconPassed); }
  .err { color: var(--vscode-inputValidation-errorForeground); }
</style>
</head>
<body>
  <h2>Create New Measure - ${escapeHtml(table)}</h2>

  <div class="group">
    <label for="name">Measure Name</label>
    <input id="name" type="text" placeholder="e.g. Total Sales" />
  </div>

  <div class="group">
    <label for="expression">DAX Expression</label>
    <textarea id="expression" placeholder="= SUM(Sales[Amount])"></textarea>
  </div>

  <div class="group">
    <label for="formatString">Format String (optional)</label>
    <input id="formatString" type="text" placeholder="e.g. #,##0.00" />
  </div>

  <button onclick="submitForm()">Create Measure</button>
  <div id="status"></div>

<script>
const vscode = acquireVsCodeApi();

function setStatus(text, isError) {
  const status = document.getElementById('status');
  status.textContent = text;
  status.className = isError ? 'err' : 'ok';
}

function submitForm() {
  const name = String(document.getElementById('name').value || '').trim();
  const expression = String(document.getElementById('expression').value || '').trim();
  const formatString = String(document.getElementById('formatString').value || '').trim() || undefined;

  if (!name) {
    setStatus('Measure name is required.', true);
    return;
  }

  if (!expression) {
    setStatus('DAX expression is required.', true);
    return;
  }

  setStatus('Creating measure...', false);
  vscode.postMessage({
    command: 'create',
    payload: {
      name,
      expression,
      formatString,
    }
  });
}

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.command === 'saved') {
    setStatus(message.text, false);
  }
  if (message.command === 'error') {
    setStatus(message.text, true);
  }
});
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
