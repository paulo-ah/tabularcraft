import * as vscode from 'vscode';
import { ConnectionManager, DatabaseInfo, TableInfo, PartitionInfo } from '../connectionManager';

type NodeKind = 'server' | 'database' | 'tables-group' | 'table' | 'partitions-group' | 'partition';

export class ModelNode extends vscode.TreeItem {
    constructor(
        public readonly kind: NodeKind,
        label: string,
        collapsible: vscode.TreeItemCollapsibleState,
        public readonly database?: string,
        public readonly table?: string,
        public readonly partition?: string
    ) {
        super(label, collapsible);
        this.contextValue = this.resolveContextValue();
        this.iconPath = this.resolveIcon();
    }

    private resolveContextValue(): string {
        switch (this.kind) {
            case 'database': return 'database';
            case 'table': return 'table';
            case 'partition': return 'partition';
            default: return this.kind;
        }
    }

    private resolveIcon(): vscode.ThemeIcon {
        switch (this.kind) {
            case 'server': return new vscode.ThemeIcon('server');
            case 'database': return new vscode.ThemeIcon('database');
            case 'tables-group': return new vscode.ThemeIcon('symbol-namespace');
            case 'table': return new vscode.ThemeIcon('table');
            case 'partitions-group': return new vscode.ThemeIcon('list-unordered');
            case 'partition': return new vscode.ThemeIcon('symbol-enum-member');
        }
    }
}

/**
 * TreeDataProvider that shows the connected AAS model hierarchy:
 *   Server
 *   └── Database
 *       └── Tables
 *           └── Table
 *               └── Partitions
 *                   └── Partition
 */
export class ModelTreeProvider implements vscode.TreeDataProvider<ModelNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ModelNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private databases: DatabaseInfo[] = [];

    constructor(private readonly connectionManager: ConnectionManager) {
        connectionManager.onDidChangeConnection(() => this.reload());
    }

    refresh(): void {
        this.reload();
    }

    private async reload(): Promise<void> {
        if (this.connectionManager.isConnected) {
            try {
                this.databases = await this.connectionManager.getDatabases();
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to load model: ${(err as Error).message}`);
                this.databases = [];
            }
        } else {
            this.databases = [];
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ModelNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ModelNode): Promise<ModelNode[]> {
        if (!this.connectionManager.isConnected) {
            return [];
        }

        if (!element) {
            // Root: show server node
            const config = this.connectionManager.currentConfig!;
            return [
                new ModelNode(
                    'server',
                    config.server,
                    vscode.TreeItemCollapsibleState.Expanded
                ),
            ];
        }

        if (element.kind === 'server') {
            // Databases
            if (this.databases.length === 0) {
                await this.reload();
            }
            return this.databases.map(
                (db) =>
                    new ModelNode(
                        'database',
                        db.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        db.name
                    )
            );
        }

        if (element.kind === 'database') {
            return [
                new ModelNode(
                    'tables-group',
                    'Tables',
                    vscode.TreeItemCollapsibleState.Expanded,
                    element.database
                ),
            ];
        }

        if (element.kind === 'tables-group') {
            const db = this.databases.find((d) => d.name === element.database);
            return (db?.tables ?? []).map(
                (t) =>
                    new ModelNode(
                        'table',
                        t.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        element.database,
                        t.name
                    )
            );
        }

        if (element.kind === 'table') {
            return [
                new ModelNode(
                    'partitions-group',
                    'Partitions',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.database,
                    element.table
                ),
            ];
        }

        if (element.kind === 'partitions-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return (table?.partitions ?? []).map(
                (p) =>
                    new ModelNode(
                        'partition',
                        p.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.database,
                        element.table,
                        p.name
                    )
            );
        }

        return [];
    }
}
