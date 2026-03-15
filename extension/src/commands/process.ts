import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';
import { ModelNode } from '../providers/modelTreeProvider';

export function registerProcessCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tabularcraft.processDatabase', (node: ModelNode) =>
            runWithProgress(
                `Processing database "${node.database}"…`,
                async () => connectionManager.processDatabase(node.database!)
            )
        ),
        vscode.commands.registerCommand('tabularcraft.processTable', (node: ModelNode) =>
            runWithProgress(
                `Processing table "${node.table}"…`,
                async () => connectionManager.processTable(node.database!, node.table!)
            )
        ),
        vscode.commands.registerCommand('tabularcraft.processPartition', (node: ModelNode) =>
            runWithProgress(
                `Processing partition "${node.partition}"…`,
                async () =>
                    connectionManager.processPartition(node.database!, node.table!, node.partition!)
            )
        ),
        vscode.commands.registerCommand('tabularcraft.processAdd', async (node: ModelNode) => {
            const template = buildProcessAddTemplate(node.database!, node.table!, node.partition!);
            const script = await vscode.window.showInputBox({
                title: 'ProcessAdd (TMSL)',
                prompt: 'Review and edit the TMSL script, then press Enter to execute.',
                value: template,
                ignoreFocusOut: true,
            });
            if (!script) return;
            await runWithProgress(`ProcessAdd on "${node.partition}"…`, async () =>
                connectionManager.processAdd(script)
            );
        })
    );
}

async function runWithProgress(title: string, action: () => Promise<void>): Promise<void> {
    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Tabularcraft: ${title}`, cancellable: false },
            action
        );
        vscode.window.showInformationMessage(`Tabularcraft: ${title.replace('…', '')} — Done.`);
    } catch (err) {
        vscode.window.showErrorMessage(`Tabularcraft: ${(err as Error).message}`);
    }
}

function buildProcessAddTemplate(database: string, table: string, partition: string): string {
    return JSON.stringify(
        {
            refresh: {
                type: 'processAdd',
                objects: [{ database, table, partition }],
            },
        },
        null,
        2
    );
}
