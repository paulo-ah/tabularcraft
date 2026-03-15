/**
 * Typed HTTP client for communicating with the .NET sidecar over localhost JSON.
 * All methods throw on non-2xx responses so callers can show VS Code error messages.
 */
export class SidecarClient {
    constructor(private readonly port: number) {}

    private get baseUrl(): string {
        return `http://localhost:${this.port}`;
    }

    async post<T>(path: string, body: unknown): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return this.handleResponse<T>(response);
    }

    async get<T>(path: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`);
        return this.handleResponse<T>(response);
    }

    async delete(path: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE' });
        if (!response.ok) {
            const text = await response.text().catch(() => response.statusText);
            throw new Error(text);
        }
    }

    private async handleResponse<T>(response: Response): Promise<T> {
        if (!response.ok) {
            const text = await response.text().catch(() => response.statusText);
            throw new Error(text);
        }
        return response.json() as Promise<T>;
    }
}
