import * as vscode from 'vscode';
import { AuthMode, ConnectionConfig } from './connectionManager';

const PROFILES_KEY = 'tabularcraft.connectionProfiles';
const SECRET_KEY_PREFIX = 'tabularcraft.connectionProfileSecret.';

export interface ConnectionProfile {
    id: string;
    name: string;
    server: string;
    database: string;
    authMode: AuthMode;
    username?: string;
    tenantId?: string;
    appId?: string;
    updatedAt: string;
}

interface ProfileSecret {
    password?: string;
    clientSecret?: string;
}

export interface ProfileSecretPresence {
    hasPassword: boolean;
    hasClientSecret: boolean;
}

export class ConnectionProfileStore {
    constructor(private readonly context: vscode.ExtensionContext) {}

    async listProfiles(): Promise<ConnectionProfile[]> {
        const profiles = this.context.globalState.get<ConnectionProfile[]>(PROFILES_KEY, []);
        return [...profiles].sort((a, b) => a.name.localeCompare(b.name));
    }

    async getProfile(profileId: string): Promise<ConnectionProfile | undefined> {
        const profiles = await this.listProfiles();
        return profiles.find((p) => p.id === profileId);
    }

    async saveProfile(name: string, config: ConnectionConfig): Promise<ConnectionProfile> {
        const now = new Date().toISOString();
        const profile: ConnectionProfile = {
            id: createProfileId(),
            name: name.trim(),
            server: config.server,
            database: config.database,
            authMode: config.authMode,
            username: config.username,
            tenantId: config.tenantId,
            appId: config.appId,
            updatedAt: now,
        };

        const profiles = this.context.globalState.get<ConnectionProfile[]>(PROFILES_KEY, []);
        profiles.push(profile);
        await this.context.globalState.update(PROFILES_KEY, profiles);

        const secret: ProfileSecret = {};
        if (config.authMode === 'userpass' && config.password) {
            secret.password = config.password;
        }
        if (config.authMode === 'serviceprincipal' && config.clientSecret) {
            secret.clientSecret = config.clientSecret;
        }

        if (Object.keys(secret).length > 0) {
            await this.context.secrets.store(secretKey(profile.id), JSON.stringify(secret));
        }

        return profile;
    }

    async updateProfile(profileId: string, name: string, config: ConnectionConfig): Promise<ConnectionProfile> {
        const profiles = this.context.globalState.get<ConnectionProfile[]>(PROFILES_KEY, []);
        const index = profiles.findIndex((p) => p.id === profileId);
        if (index < 0) {
            throw new Error('Connection profile not found.');
        }

        const now = new Date().toISOString();
        const updated: ConnectionProfile = {
            id: profileId,
            name: name.trim(),
            server: config.server,
            database: config.database,
            authMode: config.authMode,
            username: config.username,
            tenantId: config.tenantId,
            appId: config.appId,
            updatedAt: now,
        };

        profiles[index] = updated;
        await this.context.globalState.update(PROFILES_KEY, profiles);

        const secret: ProfileSecret = {};
        if (config.authMode === 'userpass' && config.password) {
            secret.password = config.password;
        }
        if (config.authMode === 'serviceprincipal' && config.clientSecret) {
            secret.clientSecret = config.clientSecret;
        }

        if (Object.keys(secret).length > 0) {
            await this.context.secrets.store(secretKey(profileId), JSON.stringify(secret));
        } else {
            await this.context.secrets.delete(secretKey(profileId));
        }

        return updated;
    }

    async deleteProfile(profileId: string): Promise<void> {
        const profiles = this.context.globalState.get<ConnectionProfile[]>(PROFILES_KEY, []);
        const filtered = profiles.filter((p) => p.id !== profileId);
        await this.context.globalState.update(PROFILES_KEY, filtered);
        await this.context.secrets.delete(secretKey(profileId));
    }

    async toConnectionConfig(profile: ConnectionProfile): Promise<ConnectionConfig> {
        const config: ConnectionConfig = {
            server: profile.server,
            database: profile.database,
            authMode: profile.authMode,
            username: profile.username,
            tenantId: profile.tenantId,
            appId: profile.appId,
        };

        const rawSecret = await this.context.secrets.get(secretKey(profile.id));
        if (rawSecret) {
            try {
                const parsed = JSON.parse(rawSecret) as ProfileSecret;
                if (profile.authMode === 'userpass' && parsed.password) {
                    config.password = parsed.password;
                }
                if (profile.authMode === 'serviceprincipal' && parsed.clientSecret) {
                    config.clientSecret = parsed.clientSecret;
                }
            } catch {
                // Ignore malformed secrets and fall back to prompting.
            }
        }

        return config;
    }

    async updateProfileSecret(profileId: string, updates: ProfileSecret): Promise<void> {
        const existingRaw = await this.context.secrets.get(secretKey(profileId));
        let existing: ProfileSecret = {};

        if (existingRaw) {
            try {
                existing = JSON.parse(existingRaw) as ProfileSecret;
            } catch {
                existing = {};
            }
        }

        const merged: ProfileSecret = { ...existing, ...updates };
        await this.context.secrets.store(secretKey(profileId), JSON.stringify(merged));
    }

    async getSecretPresence(profileId: string): Promise<ProfileSecretPresence> {
        const rawSecret = await this.context.secrets.get(secretKey(profileId));
        if (!rawSecret) {
            return { hasPassword: false, hasClientSecret: false };
        }

        try {
            const parsed = JSON.parse(rawSecret) as ProfileSecret;
            return {
                hasPassword: !!parsed.password,
                hasClientSecret: !!parsed.clientSecret,
            };
        } catch {
            return { hasPassword: false, hasClientSecret: false };
        }
    }
}

function secretKey(profileId: string): string {
    return `${SECRET_KEY_PREFIX}${profileId}`;
}

function createProfileId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
