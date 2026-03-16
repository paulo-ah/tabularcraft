import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as http from 'http';

const SIDECAR_STARTUP_TIMEOUT_MS = 15_000;

/**
 * Manages the lifecycle of the .NET sidecar process.
 * The sidecar prints its chosen port to stdout on startup.
 */
export class SidecarManager {
    private process: cp.ChildProcess | null = null;
    private readonly extensionPath: string;

    constructor(context: vscode.ExtensionContext) {
        this.extensionPath = context.extensionPath;
    }

    /**
     * Starts the sidecar and resolves with the port it is listening on.
     */
    async start(): Promise<number> {
        const sidecarPath = this.resolveSidecarPath();
        const port = await this.getAvailablePort();

        let stderrBuffer = '';
        let stdoutBuffer = '';

        this.process = cp.spawn(sidecarPath, [], {
            cwd: path.dirname(sidecarPath),
            env: {
                ...process.env,
                // Force a deterministic endpoint and avoid brittle stdout parsing.
                ASPNETCORE_URLS: `http://127.0.0.1:${port}`,
                // Allow framework-dependent net8 sidecar to run on newer installed runtimes.
                DOTNET_ROLL_FORWARD: 'Major',
            },
        });

        this.process.stdout?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            stdoutBuffer += text;
            console.log('[Tabularcraft sidecar]', text);
        });

        this.process.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            stderrBuffer += text;
            console.error('[Tabularcraft sidecar]', text);
        });

        this.process.on('exit', (code) => {
            if (code !== 0) {
                const details = stderrBuffer.trim();
                const suffix = details ? `\n${details}` : '';
                vscode.window.showErrorMessage(`Tabularcraft sidecar exited with code ${code}.${suffix}`);
            }
            this.process = null;
        });

        try {
            await this.waitForHealth(port, SIDECAR_STARTUP_TIMEOUT_MS);
            return port;
        } catch (err) {
            this.stop();
            const out = stdoutBuffer.trim();
            const details = stderrBuffer.trim();
            const outSection = out ? `\nSidecar stdout:\n${out}` : '';
            const errSection = details ? `\nSidecar stderr:\n${details}` : '';
            const suffix = `${outSection}${errSection}`;
            throw new Error(`${(err as Error).message}${suffix}`);
        }
    }

    private getAvailablePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = net.createServer();

            server.once('error', reject);

            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                if (address && typeof address !== 'string') {
                    const { port } = address;
                    server.close((closeErr) => {
                        if (closeErr) {
                            reject(closeErr);
                            return;
                        }
                        resolve(port);
                    });
                    return;
                }

                server.close();
                reject(new Error('Failed to allocate a local port for sidecar startup.'));
            });
        });
    }

    private async waitForHealth(port: number, timeoutMs: number): Promise<void> {
        const url = `http://127.0.0.1:${port}/health`;
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            if (!this.process) {
                throw new Error('Sidecar process terminated during startup.');
            }

            try {
                const statusCode = await this.probeHealth(url, 1000);
                if (statusCode >= 200 && statusCode < 300) {
                    return;
                }
            } catch {
                // Ignore connection failures until timeout.
            }

            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        throw new Error(`Sidecar health check did not succeed within ${timeoutMs}ms.`);
    }

    private probeHealth(url: string, timeoutMs: number): Promise<number> {
        return new Promise((resolve, reject) => {
            const req = http.get(url, (res) => {
                // Drain the response body to free the socket.
                res.resume();
                resolve(res.statusCode ?? 0);
            });

            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error('Health probe timeout'));
            });

            req.on('error', reject);
        });
    }

    stop(): void {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }

    /**
     * Resolves the sidecar executable path relative to the extension.
     * On Windows the binary is Tabularcraft.Sidecar.exe; elsewhere it has no extension.
     */
    private resolveSidecarPath(): string {
        const isWin = process.platform === 'win32';
        const exe = isWin ? 'Tabularcraft.Sidecar.exe' : 'Tabularcraft.Sidecar';

        // Packaged extension path first, then dev workspace sidecar build outputs.
        const candidates = [
            path.join(this.extensionPath, 'sidecar', exe),
            path.resolve(this.extensionPath, '..', 'sidecar', 'bin', 'Debug', 'net8.0', exe),
            path.resolve(this.extensionPath, '..', 'sidecar', 'bin', 'Release', 'net8.0', exe),
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        throw new Error(
            `Could not find sidecar executable. Checked: ${candidates.join(', ')}`
        );
    }
}
