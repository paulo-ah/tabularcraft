import * as vscode from 'vscode';
import {
    ConnectionManager,
    ObjectPropertiesRequest,
    UpdateObjectPropertiesRequest,
    ObjectPropertyInfo,
} from '../connectionManager';
import { ModelNode } from '../providers/modelTreeProvider';

let panel: vscode.WebviewPanel | undefined;
let currentNode: ModelNode | undefined;

const inspectableKinds = new Set([
    'database',
    'table',
    'column',
    'measure',
    'hierarchy',
    'level',
    'partition',
    'role',
    'perspective',
    'relationship',
    'data-source',
    'culture',
]);

export async function openPropertiesEditor(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    node: ModelNode
): Promise<void> {
    if (!inspectableKinds.has(node.kind)) {
        return;
    }

    currentNode = node;

    if (!panel) {
        panel = vscode.window.createWebviewPanel(
            'tabularcraft.propertiesEditor',
            'Properties',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
            currentNode = undefined;
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(
            async (message: { command: string; updates?: Array<{ name: string; value: string }> }) => {
                if (message.command !== 'save' || !currentNode) {
                    return;
                }

                const updateRequest: UpdateObjectPropertiesRequest = {
                    database: currentNode.database!,
                    objectType: currentNode.kind,
                    objectName: currentNode.objectName,
                    table: currentNode.table,
                    hierarchy: currentNode.hierarchy,
                    updates: message.updates ?? [],
                };

                try {
                    await connectionManager.updateObjectProperties(updateRequest);
                    panel!.webview.postMessage({ command: 'saved' });
                } catch (err) {
                    panel!.webview.postMessage({
                        command: 'error',
                        message: err instanceof Error ? err.message : String(err),
                    });
                }
            },
            null,
            context.subscriptions
        );
    } else {
        panel.reveal(vscode.ViewColumn.Two);
    }

    panel.title = `Properties - ${node.objectName}`;

    try {
        const request: ObjectPropertiesRequest = {
            database: node.database!,
            objectType: node.kind,
            objectName: node.objectName,
            table: node.table,
            hierarchy: node.hierarchy,
        };
        const properties = await connectionManager.getObjectProperties(request);
        panel.webview.html = buildHtml(node, properties);
    } catch (err) {
        panel.webview.html = buildErrorHtml(err instanceof Error ? err.message : String(err));
    }
}

function buildHtml(node: ModelNode, properties: ObjectPropertyInfo[]): string {
    const title = `${humanizeKind(node.kind)} - ${node.objectName}`;
    const propsJson = JSON.stringify(properties);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 14px; }
  h2 { margin-top: 0; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 220px 1fr; gap: 8px 10px; align-items: center; }
  .name { font-weight: 600; }
  .required::after { content: ' *'; color: var(--vscode-inputValidation-errorForeground); }
  input, textarea, select { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 6px; }
  textarea { min-height: 72px; resize: vertical; }
  .readonly { opacity: 0.75; }
  .actions { margin-top: 14px; display: flex; gap: 8px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #status { margin-top: 10px; min-height: 18px; }
  .ok { color: var(--vscode-testing-iconPassed); }
  .err { color: var(--vscode-inputValidation-errorForeground); }
</style>
</head>
<body>
  <h2>${escapeHtml(title)}</h2>
  <div class="grid" id="props"></div>
  <div class="actions">
    <button onclick="save()">Save Properties</button>
  </div>
  <div id="status"></div>
<script>
const vscode = acquireVsCodeApi();
const properties = ${propsJson};

function render() {
  const root = document.getElementById('props');
  root.innerHTML = '';

  for (const p of properties) {
    const label = document.createElement('div');
    label.className = 'name';
    if (p.required) {
      label.classList.add('required');
    }
    label.textContent = p.name;

    let editor;
    if (p.type === 'boolean' && p.editable) {
      editor = document.createElement('select');
      editor.innerHTML = '<option value="true">true</option><option value="false">false</option>';
      editor.value = p.value.toLowerCase() === 'true' ? 'true' : 'false';
    } else if (p.type === 'enum' && p.editable) {
      editor = document.createElement('select');
      const values = Array.isArray(p.enumValues) ? p.enumValues : [];
      editor.innerHTML = values.map((v) => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
      if (values.includes(p.value)) {
        editor.value = p.value;
      }
    } else if ((p.name === 'Expression' || p.name === 'Description') && p.editable) {
      editor = document.createElement('textarea');
      editor.value = p.value || '';
    } else {
      editor = document.createElement('input');
      editor.type = 'text';
      editor.value = p.value || '';
    }

    editor.dataset.propName = p.name;
    editor.dataset.propType = p.type;
    editor.dataset.required = p.required ? 'true' : 'false';
    editor.dataset.enumValues = JSON.stringify(p.enumValues || []);
    if (!p.editable) {
      editor.disabled = true;
      editor.classList.add('readonly');
    }

    root.appendChild(label);
    root.appendChild(editor);
  }
}

function save() {
  const validationErrors = [];
  const updates = [];
  const editors = document.querySelectorAll('[data-prop-name]');
  editors.forEach((editor) => {
    if (editor.disabled) return;

    const propName = editor.dataset.propName;
    const propType = editor.dataset.propType;
    const required = editor.dataset.required === 'true';
    const value = String(editor.value ?? '');
    const enumValues = JSON.parse(editor.dataset.enumValues || '[]');

    const error = validateProperty(propName, propType, required, enumValues, value);
    if (error) {
      validationErrors.push(error);
    }

    updates.push({
      name: propName,
      value,
    });
  });

  if (validationErrors.length > 0) {
    document.getElementById('status').textContent = validationErrors.join(' | ');
    document.getElementById('status').className = 'err';
    return;
  }

  document.getElementById('status').textContent = 'Saving...';
  document.getElementById('status').className = '';
  vscode.postMessage({ command: 'save', updates });
}

function validateProperty(name, type, required, enumValues, value) {
  const trimmed = value.trim();

  if (required && !trimmed) {
    return name + ' is required.';
  }

  if (!trimmed) {
    return null;
  }

  if (type === 'number') {
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      return name + ' must be a valid number.';
    }
  }

  if (type === 'boolean') {
    const lower = trimmed.toLowerCase();
    if (lower !== 'true' && lower !== 'false') {
      return name + ' must be true or false.';
    }
  }

  if (type === 'enum' && Array.isArray(enumValues) && enumValues.length > 0 && !enumValues.includes(trimmed)) {
    return name + ' must be one of: ' + enumValues.join(', ');
  }

  return null;
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

render();
</script>
</body>
</html>`;
}

function buildErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Properties</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 14px; }
  .err { color: var(--vscode-inputValidation-errorForeground); }
</style>
</head>
<body>
  <h2>Properties</h2>
  <div class="err">${escapeHtml(message)}</div>
</body>
</html>`;
}

function humanizeKind(kind: string): string {
    return kind
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
