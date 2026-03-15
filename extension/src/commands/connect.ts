import * as vscode from 'vscode';
import { AuthMode, ConnectionConfig, ConnectionManager } from '../connectionManager';
import { ModelTreeProvider } from '../providers/modelTreeProvider';

export function registerConnectCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tabularcraft.connect', () =>
            runConnectFlow(connectionManager, treeProvider)
        ),
        vscode.commands.registerCommand('tabularcraft.disconnect', async () => {
            await connectionManager.disconnect();
            vscode.window.showInformationMessage('Tabularcraft: Disconnected.');
        })
    );
}

async function runConnectFlow(
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider
): Promise<void> {
    const server = await vscode.window.showInputBox({
        title: 'Tabularcraft — Connect to AAS',
        prompt: 'Server URL',
        placeHolder: 'asazure://eastus.asazure.windows.net/myserver',
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? null : 'Server URL is required'),
    });
    if (!server) return;

    const database = await vscode.window.showInputBox({
        title: 'Tabularcraft — Connect to AAS',
        prompt: 'Database name',
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? null : 'Database name is required'),
    });
    if (!database) return;

    const authPick = await vscode.window.showQuickPick(
        [
            { label: 'Interactive (Entra ID)', value: 'interactive' as AuthMode },
            { label: 'Username + Password', value: 'userpass' as AuthMode },
            { label: 'Service Principal', value: 'serviceprincipal' as AuthMode },
        ],
        { title: 'Tabularcraft — Authentication mode', ignoreFocusOut: true }
    );
    if (!authPick) return;

    const config: ConnectionConfig = {
        server: server.trim(),
        database: database.trim(),
        authMode: authPick.value,
    };

    if (authPick.value === 'userpass') {
        const username = await vscode.window.showInputBox({
            prompt: 'Username (UPN)',
            ignoreFocusOut: true,
            validateInput: (v) => (v.trim() ? null : 'Username is required'),
        });
        if (!username) return;

        const password = await vscode.window.showInputBox({
            prompt: 'Password',
            password: true,
            ignoreFocusOut: true,
            validateInput: (v) => (v ? null : 'Password is required'),
        });
        if (!password) return;

        config.username = username.trim();
        config.password = password;
    } else if (authPick.value === 'serviceprincipal') {
        const tenantId = await vscode.window.showInputBox({
            prompt: 'Tenant ID (GUID)',
            ignoreFocusOut: true,
            validateInput: (v) => (v.trim() ? null : 'Tenant ID is required'),
        });
        if (!tenantId) return;

        const appId = await vscode.window.showInputBox({
            prompt: 'App (client) ID',
            ignoreFocusOut: true,
            validateInput: (v) => (v.trim() ? null : 'App ID is required'),
        });
        if (!appId) return;

        const clientSecret = await vscode.window.showInputBox({
            prompt: 'Client secret',
            password: true,
            ignoreFocusOut: true,
            validateInput: (v) => (v ? null : 'Client secret is required'),
        });
        if (!clientSecret) return;

        config.tenantId = tenantId.trim();
        config.appId = appId.trim();
        config.clientSecret = clientSecret;
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Tabularcraft: Connecting…', cancellable: false },
        async () => {
            await connectionManager.connect(config);
        }
    );

    vscode.window.showInformationMessage(`Tabularcraft: Connected to ${server}.`);
    treeProvider.refresh();
}
