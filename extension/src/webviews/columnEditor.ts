import * as vscode from 'vscode';
import {
    ConnectionManager,
    CreateCalculatedColumnRequest,
    CreateDataColumnRequest,
} from '../connectionManager';

type ColumnMode = 'data' | 'calculated';

type ColumnEditorMessage =
    | {
        command: 'createData';
        payload: {
            name: string;
            sourceColumn: string;
            dataType: string;
            displayFolder?: string;
            formatString?: string;
        };
    }
    | {
        command: 'createCalculated';
        payload: {
            name: string;
            expression: string;
            dataType: string;
            displayFolder?: string;
            formatString?: string;
        };
    };

let panel: vscode.WebviewPanel | undefined;
let currentContext:
  | {
    database: string;
    table: string;
    mode: ColumnMode;
  }
  | undefined;

const DATA_TYPES = [
    'String',
    'Int64',
    'Decimal',
    'Double',
    'DateTime',
    'Boolean',
    'Binary',
    'Variant',
];

export function openColumnEditor(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    database: string,
    table: string,
    mode: ColumnMode
): void {
    const title = mode === 'data' ? `New Data Column - ${table}` : `New Calculated Column - ${table}`;
    currentContext = { database, table, mode };

    if (!panel) {
        panel = vscode.window.createWebviewPanel(
            'tabularcraft.columnEditor',
            title,
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
          currentContext = undefined;
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(async (message: ColumnEditorMessage) => {
          if (!panel || !currentContext) {
                return;
            }

            try {
                if (message.command === 'createData') {
                    const request: CreateDataColumnRequest = {
                database: currentContext.database,
                table: currentContext.table,
                        name: message.payload.name,
                        sourceColumn: message.payload.sourceColumn,
                        dataType: message.payload.dataType,
                        displayFolder: message.payload.displayFolder,
                        formatString: message.payload.formatString,
                    };

                    await connectionManager.createDataColumn(request);
                    panel.webview.postMessage({ command: 'saved', text: `Data column '${request.name}' created.` });
                    vscode.commands.executeCommand('tabularcraft.refreshTree');
                    return;
                }

                const request: CreateCalculatedColumnRequest = {
                  database: currentContext.database,
                  table: currentContext.table,
                    name: message.payload.name,
                    expression: message.payload.expression,
                    dataType: message.payload.dataType,
                    displayFolder: message.payload.displayFolder,
                    formatString: message.payload.formatString,
                };

                await connectionManager.createCalculatedColumn(request);
                panel.webview.postMessage({ command: 'saved', text: `Calculated column '${request.name}' created.` });
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
    panel.webview.html = buildHtml(table, mode);
}

function buildHtml(table: string, mode: ColumnMode): string {
    const isData = mode === 'data';
    const action = isData ? 'Create New Data Column' : 'Create New Calculated Column';
    const modeCommand = isData ? 'createData' : 'createCalculated';
    const typeOptions = DATA_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>${escapeHtml(action)}</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 14px; }
  h2 { margin-top: 0; }
  .group { margin-bottom: 10px; }
  label { display: block; margin-bottom: 4px; font-weight: 600; }
  input, textarea, select { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; }
  textarea { min-height: 110px; font-family: var(--vscode-editor-font-family); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #status { min-height: 18px; margin-top: 10px; }
  .ok { color: var(--vscode-testing-iconPassed); }
  .err { color: var(--vscode-inputValidation-errorForeground); }
</style>
</head>
<body>
  <h2>${escapeHtml(action)} - ${escapeHtml(table)}</h2>

  <div class="group">
    <label for="name">Column Name</label>
    <input id="name" type="text" placeholder="e.g. Gross Margin" />
  </div>

  ${isData ? `<div class="group">
    <label for="sourceColumn">Source Column</label>
    <input id="sourceColumn" type="text" placeholder="e.g. GrossMargin" />
  </div>` : `<div class="group">
    <label for="expression">DAX Expression</label>
    <textarea id="expression" placeholder="= Sales[Amount] - Sales[Cost]"></textarea>
  </div>`}

  <div class="group">
    <label for="dataType">Data Type</label>
    <select id="dataType">${typeOptions}</select>
  </div>

  <div class="group">
    <label for="displayFolder">Display Folder (optional)</label>
    <input id="displayFolder" type="text" placeholder="e.g. Finance/Margins" />
  </div>

  <div class="group">
    <label for="formatString">Format String (optional)</label>
    <input id="formatString" type="text" placeholder="e.g. #,##0.00" />
  </div>

  <button onclick="submitForm()">Create Column</button>
  <div id="status"></div>

<script>
const vscode = acquireVsCodeApi();

function val(id) {
  return String(document.getElementById(id)?.value ?? '').trim();
}

function setStatus(text, isError) {
  const status = document.getElementById('status');
  status.textContent = text;
  status.className = isError ? 'err' : 'ok';
}

function submitForm() {
  const name = val('name');
  if (!name) {
    setStatus('Column name is required.', true);
    return;
  }

  const dataType = val('dataType') || 'String';
  const displayFolder = val('displayFolder') || undefined;
  const formatString = val('formatString') || undefined;

  if ('${modeCommand}' === 'createData') {
    const sourceColumn = val('sourceColumn');
    if (!sourceColumn) {
      setStatus('Source column is required.', true);
      return;
    }

    vscode.postMessage({
      command: 'createData',
      payload: { name, sourceColumn, dataType, displayFolder, formatString }
    });
    setStatus('Creating data column...', false);
    return;
  }

  const expression = val('expression');
  if (!expression) {
    setStatus('Expression is required.', true);
    return;
  }

  vscode.postMessage({
    command: 'createCalculated',
    payload: { name, expression, dataType, displayFolder, formatString }
  });
  setStatus('Creating calculated column...', false);
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
