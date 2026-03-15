# Tabularcraft

A VS Code extension for managing **Azure Analysis Services (AAS)** tabular models — Tabular Editor ergonomics, inside VS Code.

---

## Architecture

```
extension/          VS Code extension (TypeScript) — UI & orchestration
sidecar/            .NET 8 Minimal API — all TOM/XMLA logic
```

The extension communicates with the sidecar over **localhost HTTP (JSON)**. The extension never embeds TOM logic directly.

---

## Features

| Feature | Status |
|---|---|
| Connect to AAS (Interactive / Username+Password / Service Principal) | ✅ |
| Browse databases, tables, partitions (sidebar tree) | ✅ |
| Full processing — database, table, partition | ✅ |
| Measure editor (DAX name + expression + format string) | ✅ |
| TMSL console with reusable templates | ✅ |
| Incremental refresh via ProcessAdd (TMSL) | ✅ |

---

## Prerequisites

| Tool | Version |
|---|---|
| VS Code | ≥ 1.85 |
| Node.js | ≥ 20 |
| .NET SDK | ≥ 8.0 |

---

## Getting Started

### 1. Install extension dependencies

```bash
cd extension
npm install
```

### 2. Build the sidecar

```bash
cd sidecar
dotnet build
```

### 3. Launch (F5)

Open the workspace in VS Code and press **F5** to start the extension development host.

The extension will automatically start the sidecar on a free port and shut it down when VS Code closes.

---

## Connecting to AAS

Open the **Tabularcraft** sidebar panel and click **Connect**. You'll be prompted for:

- **Server** — e.g. `asazure://eastus.asazure.windows.net/myserver`
- **Authentication** — Interactive (device login), Username+Password, or Service Principal

---

## Supported Authentication Modes

| Mode | Description |
|---|---|
| Interactive | Device or browser login via Entra ID |
| Username + Password | Only if tenant policy allows |
| Service Principal | App ID + Tenant ID + Client Secret |

Credentials are **never stored** — provide them per session.

---

## Development

### Extension (TypeScript)
```bash
cd extension
npm run compile      # one-shot build
npm run watch        # incremental build
```

### Sidecar (.NET)
```bash
cd sidecar
dotnet run           # runs on localhost (random port printed to stdout)
```

### Package extension
```bash
cd extension
npx vsce package
```

---

## Out of Scope (current)

- Power BI / Fabric XMLA
- Advanced DAX IntelliSense
- Visual relationship diagrams
- Multidimensional (MD) models

---

## License

Internal — Maersk People Data & Analytics
