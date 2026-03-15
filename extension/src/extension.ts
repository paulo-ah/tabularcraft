import * as vscode from 'vscode';
import { SidecarManager } from './sidecarManager';
import { ConnectionManager } from './connectionManager';
import { ModelTreeProvider } from './providers/modelTreeProvider';
import { registerConnectCommands } from './commands/connect';
import { registerProcessCommands } from './commands/process';
import { registerMeasureCommands } from './commands/measures';
import { openTmslConsole } from './webviews/tmslConsole';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const sidecarManager = new SidecarManager(context);
    const connectionManager = new ConnectionManager();

    // Start the sidecar process; the port is discovered from its stdout.
    const port = await sidecarManager.start();
    connectionManager.setSidecarPort(port);

    // Tree view
    const treeProvider = new ModelTreeProvider(connectionManager);
    const treeView = vscode.window.createTreeView('tabularcraft.modelTree', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });

    // Register all commands
    registerConnectCommands(context, connectionManager, treeProvider);
    registerProcessCommands(context, connectionManager);
    registerMeasureCommands(context, connectionManager);

    context.subscriptions.push(
        treeView,
        vscode.commands.registerCommand('tabularcraft.refreshTree', () => treeProvider.refresh()),
        vscode.commands.registerCommand('tabularcraft.openTmslConsole', () =>
            openTmslConsole(context, connectionManager)
        )
    );

    context.subscriptions.push({
        dispose: () => sidecarManager.stop(),
    });
}

export function deactivate(): void {
    // Cleanup is handled via context.subscriptions
}
