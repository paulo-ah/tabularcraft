import * as vscode from 'vscode';
import { SidecarManager } from './sidecarManager';
import { ConnectionManager } from './connectionManager';
import { ModelTreeProvider } from './providers/modelTreeProvider';
import { registerConnectCommands } from './commands/connect';
import { registerConnectionNodeCommands } from './commands/connections';
import { registerProcessCommands } from './commands/process';
import { registerMeasureCommands } from './commands/measures';
import { registerColumnCommands } from './commands/columns';
import { registerRenameCommands } from './commands/rename';
import { registerDeleteCommands } from './commands/delete';
import { openTmslConsole } from './webviews/tmslConsole';
import { ModelNode } from './providers/modelTreeProvider';
import { openPropertiesEditor } from './webviews/propertiesEditor';
import { ConnectionProfileStore } from './connectionProfiles';
import { openPartitionQueryEditor } from './webviews/partitionQueryEditor';

const DOUBLE_CLICK_MS = 400;

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

const inspectableKinds = new Set([
    'database',
    'table',
    'column',
    'measure',
    'hierarchy',
    'level',
    'role',
    'perspective',
    'relationship',
    'data-source',
    'culture',
]);

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        const sidecarManager = new SidecarManager(context);
        const connectionManager = new ConnectionManager();
        const profileStore = new ConnectionProfileStore(context);

        // Start the sidecar process and configure the client with its listening port.
        const port = await sidecarManager.start();
        connectionManager.setSidecarPort(port);

        // Tree view
        const treeProvider = new ModelTreeProvider(connectionManager, profileStore);
        const treeView = vscode.window.createTreeView('tabularcraft.modelTree', {
            treeDataProvider: treeProvider,
            showCollapseAll: true,
        });

        let lastSelectionKey: string | undefined;
        let lastSelectionAt = 0;

        treeView.onDidChangeSelection((event) => {
            const node = event.selection[0];
            if (!node) {
                lastSelectionKey = undefined;
                return;
            }

            if (node.kind === 'partition' && node.database && node.table && node.partition) {
                openPartitionQueryEditor(context, connectionManager, node.database, node.table, node.partition);
            }

            if (inspectableKinds.has(node.kind)) {
                openPropertiesEditor(context, connectionManager, node);
            }

            if (!renameableKinds.has(node.kind)) {
                lastSelectionKey = undefined;
                return;
            }

            const now = Date.now();
            const key = buildNodeSelectionKey(node);
            const isDoubleClick = lastSelectionKey === key && now - lastSelectionAt <= DOUBLE_CLICK_MS;

            lastSelectionKey = key;
            lastSelectionAt = now;

            if (isDoubleClick) {
                vscode.commands.executeCommand('tabularcraft.renameObject', node);
            }
        });

        // Register all commands
        registerConnectCommands(context, connectionManager, treeProvider, profileStore);
        registerConnectionNodeCommands(context, connectionManager, treeProvider, profileStore);
        registerProcessCommands(context, connectionManager);
        registerMeasureCommands(context, connectionManager);
        registerColumnCommands(context, connectionManager);
        registerRenameCommands(context, connectionManager, treeProvider);
        registerDeleteCommands(context, connectionManager, treeProvider);

        context.subscriptions.push(
            treeView,
            vscode.commands.registerCommand('tabularcraft.refreshTree', () => treeProvider.refresh()),
            vscode.commands.registerCommand('tabularcraft.openProperties', (node: ModelNode) =>
                openPropertiesEditor(context, connectionManager, node)
            ),
            vscode.commands.registerCommand('tabularcraft.openPartitionQuery', (node: ModelNode) => {
                if (!node?.database || !node?.table || !node?.partition) {
                    vscode.window.showWarningMessage('Select a partition node to open its query.');
                    return;
                }

                return openPartitionQueryEditor(
                    context,
                    connectionManager,
                    node.database,
                    node.table,
                    node.partition
                );
            }),
            vscode.commands.registerCommand('tabularcraft.openTmslConsole', () =>
                openTmslConsole(context, connectionManager)
            )
        );

        context.subscriptions.push({
            dispose: () => sidecarManager.stop(),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Tabularcraft activation failed: ${message}`);
        throw err;
    }
}

function buildNodeSelectionKey(node: ModelNode): string {
    return [
        node.kind,
        node.database ?? '',
        node.table ?? '',
        node.hierarchy ?? '',
        node.partition ?? '',
        node.objectName,
    ].join('|');
}

export function deactivate(): void {
    // Cleanup is handled via context.subscriptions
}
