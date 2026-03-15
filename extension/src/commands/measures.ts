import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';
import { ModelNode } from '../providers/modelTreeProvider';
import { openMeasureEditor } from '../webviews/measureEditor';

export function registerMeasureCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tabularcraft.openMeasureEditor', (node: ModelNode) =>
            openMeasureEditor(context, connectionManager, node.database!, node.table!)
        )
    );
}
