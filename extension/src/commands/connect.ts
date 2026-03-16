import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionManager } from '../connectionManager';
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
        vscode.commands.registerCommand('tabularcraft.addConnection', () =>
            addConnection(connectionManager, treeProvider, profileStore, context)
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
