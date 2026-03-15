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
}

export interface TableInfo {
    name: string;
    partitions: PartitionInfo[];
}

export interface PartitionInfo {
    name: string;
}

export interface MeasureInfo {
    name: string;
    expression: string;
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

    private assertClient(): void {
        if (!this.client) throw new Error('Sidecar client not initialised.');
    }

    private assertConnected(): void {
        this.assertClient();
        if (!this._connected) throw new Error('Not connected to AAS.');
    }
}
