import * as vscode from 'vscode';
import { AuthMode, ConnectionConfig, ConnectionManager } from '../connectionManager';
import { ModelTreeProvider } from '../providers/modelTreeProvider';
import { ConnectionProfile, ConnectionProfileStore } from '../connectionProfiles';
import { openConnectionWizard } from '../webviews/connectionWizard';

export function registerConnectCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider,
    profileStore: ConnectionProfileStore
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tabularcraft.connect', async () => {
            const profiles = await profileStore.listProfiles();
            if (profiles.length === 0) {
                await addConnection(connectionManager, treeProvider, profileStore, context);
                return;
            }
            await connectUsingSavedProfile(connectionManager, treeProvider, profileStore);
        }),
        vscode.commands.registerCommand('tabularcraft.addConnection', () =>
            addConnection(connectionManager, treeProvider, profileStore, context)
        ),
        vscode.commands.registerCommand('tabularcraft.connectSaved', () =>
            connectUsingSavedProfile(connectionManager, treeProvider, profileStore)
        ),
        vscode.commands.registerCommand('tabularcraft.manageConnections', () =>
            runManageConnections(connectionManager, treeProvider, profileStore)
        ),
        vscode.commands.registerCommand('tabularcraft.disconnect', async () => {
            await connectionManager.disconnect();
            vscode.window.showInformationMessage('Tabularcraft: Disconnected.');
        })
    );
}

async function addConnection(
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider,
    profileStore: ConnectionProfileStore,
    context: vscode.ExtensionContext
): Promise<void> {
    const wizardResult = await openConnectionWizard(context, connectionManager);
    if (!wizardResult) return;

    const profile = await profileStore.saveProfile(wizardResult.profileName, wizardResult.config);
    await treeProvider.refreshConnections();

    await connectProfileById(
        connectionManager,
        treeProvider,
        profileStore,
        profile.id,
        wizardResult.config
    );
}

async function promptConnectionConfig(): Promise<ConnectionConfig | undefined> {
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

    return config;
}

async function connectUsingSavedProfile(
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider,
    profileStore: ConnectionProfileStore
): Promise<void> {
    const profiles = await profileStore.listProfiles();
    if (profiles.length === 0) {
        vscode.window.showInformationMessage('Tabularcraft: No saved connections found.');
        return;
    }

    const picked = await vscode.window.showQuickPick(
        profiles.map((p) => ({
            label: p.name,
            description: `${p.database} @ ${p.server}`,
            profile: p,
        })),
        {
            title: 'Tabularcraft — Saved connections',
            ignoreFocusOut: true,
        }
    );
    if (!picked) return;

    await connectProfileById(connectionManager, treeProvider, profileStore, picked.profile.id);
}

async function ensureRequiredSecrets(
    config: ConnectionConfig,
    profile: ConnectionProfile,
    profileStore: ConnectionProfileStore
): Promise<void> {
    if (config.authMode === 'userpass' && !config.password) {
        const password = await vscode.window.showInputBox({
            title: 'Tabularcraft — Saved connection requires password',
            prompt: `Password for ${config.username}`,
            password: true,
            ignoreFocusOut: true,
            validateInput: (v) => (v ? null : 'Password is required'),
        });
        if (!password) {
            throw new Error('Connection cancelled: password was not provided.');
        }
        config.password = password;
        await profileStore.updateProfileSecret(profile.id, { password });
    }

    if (config.authMode === 'serviceprincipal' && !config.clientSecret) {
        const clientSecret = await vscode.window.showInputBox({
            title: 'Tabularcraft — Saved connection requires client secret',
            prompt: `Client secret for ${config.appId}`,
            password: true,
            ignoreFocusOut: true,
            validateInput: (v) => (v ? null : 'Client secret is required'),
        });
        if (!clientSecret) {
            throw new Error('Connection cancelled: client secret was not provided.');
        }
        config.clientSecret = clientSecret;
        await profileStore.updateProfileSecret(profile.id, { clientSecret });
    }
}

async function runManageConnections(
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider,
    profileStore: ConnectionProfileStore
): Promise<void> {
    const action = await vscode.window.showQuickPick(
        [
            { label: 'Connect to saved connection', value: 'connect' as const },
            { label: 'Delete saved connection', value: 'delete' as const },
        ],
        {
            title: 'Tabularcraft — Manage connections',
            ignoreFocusOut: true,
        }
    );
    if (!action) return;

    const profiles = await profileStore.listProfiles();
    if (profiles.length === 0) {
        vscode.window.showInformationMessage('Tabularcraft: No saved connections found.');
        return;
    }

    const picked = await vscode.window.showQuickPick(
        profiles.map((p) => ({
            label: p.name,
            description: `${p.database} @ ${p.server}`,
            profile: p,
        })),
        {
            title: 'Tabularcraft — Select saved connection',
            ignoreFocusOut: true,
        }
    );
    if (!picked) return;

    if (action.value === 'connect') {
        await connectProfileById(connectionManager, treeProvider, profileStore, picked.profile.id);
        return;
    }

    if (action.value === 'delete') {
        const confirm = await vscode.window.showWarningMessage(
            `Delete saved connection "${picked.profile.name}"?`,
            { modal: true },
            'Delete'
        );
        if (confirm === 'Delete') {
            await profileStore.deleteProfile(picked.profile.id);
            await treeProvider.refreshConnections();
            vscode.window.showInformationMessage(`Tabularcraft: Deleted profile "${picked.profile.name}".`);
        }
    }
}

async function connectProfileById(
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider,
    profileStore: ConnectionProfileStore,
    profileId: string,
    preloadedConfig?: ConnectionConfig
): Promise<void> {
    const profile = await profileStore.getProfile(profileId);
    if (!profile) {
        vscode.window.showErrorMessage('Tabularcraft: Saved connection not found.');
        return;
    }

    const config = preloadedConfig ?? await profileStore.toConnectionConfig(profile);
    await ensureRequiredSecrets(config, profile, profileStore);
    const connected = await connectAndRefresh(connectionManager, treeProvider, config);
    if (connected) {
        await treeProvider.setActiveProfile(profile.id, profile.name);
    }
}

async function connectAndRefresh(
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider,
    config: ConnectionConfig
): Promise<boolean> {

    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Tabularcraft: Connecting…', cancellable: false },
            async () => {
                await connectionManager.connect(config);
            }
        );

        vscode.window.showInformationMessage(`Tabularcraft: Connected to ${config.server}.`);
        treeProvider.refresh();
        return true;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Tabularcraft connection failed: ${message}`);
        return false;
    }
}
