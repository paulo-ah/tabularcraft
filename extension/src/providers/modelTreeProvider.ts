import * as vscode from 'vscode';
import { ConnectionManager, DatabaseInfo } from '../connectionManager';
import { ConnectionProfile, ConnectionProfileStore } from '../connectionProfiles';

type NodeKind =
    | 'connections-root'
    | 'connection-profile'
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
    | 'columns-folder'
    | 'column'
    | 'measures-group'
    | 'measures-folder'
    | 'measure'
    | 'hierarchies-group'
    | 'hierarchies-folder'
    | 'hierarchy'
    | 'levels-group'
    | 'level'
    | 'partitions-group'
    | 'partition';

export type TableSortMode = 'model' | 'name-asc';

export class ModelNode extends vscode.TreeItem {
    constructor(
        public readonly kind: NodeKind,
        label: string,
        collapsible: vscode.TreeItemCollapsibleState,
        public readonly profileId?: string,
        public readonly database?: string,
        public readonly table?: string,
        public readonly partition?: string,
        public readonly hierarchy?: string,
        public readonly objectName: string = label,
        public readonly folderPath?: string
    ) {
        super(label, collapsible);
        this.contextValue = this.resolveContextValue();
        this.iconPath = this.resolveIcon();
    }

    private resolveContextValue(): string {
        switch (this.kind) {
            case 'connection-profile': return 'connection-profile';
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
            case 'connections-root': return new vscode.ThemeIcon('plug');
            case 'connection-profile': return new vscode.ThemeIcon('plug');
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
            case 'columns-folder': return new vscode.ThemeIcon('folder');
            case 'column': return new vscode.ThemeIcon('symbol-field');
            case 'measures-group': return new vscode.ThemeIcon('symbol-function');
            case 'measures-folder': return new vscode.ThemeIcon('folder');
            case 'measure': return new vscode.ThemeIcon('symbol-function');
            case 'hierarchies-group': return new vscode.ThemeIcon('type-hierarchy-sub');
            case 'hierarchies-folder': return new vscode.ThemeIcon('folder');
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
    private profiles: ConnectionProfile[] = [];
    private activeProfileId: string | undefined;
    private tableSortMode: TableSortMode = 'model';

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly profileStore: ConnectionProfileStore
    ) {
        this.refreshConnections();
        connectionManager.onDidChangeConnection(() => this.reload());
    }

    refresh(): void {
        this.reload();
    }

    async refreshConnections(): Promise<void> {
        this.profiles = await this.profileStore.listProfiles();
        this._onDidChangeTreeData.fire();
    }

    async setActiveProfile(profileId: string, profileName: string): Promise<void> {
        this.activeProfileId = profileId;
        vscode.commands.executeCommand('setContext', 'tabularcraft.activeConnectionName', profileName);
        await this.reload();
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

    private async ensureConnectionLoaded(profileId?: string): Promise<void> {
        if (!profileId) {
            return;
        }

        if (this.activeProfileId === profileId && this.connectionManager.isConnected) {
            if (this.databases.length === 0) {
                await this.reload();
            }
            return;
        }

        const profile = await this.profileStore.getProfile(profileId);
        if (!profile) {
            vscode.window.showErrorMessage('Tabularcraft: Connection profile was not found.');
            return;
        }

        const config = await this.profileStore.toConnectionConfig(profile);

        try {
            await this.connectionManager.connect(config);
            this.activeProfileId = profile.id;
            vscode.commands.executeCommand('setContext', 'tabularcraft.activeConnectionName', profile.name);
            await this.reload();
        } catch (err) {
            this.databases = [];
            vscode.window.showErrorMessage(`Tabularcraft: Failed to connect profile "${profile.name}": ${(err as Error).message}`);
        }
    }

    getTreeItem(element: ModelNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ModelNode): Promise<ModelNode[]> {
        if (!element) {
            return [
                new ModelNode(
                    'connections-root',
                    'Connections',
                    vscode.TreeItemCollapsibleState.Expanded
                ),
            ];
        }

        if (element.kind === 'connections-root') {
            if (this.profiles.length === 0) {
                await this.refreshConnections();
            }

            return this.profiles.map((profile) => {
                const label = this.activeProfileId === profile.id ? `${profile.name} (connected)` : profile.name;
                return new ModelNode(
                    'connection-profile',
                    label,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    profile.id
                );
            });
        }

        if (element.kind === 'connection-profile') {
            await this.ensureConnectionLoaded(element.profileId);
            if (!this.connectionManager.isConnected) {
                return [];
            }

            return this.databases.map(
                (db) =>
                    new ModelNode(
                        'database',
                        db.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        element.profileId,
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
                    element.profileId,
                    element.database
                ),
                new ModelNode(
                    'roles-group',
                    'Roles',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.profileId,
                    element.database
                ),
                new ModelNode(
                    'perspectives-group',
                    'Perspectives',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.profileId,
                    element.database
                ),
                new ModelNode(
                    'relationships-group',
                    'Relationships',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.profileId,
                    element.database
                ),
                new ModelNode(
                    'data-sources-group',
                    'Data Sources',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.profileId,
                    element.database
                ),
                new ModelNode(
                    'cultures-group',
                    'Cultures',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.profileId,
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
                        element.profileId,
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
                        element.profileId,
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
                        element.profileId,
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
                        element.profileId,
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
                        element.profileId,
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
                        element.profileId,
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
                    element.profileId,
                    element.database,
                    element.table
                ),
                new ModelNode(
                    'measures-group',
                    'Measures',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.profileId,
                    element.database,
                    element.table
                ),
                new ModelNode(
                    'hierarchies-group',
                    'Hierarchies',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.profileId,
                    element.database,
                    element.table
                ),
                new ModelNode(
                    'partitions-group',
                    'Partitions',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    element.profileId,
                    element.database,
                    element.table
                ),
            ];
        }

        if (element.kind === 'columns-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return this.buildFolderAwareNodes(
                'columns',
                table?.columns ?? [],
                element.profileId,
                element.database,
                element.table,
                element.folderPath
            );
        }

        if (element.kind === 'columns-folder') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return this.buildFolderAwareNodes(
                'columns',
                table?.columns ?? [],
                element.profileId,
                element.database,
                element.table,
                element.folderPath
            );
        }

        if (element.kind === 'measures-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return this.buildFolderAwareNodes(
                'measures',
                table?.measures ?? [],
                element.profileId,
                element.database,
                element.table,
                element.folderPath
            );
        }

        if (element.kind === 'measures-folder') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return this.buildFolderAwareNodes(
                'measures',
                table?.measures ?? [],
                element.profileId,
                element.database,
                element.table,
                element.folderPath
            );
        }

        if (element.kind === 'hierarchies-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return this.buildFolderAwareNodes(
                'hierarchies',
                table?.hierarchies ?? [],
                element.profileId,
                element.database,
                element.table,
                element.folderPath
            );
        }

        if (element.kind === 'hierarchies-folder') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            return this.buildFolderAwareNodes(
                'hierarchies',
                table?.hierarchies ?? [],
                element.profileId,
                element.database,
                element.table,
                element.folderPath
            );
        }

        if (element.kind === 'hierarchy') {
            return [
                new ModelNode(
                    'levels-group',
                    'Levels',
                    vscode.TreeItemCollapsibleState.Expanded,
                    element.profileId,
                    element.database,
                    element.table,
                    undefined,
                    element.hierarchy
                ),
            ];
        }

        if (element.kind === 'levels-group') {
            const db = this.databases.find((d) => d.name === element.database);
            const table = db?.tables.find((t) => t.name === element.table);
            const hierarchy = table?.hierarchies.find((h) => h.name === element.hierarchy);
            return (hierarchy?.levels ?? []).map(
                (l) =>
                    new ModelNode(
                        'level',
                        l.name,
                        vscode.TreeItemCollapsibleState.None,
                        element.profileId,
                        element.database,
                        element.table,
                        undefined,
                        element.hierarchy
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
                        element.profileId,
                        element.database,
                        element.table,
                        p.name
                    )
            );
        }

        return [];
    }

    private buildFolderAwareNodes(
        group: 'columns' | 'measures' | 'hierarchies',
        items: Array<{ name: string; displayFolder?: string }>,
        profileId?: string,
        database?: string,
        table?: string,
        currentFolderPath?: string
    ): ModelNode[] {
        const current = normalizeFolder(currentFolderPath);
        const children = dedupeByKey(
            items.map((i) => ({ name: i.name, folder: normalizeFolder(i.displayFolder) })),
            (i) => `${i.folder.toLowerCase()}|${i.name.toLowerCase()}`
        )
            .filter((i) => isInCurrentFolder(i.folder, current));

        const subfolders = new Map<string, string>();
        const directItems: Array<{ name: string; folder: string }> = [];

        for (const item of children) {
            const remainder = folderRemainder(item.folder, current);
            if (!remainder) {
                directItems.push(item);
                continue;
            }

            const nextSegment = remainder.split('/')[0];
            const fullPath = current ? `${current}/${nextSegment}` : nextSegment;
            const key = fullPath.toLowerCase();
            if (!subfolders.has(key)) {
                subfolders.set(key, fullPath);
            }
        }

        const folderNodes = [...subfolders.values()]
            .sort((a, b) => a.localeCompare(b))
            .map((folderPath) =>
                new ModelNode(
                    folderKind(group),
                    folderPath.split('/').pop() ?? folderPath,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    profileId,
                    database,
                    table,
                    undefined,
                    undefined,
                    folderPath,
                    folderPath
                )
            );

        const objectNodes = directItems
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => {
                const displayLabel = current ? `  ${item.name}` : item.name;

                if (group === 'columns') {
                    return new ModelNode(
                        'column',
                        displayLabel,
                        vscode.TreeItemCollapsibleState.None,
                        profileId,
                        database,
                        table
                    );
                }

                if (group === 'measures') {
                    return new ModelNode(
                        'measure',
                        displayLabel,
                        vscode.TreeItemCollapsibleState.None,
                        profileId,
                        database,
                        table
                    );
                }

                return new ModelNode(
                    'hierarchy',
                    displayLabel,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    profileId,
                    database,
                    table,
                    undefined,
                    item.name
                );
            });

        return [...folderNodes, ...objectNodes];
    }
}

function folderKind(group: 'columns' | 'measures' | 'hierarchies'): NodeKind {
    switch (group) {
        case 'columns': return 'columns-folder';
        case 'measures': return 'measures-folder';
        case 'hierarchies': return 'hierarchies-folder';
    }
}

function normalizeFolder(value?: string): string {
    if (!value) return '';

    const candidate = value
        .split(';')
        .map((v) => v.trim())
        .find((v) => !!v) ?? '';

    return candidate
        .replace(/\\/g, '/')
        .split('/')
        .map((segment) => segment.trim())
        .filter((segment) => !!segment)
        .join('/');
}

function dedupeByKey<T>(items: T[], keySelector: (value: T) => string): T[] {
    const map = new Map<string, T>();
    for (const item of items) {
        const key = keySelector(item);
        if (!map.has(key)) {
            map.set(key, item);
        }
    }

    return [...map.values()];
}

function isInCurrentFolder(itemFolder: string, currentFolder: string): boolean {
    if (!currentFolder) {
        return true;
    }

    const itemLower = itemFolder.toLowerCase();
    const currentLower = currentFolder.toLowerCase();
    return itemLower === currentLower || itemLower.startsWith(`${currentLower}/`);
}

function folderRemainder(itemFolder: string, currentFolder: string): string {
    if (!currentFolder) {
        return itemFolder;
    }

    const itemLower = itemFolder.toLowerCase();
    const currentLower = currentFolder.toLowerCase();

    if (itemLower === currentLower) {
        return '';
    }

    return itemLower.startsWith(`${currentLower}/`)
        ? itemFolder.slice(currentFolder.length + 1)
        : '';
}
