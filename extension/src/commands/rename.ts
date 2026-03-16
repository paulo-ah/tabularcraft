import * as vscode from 'vscode';
import { ConnectionManager, RenameObjectRequest } from '../connectionManager';
import { ModelNode, ModelTreeProvider } from '../providers/modelTreeProvider';

const renameableKinds = new Set([
    'database',
    'table',
    'column',
    'measure',
    'hierarchy',
    'level',
    'partition',
    'role',
    'perspective',
    'data-source',
    'culture',
]);

export function registerRenameCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tabularcraft.renameObject', async (node: ModelNode) => {
            if (!node || !renameableKinds.has(node.kind)) {
                return;
            }

            const currentName = node.objectName;
            const newName = await vscode.window.showInputBox({
                title: `Rename ${humanizeKind(node.kind)}`,
                prompt: `New name for "${currentName}"`,
                value: currentName,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Name is required';
                    }
                    return null;
                },
            });

            if (!newName || newName.trim() === currentName) {
                return;
            }

            const request = buildRenameRequest(node, newName.trim());
            if (!request) {
                vscode.window.showErrorMessage(`Rename is not supported for ${node.kind}.`);
                return;
            }

            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Tabularcraft: Renaming ${humanizeKind(node.kind)}...`,
                        cancellable: false,
                    },
                    async () => connectionManager.renameObject(request)
                );
                treeProvider.refresh();
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Tabularcraft rename failed: ${message}`);
            }
        })
    );
}

function buildRenameRequest(node: ModelNode, newName: string): RenameObjectRequest | null {
    if (!node.database) {
        return null;
    }

    const baseRequest: RenameObjectRequest = {
        database: node.database,
        objectType: node.kind,
        oldName: node.objectName,
        newName,
    };

    if (
        node.kind === 'column' ||
        node.kind === 'measure' ||
        node.kind === 'hierarchy' ||
        node.kind === 'level' ||
        node.kind === 'partition' ||
        node.kind === 'table'
    ) {
        baseRequest.table = node.table;
    }

    if (node.kind === 'level') {
        baseRequest.hierarchy = node.hierarchy;
    }

    return baseRequest;
}

function humanizeKind(kind: string): string {
    return kind
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
