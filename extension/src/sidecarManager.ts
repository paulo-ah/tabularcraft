import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';

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
     * The sidecar must write "Listening on port <N>" to stdout.
     */
    start(): Promise<number> {
        return new Promise((resolve, reject) => {
            const sidecarPath = this.resolveSidecarPath();

            this.process = cp.spawn(sidecarPath, [], {
                cwd: path.dirname(sidecarPath),
                env: { ...process.env },
            });

            const timer = setTimeout(() => {
                reject(new Error('Sidecar did not report its port within the timeout.'));
            }, SIDECAR_STARTUP_TIMEOUT_MS);

            this.process.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                const match = text.match(/Listening on port (\d+)/);
                if (match) {
                    clearTimeout(timer);
                    resolve(parseInt(match[1], 10));
                }
            });

            this.process.stderr?.on('data', (chunk: Buffer) => {
                console.error('[Tabularcraft sidecar]', chunk.toString());
            });

            this.process.on('error', (err) => {
                clearTimeout(timer);
                reject(new Error(`Failed to start sidecar: ${err.message}`));
            });

            this.process.on('exit', (code) => {
                if (code !== 0) {
                    vscode.window.showErrorMessage(`Tabularcraft sidecar exited with code ${code}.`);
                }
                this.process = null;
            });
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
        return path.join(this.extensionPath, 'sidecar', exe);
    }
}
