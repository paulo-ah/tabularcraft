import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';
import { ModelNode } from '../providers/modelTreeProvider';
import { openMeasureEditor } from '../webviews/measureEditor';
import { openMeasureCreator } from '../webviews/measureCreator';

export function registerMeasureCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tabularcraft.openMeasureEditor', (node: ModelNode) =>
            openMeasureEditor(context, connectionManager, node.database!, node.table!)
        ),
        vscode.commands.registerCommand('tabularcraft.createNewMeasure', (node: ModelNode) => {
            if (!node?.database || !node?.table) {
                vscode.window.showWarningMessage('Select a table Measures node to create a new measure.');
                return;
            }

            openMeasureCreator(context, connectionManager, node.database, node.table);
        })
    );
}
