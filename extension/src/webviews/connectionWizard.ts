import * as vscode from 'vscode';
import { AuthMode, ConnectionConfig } from '../connectionManager';
import { ConnectionManager } from '../connectionManager';

export interface ConnectionWizardResult {
    profileName: string;
    config: ConnectionConfig;
}

export interface ConnectionWizardInitialValues {
  profileName?: string;
  server?: string;
  database?: string;
  authMode?: AuthMode;
  username?: string;
  tenantId?: string;
  appId?: string;
  hasPassword?: boolean;
  hasClientSecret?: boolean;
}

export async function openConnectionWizard(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  initial?: ConnectionWizardInitialValues
): Promise<ConnectionWizardResult | undefined> {
    const panel = vscode.window.createWebviewPanel(
        'tabularcraft.connectionWizard',
        'Add Connection',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = buildHtml(initial);

    return new Promise<ConnectionWizardResult | undefined>((resolve) => {
        const dispose = () => {
            panel.dispose();
        };

        const sub = panel.webview.onDidReceiveMessage(
            (message: { command: string; payload?: Record<string, string> }) => {
            if (!message.payload) {
                    return;
                }

            if (message.command === 'testConnection') {
              try {
                const testConfig = mapPayload(message.payload, false).config;
                connectionManager
                  .testConnection(testConfig)
                  .then(() => {
                    panel.webview.postMessage({ command: 'testResult', ok: true, message: 'Connection successful.' });
                  })
                  .catch((err) => {
                    panel.webview.postMessage({
                      command: 'testResult',
                      ok: false,
                      message: err instanceof Error ? err.message : String(err),
                    });
                  });
              } catch (err) {
                panel.webview.postMessage({
                  command: 'testResult',
                  ok: false,
                  message: err instanceof Error ? err.message : String(err),
                });
              }
              return;
            }

            if (message.command !== 'saveConnect') {
              return;
            }

                try {
              const result = mapPayload(message.payload, true);
                    resolve(result);
                    dispose();
                } catch (err) {
                    panel.webview.postMessage({
                        command: 'error',
                        message: err instanceof Error ? err.message : String(err),
                    });
                }
            },
            undefined,
            context.subscriptions
        );

        panel.onDidDispose(() => {
            sub.dispose();
            resolve(undefined);
        }, null, context.subscriptions);
    });
}

function mapPayload(payload: Record<string, string>, requireProfileName: boolean): ConnectionWizardResult {
  const profileName = payload.profileName?.trim() || '';
    const server = payload.server?.trim();
    const database = payload.database?.trim();
    const authMode = payload.authMode as AuthMode;

    if (requireProfileName && !profileName) throw new Error('Connection name is required.');
    if (!server) throw new Error('Server is required.');
    if (!database) throw new Error('Database is required.');
    if (!authMode) throw new Error('Authentication type is required.');

    const config: ConnectionConfig = {
        server,
        database,
        authMode,
    };

    if (authMode === 'userpass') {
        const username = payload.username?.trim();
        const password = payload.password ?? '';
        if (!username) throw new Error('Username is required for Username + Password authentication.');
        if (!password) throw new Error('Password is required for Username + Password authentication.');
        config.username = username;
        config.password = password;
    }

    if (authMode === 'serviceprincipal') {
        const tenantId = payload.tenantId?.trim();
        const appId = payload.appId?.trim();
        const clientSecret = payload.clientSecret ?? '';
        if (!tenantId) throw new Error('Tenant ID is required for Service Principal authentication.');
        if (!appId) throw new Error('App ID is required for Service Principal authentication.');
        if (!clientSecret) throw new Error('Client Secret is required for Service Principal authentication.');
        config.tenantId = tenantId;
        config.appId = appId;
        config.clientSecret = clientSecret;
    }

    return { profileName, config };
}

function buildHtml(initial?: ConnectionWizardInitialValues): string {
  const profileName = escapeAttr(initial?.profileName ?? '');
  const server = escapeAttr(initial?.server ?? '');
  const database = escapeAttr(initial?.database ?? '');
  const username = escapeAttr(initial?.username ?? '');
  const tenantId = escapeAttr(initial?.tenantId ?? '');
  const appId = escapeAttr(initial?.appId ?? '');
  const authMode = initial?.authMode ?? 'interactive';
  const passwordPlaceholder = initial?.hasPassword ? '******** (stored)' : '';
  const clientSecretPlaceholder = initial?.hasClientSecret ? '******** (stored)' : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>Add Connection</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
  h2 { margin-top: 0; }
  .field { margin-bottom: 10px; }
  label { display: block; font-weight: 600; margin-bottom: 4px; }
  input, select { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .actions { margin-top: 14px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 7px 14px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #error { color: var(--vscode-inputValidation-errorForeground); min-height: 18px; margin-top: 8px; }
  .hidden { display: none; }
</style>
</head>
<body>
  <h2>Add Connection</h2>
  <div class="field">
    <label for="profileName">Connection Name</label>
    <input id="profileName" type="text" placeholder="e.g. Prod AAS" value="${profileName}" />
  </div>
  <div class="field">
    <label for="server">Server Name</label>
    <input id="server" type="text" placeholder="asazure://eastus.asazure.windows.net/myserver" value="${server}" />
  </div>
  <div class="field">
    <label for="database">Database Name</label>
    <input id="database" type="text" placeholder="ModelDatabase" value="${database}" />
  </div>
  <div class="field">
    <label for="authMode">Authentication Type</label>
    <select id="authMode" onchange="onAuthModeChange()">
      <option value="interactive" ${authMode === 'interactive' ? 'selected' : ''}>Interactive (Entra ID)</option>
      <option value="userpass" ${authMode === 'userpass' ? 'selected' : ''}>Username + Password</option>
      <option value="serviceprincipal" ${authMode === 'serviceprincipal' ? 'selected' : ''}>Service Principal</option>
    </select>
  </div>

  <div id="userpassFields" class="hidden">
    <div class="field">
      <label for="username">Username (UPN)</label>
      <input id="username" type="text" value="${username}" />
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" type="password" placeholder="${escapeAttr(passwordPlaceholder)}" />
    </div>
  </div>

  <div id="spFields" class="hidden">
    <div class="grid">
      <div class="field">
        <label for="tenantId">Tenant ID</label>
        <input id="tenantId" type="text" value="${tenantId}" />
      </div>
      <div class="field">
        <label for="appId">App ID</label>
        <input id="appId" type="text" value="${appId}" />
      </div>
    </div>
    <div class="field">
      <label for="clientSecret">Client Secret</label>
      <input id="clientSecret" type="password" placeholder="${escapeAttr(clientSecretPlaceholder)}" />
    </div>
  </div>

  <div class="actions">
    <button onclick="testConnection()">Test Connection</button>
    <button onclick="saveConnect()">Save and Connect</button>
  </div>
  <div id="error"></div>

<script>
const vscode = acquireVsCodeApi();

function onAuthModeChange() {
  const mode = document.getElementById('authMode').value;
  document.getElementById('userpassFields').classList.toggle('hidden', mode !== 'userpass');
  document.getElementById('spFields').classList.toggle('hidden', mode !== 'serviceprincipal');
}

function saveConnect() {
  document.getElementById('error').textContent = '';
  const payload = {
    profileName: document.getElementById('profileName').value,
    server: document.getElementById('server').value,
    database: document.getElementById('database').value,
    authMode: document.getElementById('authMode').value,
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
    tenantId: document.getElementById('tenantId').value,
    appId: document.getElementById('appId').value,
    clientSecret: document.getElementById('clientSecret').value,
  };
  vscode.postMessage({ command: 'saveConnect', payload });
}

function testConnection() {
  document.getElementById('error').textContent = 'Testing connection...';
  const payload = {
    profileName: document.getElementById('profileName').value,
    server: document.getElementById('server').value,
    database: document.getElementById('database').value,
    authMode: document.getElementById('authMode').value,
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
    tenantId: document.getElementById('tenantId').value,
    appId: document.getElementById('appId').value,
    clientSecret: document.getElementById('clientSecret').value,
  };
  vscode.postMessage({ command: 'testConnection', payload });
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.command === 'error') {
    document.getElementById('error').textContent = msg.message;
  }
  if (msg.command === 'testResult') {
    document.getElementById('error').textContent = msg.ok ? 'Test passed: ' + msg.message : 'Test failed: ' + msg.message;
  }
});

onAuthModeChange();
</script>
</body>
</html>`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
