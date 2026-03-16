import * as vscode from 'vscode';
import { ConnectionManager, ConnectionConfig } from '../connectionManager';
import { ConnectionProfileStore } from '../connectionProfiles';
import { ModelNode, ModelTreeProvider } from '../providers/modelTreeProvider';
import { openConnectionWizard } from '../webviews/connectionWizard';

export function registerConnectionNodeCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider,
    profileStore: ConnectionProfileStore
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tabularcraft.connectionNodeConnect', async (node: ModelNode) => {
            if (!node?.profileId) {
                return;
            }

            const profile = await profileStore.getProfile(node.profileId);
            if (!profile) {
                vscode.window.showErrorMessage('Tabularcraft: Connection profile not found.');
                return;
            }

            const config = await profileStore.toConnectionConfig(profile);
            await ensureSecrets(config, profile.id, profileStore);

            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'Tabularcraft: Connecting…', cancellable: false },
                    async () => {
                        await connectionManager.connect(config);
                    }
                );

                await treeProvider.setActiveProfile(profile.id, profile.name);
                vscode.window.showInformationMessage(`Tabularcraft: Connected to ${profile.name}.`);
            } catch (err) {
                vscode.window.showErrorMessage(`Tabularcraft connection failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }),

        vscode.commands.registerCommand('tabularcraft.connectionNodeDelete', async (node: ModelNode) => {
            if (!node?.profileId) {
                return;
            }

            const profile = await profileStore.getProfile(node.profileId);
            if (!profile) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Delete saved connection "${profile.name}"?`,
                { modal: true },
                'Delete'
            );
            if (confirm !== 'Delete') {
                return;
            }

            await profileStore.deleteProfile(profile.id);
            await treeProvider.refreshConnections();
            vscode.window.showInformationMessage(`Tabularcraft: Deleted profile "${profile.name}".`);
        }),

        vscode.commands.registerCommand('tabularcraft.connectionNodeEdit', async (node: ModelNode) => {
            if (!node?.profileId) {
                return;
            }

            const existing = await profileStore.getProfile(node.profileId);
            if (!existing) {
                vscode.window.showErrorMessage('Tabularcraft: Connection profile not found.');
                return;
            }

            const currentConfig = await profileStore.toConnectionConfig(existing);
            const secretPresence = await profileStore.getSecretPresence(existing.id);
            const updated = await promptEdit(existing.name, currentConfig, secretPresence, context, connectionManager);
            if (!updated) {
                return;
            }

            await profileStore.updateProfile(existing.id, updated.profileName, updated.config);
            await treeProvider.refreshConnections();
            vscode.window.showInformationMessage(`Tabularcraft: Updated profile "${updated.profileName}".`);
        })
    );
}

async function promptEdit(
    currentName: string,
    currentConfig: ConnectionConfig,
    secretPresence: { hasPassword: boolean; hasClientSecret: boolean },
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager
): Promise<{ profileName: string; config: ConnectionConfig } | undefined> {
    const result = await openConnectionWizard(context, connectionManager, {
        profileName: currentName,
        server: currentConfig.server,
        database: currentConfig.database,
        authMode: currentConfig.authMode,
        username: currentConfig.username,
        tenantId: currentConfig.tenantId,
        appId: currentConfig.appId,
        hasPassword: secretPresence.hasPassword,
        hasClientSecret: secretPresence.hasClientSecret,
    });

    if (!result) {
        return undefined;
    }

    if (result.config.authMode === 'userpass' && !result.config.password && currentConfig.password) {
        result.config.password = currentConfig.password;
    }

    if (result.config.authMode === 'serviceprincipal' && !result.config.clientSecret && currentConfig.clientSecret) {
        result.config.clientSecret = currentConfig.clientSecret;
    }

    return {
        profileName: result.profileName || currentName,
        config: result.config,
    };
}

async function ensureSecrets(
    config: ConnectionConfig,
    profileId: string,
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
        await profileStore.updateProfileSecret(profileId, { password });
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
        await profileStore.updateProfileSecret(profileId, { clientSecret });
    }
}
