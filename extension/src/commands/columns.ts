import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';
import { ModelNode } from '../providers/modelTreeProvider';
import { openColumnEditor } from '../webviews/columnEditor';

export function registerColumnCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tabularcraft.createNewDataColumn', (node: ModelNode) => {
            if (!node?.database || !node?.table) {
                vscode.window.showWarningMessage('Select a table Columns node to create a data column.');
                return;
            }

            openColumnEditor(context, connectionManager, node.database, node.table, 'data');
        }),
        vscode.commands.registerCommand('tabularcraft.createNewCalculatedColumn', (node: ModelNode) => {
            if (!node?.database || !node?.table) {
                vscode.window.showWarningMessage('Select a table Columns node to create a calculated column.');
                return;
            }

            openColumnEditor(context, connectionManager, node.database, node.table, 'calculated');
        })
    );
}
