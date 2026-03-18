import * as vscode from 'vscode';
import { ConnectionManager, DeleteObjectRequest } from '../connectionManager';
import { ModelNode, ModelTreeProvider } from '../providers/modelTreeProvider';

const deletableKinds = new Set(['column', 'measure']);

export function registerDeleteCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    treeProvider: ModelTreeProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tabularcraft.deleteObject', async (node: ModelNode) => {
            if (!node || !deletableKinds.has(node.kind)) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Delete ${humanizeKind(node.kind)} '${node.objectName}'?`,
                { modal: true },
                'Delete'
            );

            if (confirm !== 'Delete') {
                return;
            }

            const request = buildDeleteRequest(node);
            if (!request) {
                vscode.window.showErrorMessage(`Delete is not supported for ${node.kind}.`);
                return;
            }

            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Tabularcraft: Deleting ${humanizeKind(node.kind)}...`,
                        cancellable: false,
                    },
                    async () => connectionManager.deleteObject(request)
                );
                treeProvider.refresh();
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Tabularcraft delete failed: ${message}`);
            }
        })
    );
}

function buildDeleteRequest(node: ModelNode): DeleteObjectRequest | null {
    if (!node.database) {
        return null;
    }

    const request: DeleteObjectRequest = {
        database: node.database,
        objectType: node.kind,
        objectName: node.objectName,
    };

    if (node.kind === 'column' || node.kind === 'measure') {
        request.table = node.table;
    }

    return request;
}

function humanizeKind(kind: string): string {
    return kind
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
