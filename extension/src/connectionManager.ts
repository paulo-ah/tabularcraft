import * as vscode from 'vscode';
import { SidecarClient } from './sidecarClient';

export type AuthMode = 'interactive' | 'userpass' | 'serviceprincipal';

export interface ConnectionConfig {
    server: string;
    database: string;
    authMode: AuthMode;
    username?: string;
    password?: string;
    appId?: string;
    tenantId?: string;
    clientSecret?: string;
}

export interface DatabaseInfo {
    name: string;
    tables: TableInfo[];
    roles: NamedObjectInfo[];
    perspectives: NamedObjectInfo[];
    relationships: NamedObjectInfo[];
    dataSources: NamedObjectInfo[];
    cultures: NamedObjectInfo[];
}

export interface TableInfo {
    name: string;
    columns: ColumnInfo[];
    measures: MeasureTreeInfo[];
    hierarchies: HierarchyTreeInfo[];
    partitions: PartitionInfo[];
}

export interface NamedObjectInfo {
    name: string;
}

export interface ColumnInfo {
    name: string;
    displayFolder?: string;
}

export interface MeasureTreeInfo {
    name: string;
    displayFolder?: string;
}

export interface HierarchyTreeInfo {
    name: string;
    levels: LevelInfo[];
    displayFolder?: string;
}

export interface LevelInfo {
    name: string;
}

export interface PartitionInfo {
    name: string;
}

export interface MeasureInfo {
    name: string;
    expression: string;
    formatString?: string;
}

export interface RenameObjectRequest {
    database: string;
    objectType: string;
    oldName: string;
    newName: string;
    table?: string;
    hierarchy?: string;
}

export interface DeleteObjectRequest {
    database: string;
    objectType: string;
    objectName: string;
    table?: string;
    hierarchy?: string;
}

export interface ObjectPropertiesRequest {
    database: string;
    objectType: string;
    objectName: string;
    table?: string;
    hierarchy?: string;
}

export interface ObjectPropertyInfo {
    name: string;
    value: string;
    editable: boolean;
    type: 'string' | 'number' | 'boolean' | 'enum';
    required: boolean;
    enumValues?: string[];
}

export interface UpdateObjectPropertiesRequest {
    database: string;
    objectType: string;
    objectName: string;
    updates: Array<{ name: string; value: string }>;
    table?: string;
    hierarchy?: string;
}

export interface PartitionQueryInfo {
    query: string;
    queryType: string;
    editable: boolean;
}

export interface CreateDataColumnRequest {
    database: string;
    table: string;
    name: string;
    sourceColumn: string;
    dataType: string;
    displayFolder?: string;
    formatString?: string;
}

export interface CreateCalculatedColumnRequest {
    database: string;
    table: string;
    name: string;
    expression: string;
    dataType: string;
    displayFolder?: string;
    formatString?: string;
}

/**
 * Holds the current AAS connection state and exposes typed methods
 * that delegate to SidecarClient. Emits an event when the state changes
 * so the tree view can refresh.
 */
export class ConnectionManager {
    private client: SidecarClient | null = null;
    private _connected = false;
    private _config: ConnectionConfig | null = null;

    private readonly _onDidChangeConnection = new vscode.EventEmitter<boolean>();
    readonly onDidChangeConnection = this._onDidChangeConnection.event;

    setSidecarPort(port: number): void {
        this.client = new SidecarClient(port);
    }

    get isConnected(): boolean {
        return this._connected;
    }

    get currentConfig(): ConnectionConfig | null {
        return this._config;
    }

    async connect(config: ConnectionConfig): Promise<void> {
        this.assertClient();
        await this.client!.post('/connection/connect', config);
        this._connected = true;
        this._config = config;
        vscode.commands.executeCommand('setContext', 'tabularcraft.connected', true);
        this._onDidChangeConnection.fire(true);
    }

    async testConnection(config: ConnectionConfig): Promise<void> {
        this.assertClient();
        await this.client!.post('/connection/test', config);
    }

    async disconnect(): Promise<void> {
        if (!this._connected) return;
        this.assertClient();
        await this.client!.post('/connection/disconnect', {});
        this._connected = false;
        this._config = null;
        vscode.commands.executeCommand('setContext', 'tabularcraft.connected', false);
        this._onDidChangeConnection.fire(false);
    }

    async getDatabases(): Promise<DatabaseInfo[]> {
        this.assertConnected();
        return this.client!.get<DatabaseInfo[]>('/model/databases');
    }

    async processDatabase(database: string): Promise<void> {
        this.assertConnected();
        await this.client!.post('/process/database', { database });
    }

    async processTable(database: string, table: string): Promise<void> {
        this.assertConnected();
        await this.client!.post('/process/table', { database, table });
    }

    async processPartition(database: string, table: string, partition: string): Promise<void> {
        this.assertConnected();
        await this.client!.post('/process/partition', { database, table, partition });
    }

    async processAdd(tmsl: string): Promise<void> {
        this.assertConnected();
        await this.client!.post('/tmsl/execute', { script: tmsl });
    }

    async getPartitionQuery(database: string, table: string, partition: string): Promise<PartitionQueryInfo> {
        this.assertConnected();
        return this.client!.post<PartitionQueryInfo>('/process/partition/query/get', { database, table, partition });
    }

    async updatePartitionQuery(database: string, table: string, partition: string, query: string): Promise<void> {
        this.assertConnected();
        await this.client!.post('/process/partition/query/update', { database, table, partition, query });
    }

    async createDataColumn(request: CreateDataColumnRequest): Promise<void> {
        this.assertConnected();
        await this.client!.post('/model/columns/data/create', request);
    }

    async createCalculatedColumn(request: CreateCalculatedColumnRequest): Promise<void> {
        this.assertConnected();
        await this.client!.post('/model/columns/calculated/create', request);
    }

    async getMeasures(database: string, table: string): Promise<MeasureInfo[]> {
        this.assertConnected();
        return this.client!.get<MeasureInfo[]>(
            `/measures?database=${encodeURIComponent(database)}&table=${encodeURIComponent(table)}`
        );
    }

    async upsertMeasure(database: string, table: string, measure: MeasureInfo): Promise<void> {
        this.assertConnected();
        await this.client!.post('/measures/upsert', { database, table, measure });
    }

    async deleteMeasure(database: string, table: string, measureName: string): Promise<void> {
        this.assertConnected();
        await this.client!.post('/measures/delete', { database, table, measureName });
    }

    async executeTmsl(script: string): Promise<string> {
        this.assertConnected();
        const result = await this.client!.post<{ result: string }>('/tmsl/execute', { script });
        return result.result;
    }

    async renameObject(request: RenameObjectRequest): Promise<void> {
        this.assertConnected();
        await this.client!.post('/model/rename', request);
    }

    async deleteObject(request: DeleteObjectRequest): Promise<void> {
        this.assertConnected();
        await this.client!.post('/model/delete', request);
    }

    async getObjectProperties(request: ObjectPropertiesRequest): Promise<ObjectPropertyInfo[]> {
        this.assertConnected();
        return this.client!.post<ObjectPropertyInfo[]>('/model/properties/get', request);
    }

    async updateObjectProperties(request: UpdateObjectPropertiesRequest): Promise<void> {
        this.assertConnected();
        await this.client!.post('/model/properties/update', request);
    }

    private assertClient(): void {
        if (!this.client) throw new Error('Sidecar client not initialised.');
    }

    private assertConnected(): void {
        this.assertClient();
        if (!this._connected) throw new Error('Not connected to AAS.');
    }
}
