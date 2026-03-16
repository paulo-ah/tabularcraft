import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';

let panel: vscode.WebviewPanel | undefined;
let currentKey: string | undefined;
let currentContext:
  | { database: string; table: string; partition: string }
  | undefined;

export async function openPartitionQueryEditor(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    database: string,
    table: string,
    partition: string
): Promise<void> {
    const panelTitle = `Partition Query - ${partition}`;
    const key = `${database}|${table}|${partition}`;
    currentKey = key;
    currentContext = { database, table, partition };

    if (!panel) {
        panel = vscode.window.createWebviewPanel(
            'tabularcraft.partitionQueryEditor',
            panelTitle,
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
            currentKey = undefined;
          currentContext = undefined;
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(async (message: { command: string; query?: string }) => {
          if (!panel || message.command !== 'save' || !currentContext) {
                return;
            }

            const nextQuery = message.query ?? '';
            try {
            await connectionManager.updatePartitionQuery(
              currentContext.database,
              currentContext.table,
              currentContext.partition,
              nextQuery
            );
                panel.webview.postMessage({ command: 'saved' });
            } catch (err) {
                panel.webview.postMessage({
                    command: 'error',
                    message: err instanceof Error ? err.message : String(err),
                });
            }
        }, null, context.subscriptions);
    } else {
        panel.title = panelTitle;
        panel.reveal(vscode.ViewColumn.One);
    }

    try {
        const data = await connectionManager.getPartitionQuery(database, table, partition);
        if (!panel) {
            return;
        }
        panel.title = panelTitle;
        panel.webview.html = buildHtml(partition, data.queryType, data.query, data.editable);
    } catch (err) {
        if (!panel) {
            return;
        }
        panel.webview.html = buildErrorHtml(err instanceof Error ? err.message : String(err));
    }
}

function buildHtml(partition: string, queryType: string, query: string, editable: boolean): string {
    const escapedPartition = escapeHtml(partition);
    const escapedQueryType = escapeHtml(queryType);
    const escapedQuery = escapeHtml(query);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>Partition Query</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 14px; }
  h2 { margin-top: 0; }
  .meta { opacity: 0.85; margin-bottom: 10px; }
  textarea { width: 100%; min-height: 380px; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 8px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
  .actions { margin-top: 10px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #status { min-height: 18px; margin-top: 8px; }
  .ok { color: var(--vscode-testing-iconPassed); }
  .err { color: var(--vscode-inputValidation-errorForeground); }
</style>
</head>
<body>
  <h2>Partition Query - ${escapedPartition}</h2>
  <div class="meta">Type: ${escapedQueryType}${editable ? '' : ' (read-only)'}</div>
  <textarea id="query" ${editable ? '' : 'disabled'}>${escapedQuery}</textarea>
  <div class="actions">
    <button onclick="save()" ${editable ? '' : 'disabled'}>Save Query</button>
  </div>
  <div id="status"></div>
<script>
const vscode = acquireVsCodeApi();

function save() {
  const query = document.getElementById('query').value;
  document.getElementById('status').textContent = 'Saving...';
  document.getElementById('status').className = '';
  vscode.postMessage({ command: 'save', query });
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  const status = document.getElementById('status');
  if (msg.command === 'saved') {
    status.textContent = 'Saved.';
    status.className = 'ok';
  }
  if (msg.command === 'error') {
    status.textContent = msg.message;
    status.className = 'err';
  }
});
</script>
</body>
</html>`;
}

function buildErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Partition Query</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 14px; }
  .err { color: var(--vscode-inputValidation-errorForeground); }
</style>
</head>
<body>
  <h2>Partition Query</h2>
  <div class="err">${escapeHtml(message)}</div>
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
