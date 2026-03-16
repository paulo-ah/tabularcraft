import * as vscode from 'vscode';
import { ConnectionManager, DatabaseInfo } from '../connectionManager';

type NodeKind =
    | 'server'
    | 'database'
    | 'tables-group'
    | 'roles-group'
    | 'role'
    | 'perspectives-group'
    | 'perspective'
    | 'relationships-group'
    | 'relationship'
    | 'data-sources-group'
    | 'data-source'
    | 'cultures-group'
    | 'culture'
    | 'table'
    | 'columns-group'
    | 'column'
    | 'measures-group'
    | 'measure'
    | 'hierarchies-group'
    | 'hierarchy'
    | 'levels-group'
    | 'level'
    | 'partitions-group'
    | 'partition';

export type TableSortMode = 'model' | 'name-asc';

export class ModelNode extends vscode.TreeItem {
    private static readonly renameableKinds = new Set<NodeKind>([
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

    constructor(
        public readonly kind: NodeKind,
        label: string,
        collapsible: vscode.TreeItemCollapsibleState,
        public readonly database?: string,
        public readonly table?: string,
        public readonly partition?: string,
        public readonly hierarchy?: string,
        public readonly objectName: string = label
    ) {
        super(label, collapsible);
        this.contextValue = this.resolveContextValue();
        this.iconPath = this.resolveIcon();
    }

    private resolveContextValue(): string {
        switch (this.kind) {
            case 'database': return 'database';
            case 'table': return 'table';
            case 'column': return 'column';
            case 'measure': return 'measure';
            case 'hierarchy': return 'hierarchy';
            case 'level': return 'level';
            case 'role': return 'role';
            case 'perspective': return 'perspective';
            case 'data-source': return 'data-source';
            case 'culture': return 'culture';
            case 'partition': return 'partition';
            default: return this.kind;
        }
    }

    private resolveIcon(): vscode.ThemeIcon {
        switch (this.kind) {
            case 'server': return new vscode.ThemeIcon('server');
            case 'database': return new vscode.ThemeIcon('database');
            case 'tables-group': return new vscode.ThemeIcon('symbol-namespace');
            case 'roles-group': return new vscode.ThemeIcon('shield');
            case 'role': return new vscode.ThemeIcon('shield');
            case 'perspectives-group': return new vscode.ThemeIcon('eye');
            case 'perspective': return new vscode.ThemeIcon('eye');
            case 'relationships-group': return new vscode.ThemeIcon('git-merge');
            case 'relationship': return new vscode.ThemeIcon('git-merge');
            case 'data-sources-group': return new vscode.ThemeIcon('plug');
            case 'data-source': return new vscode.ThemeIcon('plug');
            case 'cultures-group': return new vscode.ThemeIcon('globe');
            case 'culture': return new vscode.ThemeIcon('globe');
            case 'table': return new vscode.ThemeIcon('table');
            case 'columns-group': return new vscode.ThemeIcon('symbol-field');
            case 'column': return new vscode.ThemeIcon('symbol-field');
            case 'measures-group': return new vscode.ThemeIcon('symbol-function');
            case 'measure': return new vscode.ThemeIcon('symbol-function');
            case 'hierarchies-group': return new vscode.ThemeIcon('type-hierarchy-sub');
            case 'hierarchy': return new vscode.ThemeIcon('type-hierarchy-sub');
            case 'levels-group': return new vscode.ThemeIcon('list-tree');
            case 'level': return new vscode.ThemeIcon('list-flat');
            case 'partitions-group': return new vscode.ThemeIcon('list-unordered');
            case 'partition': return new vscode.ThemeIcon('symbol-enum-member');
        }
    }
}

/**
 * TreeDataProvider that shows the connected AAS model hierarchy:
 *   Server
 *   └── Database
 *       ├── Tables
 *       ├── Roles
 *       ├── Perspectives
 *       ├── Relationships
 *       ├── Data Sources
 *       └── Cultures
 */
export class ModelTreeProvider implements vscode.TreeDataProvider<ModelNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ModelNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private databases: DatabaseInfo[] = [];
    private tableSortMode: TableSortMode = 'model';

    constructor(private readonly connectionManager: ConnectionManager) {
        connectionManager.onDidChangeConnection(() => this.reload());
    }

    refresh(): void {
        this.reload();
    }

    async chooseTableSortMode(): Promise<void> {
        const selected = await vscode.window.showQuickPick(
            [
                { label: 'Model order', value: 'model' as TableSortMode },
                { label: 'Name (A-Z)', value: 'name-asc' as TableSortMode },
            ],
            {
                title: 'Tabularcraft - Table sorting',
                ignoreFocusOut: true,
                placeHolder: `Current: ${this.tableSortMode === 'model' ? 'Model order' : 'Name (A-Z)'}`,
            }
        );

        if (!selected || selected.value === this.tableSortMode) {
            return;
        }

        this.tableSortMode = selected.value;
        this._onDidChangeTreeData.fire();
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
                new ModelNode(
                    'roles-group',
                    'Roles',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.database
                ),
                new ModelNode(
                    'perspectives-group',
                    'Perspectives',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.database
                ),
                new ModelNode(
                    'relationships-group',
                    'Relationships',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.database
                ),
                new ModelNode(
                    'data-sources-group',
                    'Data Sources',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.database
                ),
                new ModelNode(
                    'cultures-group',
                    'Cultures',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.database
                ),
            ];
        }

        if (element.kind === 'roles-group') {
            const db = this.databases.find((d) => d.name === element.database);
            return (db?.roles ?? []).map(
                (r) =>
                    new ModelNode(
                        'role',
                        r.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.database
                    )
            );
        }

        if (element.kind === 'perspectives-group') {
            const db = this.databases.find((d) => d.name === element.database);
            return (db?.perspectives ?? []).map(
                (p) =>
                    new ModelNode(
                        'perspective',
                        p.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.database
                    )
            );
        }

        if (element.kind === 'relationships-group') {
            const db = this.databases.find((d) => d.name === element.database);
            return (db?.relationships ?? []).map(
                (r) =>
                    new ModelNode(
                        'relationship',
                        r.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.database
                    )
            );
        }

        if (element.kind === 'data-sources-group') {
            const db = this.databases.find((d) => d.name === element.database);
            return (db?.dataSources ?? []).map(
                (ds) =>
                    new ModelNode(
                        'data-source',
                        ds.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.database
                    )
            );
        }

        if (element.kind === 'cultures-group') {
            const db = this.databases.find((d) => d.name === element.database);
            return (db?.cultures ?? []).map(
                (c) =>
                    new ModelNode(
                        'culture',
                        c.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.database
                    )
            );
        }

        if (element.kind === 'tables-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const tables = [...(db?.tables ?? [])];
            if (this.tableSortMode === 'name-asc') {
                tables.sort((a, b) => a.name.localeCompare(b.name));
            }

            return tables.map(
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
                    'columns-group',
                    'Columns',
                    vscode.TreeItemCollapsibleState.Expanded,
                    element.database,
                    element.table
                ),
                new ModelNode(
                    'measures-group',
                    'Measures',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.database,
                    element.table
                ),
                new ModelNode(
                    'hierarchies-group',
                    'Hierarchies',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.database,
                    element.table
                ),
                new ModelNode(
                    'partitions-group',
                    'Partitions',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.database,
                    element.table
                ),
            ];
        }

        if (element.kind === 'columns-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return (table?.columns ?? []).map(
                (c) =>
                    new ModelNode(
                        'column',
                        c.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.database,
                        element.table
                    )
            );
        }

        if (element.kind === 'measures-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return (table?.measures ?? []).map(
                (m) =>
                    new ModelNode(
                        'measure',
                        m.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.database,
                        element.table
                    )
            );
        }

        if (element.kind === 'hierarchies-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return (table?.hierarchies ?? []).map(
                (h) =>
                    new ModelNode(
                        'hierarchy',
                        h.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        element.database,
                        element.table,
                        undefined,
                        h.name
                    )
            );
        }

        if (element.kind === 'hierarchy') {
            return [
                new ModelNode(
                    'levels-group',
                    'Levels',
                    vscode.TreeItemCollapsibleState.Expanded,
                    element.database,
                    element.table,
                    element.partition
                ),
            ];
        }

        if (element.kind === 'levels-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            const hierarchy = table?.hierarchies.find((h) => h.name === element.partition);
            return (hierarchy?.levels ?? []).map(
                (l) =>
                    new ModelNode(
                        'level',
                        l.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.database,
                        element.table,
                        undefined,
                        element.partition
                    )
            );
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
