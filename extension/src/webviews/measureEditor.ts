import * as vscode from 'vscode';
import { ConnectionManager, MeasureInfo } from '../connectionManager';

let panel: vscode.WebviewPanel | undefined;

export async function openMeasureEditor(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    database: string,
    table: string
): Promise<void> {
    if (panel) {
        panel.reveal();
    } else {
        panel = vscode.window.createWebviewPanel(
            'tabularcraft.measureEditor',
            `Measures — ${table}`,
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
    }

    let measures: MeasureInfo[] = [];
    try {
        measures = await connectionManager.getMeasures(database, table);
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to load measures: ${(err as Error).message}`);
    }

    panel.webview.html = buildHtml(table, measures);

    panel.webview.onDidReceiveMessage(
        async (message: { command: string; measure: MeasureInfo }) => {
            try {
                if (message.command === 'upsert') {
                    await connectionManager.upsertMeasure(database, table, message.measure);
                    // Refresh measure list
                    const updated = await connectionManager.getMeasures(database, table);
                    panel!.webview.postMessage({ command: 'refresh', measures: updated });
                } else if (message.command === 'delete') {
                    await connectionManager.deleteMeasure(database, table, message.measure.name);
                    const updated = await connectionManager.getMeasures(database, table);
                    panel!.webview.postMessage({ command: 'refresh', measures: updated });
                }
            } catch (err) {
                panel!.webview.postMessage({ command: 'error', message: (err as Error).message });
            }
        },
        null,
        context.subscriptions
    );
}

function buildHtml(table: string, measures: MeasureInfo[]): string {
    const measuresJson = JSON.stringify(measures);
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>Measures — ${escHtml(table)}</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
  h2 { margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-widget-border); }
  th { font-weight: bold; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 10px; cursor: pointer; margin-right: 4px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .danger { background: var(--vscode-inputValidation-errorBackground); }
  input, textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 6px; width: 100%; box-sizing: border-box; }
  textarea { font-family: var(--vscode-editor-font-family); height: 80px; resize: vertical; }
  .form-group { margin-bottom: 10px; }
  label { display: block; margin-bottom: 4px; font-weight: bold; }
  #error { color: var(--vscode-inputValidation-errorForeground); margin-bottom: 8px; display: none; }
</style>
</head>
<body>
<h2>Measures — ${escHtml(table)}</h2>
<div id="error"></div>
<table id="measure-table">
  <thead><tr><th>Name</th><th>Format</th><th>Actions</th></tr></thead>
  <tbody id="measure-rows"></tbody>
</table>
<hr>
<h3 id="form-title">Add Measure</h3>
<div class="form-group"><label>Name</label><input id="m-name" type="text" placeholder="e.g. Total Sales"/></div>
<div class="form-group"><label>DAX Expression</label><textarea id="m-expr" placeholder="= SUM(Sales[Amount])"></textarea></div>
<div class="form-group"><label>Format String (optional)</label><input id="m-fmt" type="text" placeholder='e.g. #,##0.00'/></div>
<button onclick="submitMeasure()">Save</button>
<button onclick="resetForm()">Clear</button>
<script>
const vscode = acquireVsCodeApi();
let measures = ${measuresJson};
let editingName = null;

function renderTable() {
  const tbody = document.getElementById('measure-rows');
  tbody.innerHTML = '';
  measures.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + esc(m.name) + '</td>' +
      '<td>' + esc(m.formatString || '') + '</td>' +
      '<td>' +
        '<button onclick="editMeasure(' + JSON.stringify(m.name) + ')">Edit</button>' +
        '<button class="danger" onclick="deleteMeasure(' + JSON.stringify(m.name) + ')">Delete</button>' +
      '</td>';
    tbody.appendChild(tr);
  });
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function editMeasure(name) {
  const m = measures.find(x => x.name === name);
  if (!m) return;
  editingName = name;
  document.getElementById('m-name').value = m.name;
  document.getElementById('m-expr').value = m.expression;
  document.getElementById('m-fmt').value = m.formatString || '';
  document.getElementById('form-title').textContent = 'Edit Measure: ' + name;
}

function resetForm() {
  editingName = null;
  document.getElementById('m-name').value = '';
  document.getElementById('m-expr').value = '';
  document.getElementById('m-fmt').value = '';
  document.getElementById('form-title').textContent = 'Add Measure';
}

function submitMeasure() {
  const name = document.getElementById('m-name').value.trim();
  const expression = document.getElementById('m-expr').value.trim();
  const formatString = document.getElementById('m-fmt').value.trim() || undefined;
  if (!name || !expression) { showError('Name and Expression are required.'); return; }
  clearError();
  vscode.postMessage({ command: 'upsert', measure: { name, expression, formatString } });
}

function deleteMeasure(name) {
  if (!confirm('Delete measure "' + name + '"?')) return;
  vscode.postMessage({ command: 'delete', measure: { name, expression: '' } });
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.style.display = 'block';
}

function clearError() {
  document.getElementById('error').style.display = 'none';
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.command === 'refresh') { measures = msg.measures; renderTable(); resetForm(); }
  if (msg.command === 'error') { showError(msg.message); }
});

renderTable();
</script>
</body>
</html>`;
}

function escHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
