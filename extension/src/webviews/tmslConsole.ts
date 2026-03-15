import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';

let panel: vscode.WebviewPanel | undefined;

const TEMPLATES: Record<string, string> = {
    'ProcessFull — Database': JSON.stringify({ refresh: { type: 'full', objects: [{ database: '<database>' }] } }, null, 2),
    'ProcessFull — Table': JSON.stringify({ refresh: { type: 'full', objects: [{ database: '<database>', table: '<table>' }] } }, null, 2),
    'ProcessAdd — Partition': JSON.stringify({ refresh: { type: 'processAdd', objects: [{ database: '<database>', table: '<table>', partition: '<partition>' }] } }, null, 2),
    'ClearValues — Table': JSON.stringify({ refresh: { type: 'clearValues', objects: [{ database: '<database>', table: '<table>' }] } }, null, 2),
};

export function openTmslConsole(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager
): void {
    if (panel) {
        panel.reveal();
        return;
    }

    panel = vscode.window.createWebviewPanel(
        'tabularcraft.tmslConsole',
        'TMSL Console',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
    panel.webview.html = buildHtml();

    panel.webview.onDidReceiveMessage(
        async (message: { command: string; script?: string; template?: string }) => {
            if (message.command === 'execute') {
                const script = message.script?.trim();
                if (!script) return;
                try {
                    const result = await connectionManager.executeTmsl(script);
                    panel!.webview.postMessage({ command: 'result', result });
                } catch (err) {
                    panel!.webview.postMessage({ command: 'error', message: (err as Error).message });
                }
            } else if (message.command === 'loadTemplate') {
                const tmpl = TEMPLATES[message.template ?? ''];
                if (tmpl) {
                    panel!.webview.postMessage({ command: 'setScript', script: tmpl });
                }
            }
        },
        null,
        context.subscriptions
    );
}

function buildHtml(): string {
    const templateNames = Object.keys(TEMPLATES).map((t) => `<option>${escHtml(t)}</option>`).join('');
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>TMSL Console</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
  h2 { margin-top: 0; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
  select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); padding: 4px 6px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  textarea { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 8px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); resize: none; }
  #output-label { font-weight: bold; margin: 8px 0 4px; }
  #output { height: 180px; overflow-y: auto; background: var(--vscode-terminal-background, var(--vscode-editor-background)); color: var(--vscode-terminal-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-widget-border); padding: 8px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; }
  .error { color: var(--vscode-inputValidation-errorForeground); }
</style>
</head>
<body>
<h2>TMSL Console</h2>
<div class="toolbar">
  <select id="template-select">
    <option value="">— Load template —</option>
    ${templateNames}
  </select>
  <button onclick="loadTemplate()">Load</button>
  <button onclick="execute()">▶ Execute</button>
  <button onclick="clearOutput()">Clear output</button>
</div>
<textarea id="script" placeholder='{ "refresh": { "type": "full", "objects": [ ... ] } }'></textarea>
<div id="output-label">Output</div>
<div id="output"></div>
<script>
const vscode = acquireVsCodeApi();

function execute() {
  const script = document.getElementById('script').value;
  vscode.postMessage({ command: 'execute', script });
  appendOutput('⏳ Executing…');
}

function loadTemplate() {
  const sel = document.getElementById('template-select');
  const name = sel.options[sel.selectedIndex].text;
  vscode.postMessage({ command: 'loadTemplate', template: name });
}

function clearOutput() {
  document.getElementById('output').innerHTML = '';
}

function appendOutput(text, isError) {
  const out = document.getElementById('output');
  const div = document.createElement('div');
  if (isError) div.className = 'error';
  div.textContent = text;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.command === 'result') appendOutput('✅ ' + (msg.result || 'OK'));
  if (msg.command === 'error') appendOutput('❌ ' + msg.message, true);
  if (msg.command === 'setScript') document.getElementById('script').value = msg.script;
});
</script>
</body>
</html>`;
}

function escHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
