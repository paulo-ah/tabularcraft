#!/usr/bin/env node

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const extensionRoot = path.resolve(__dirname, '..');
const sidecarProject = path.resolve(extensionRoot, '..', 'sidecar', 'Tabularcraft.Sidecar.csproj');
const sidecarOutput = path.resolve(extensionRoot, '..', 'sidecar', 'bin', 'Release', 'net8.0');
const targetDir = path.resolve(extensionRoot, 'sidecar');

function run(command, args) {
  const result = cp.spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function ensureExecutable(filePath) {
  if (process.platform === 'win32') {
    return;
  }

  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // Best effort; failure here is non-fatal because DLL fallback exists.
  }
}

function main() {
  console.log('[prepare-sidecar] Building sidecar (Release/net8.0)...');
  run('dotnet', ['build', sidecarProject, '-c', 'Release']);

  if (!fs.existsSync(sidecarOutput)) {
    throw new Error(`[prepare-sidecar] Expected output not found: ${sidecarOutput}`);
  }

  console.log('[prepare-sidecar] Copying sidecar output into extension/sidecar...');
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  fs.cpSync(sidecarOutput, targetDir, { recursive: true, force: true });

  const appHost = process.platform === 'win32'
    ? path.join(targetDir, 'Tabularcraft.Sidecar.exe')
    : path.join(targetDir, 'Tabularcraft.Sidecar');

  if (fs.existsSync(appHost)) {
    ensureExecutable(appHost);
  }

  console.log('[prepare-sidecar] Done.');
}

main();
