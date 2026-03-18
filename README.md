# Tabularcraft

Tabularcraft is a VS Code extension for managing Azure Analysis Services tabular models with a native explorer, editing tools, and processing actions.

## Current Functionality

- Connection profiles in the explorer (add, connect, edit, delete)
- Authentication modes:
	- Interactive (Entra ID)
	- Username/password
	- Service principal
- Model explorer with A-Z sorting and folder-aware navigation
- Object coverage in tree:
	- Databases, tables, columns, measures, hierarchies, levels, partitions
	- Roles, perspectives, relationships, data sources, cultures
- Rename support from tree (double-click, context menu, F2)
- Properties editor with validation and enum dropdowns
- Partition query editor (SQL/M sources, read-only for calculated partitions)
- Processing commands:
	- Database full
	- Table full
	- Partition full
	- ProcessAdd via TMSL
- Measure editor
- TMSL console

## Repository Structure

This repository follows a standard split architecture for VS Code extensions with external runtime dependencies:

```
Tabularcraft/
	extension/   # VS Code extension (TypeScript): UI, commands, tree, webviews
	sidecar/     # .NET sidecar (Minimal API + TOM/AMO) for model operations
```

Design principles:

- Extension layer is orchestration/UI only.
- TOM/XMLA operations stay in sidecar.
- Communication is localhost HTTP/JSON.
- VSIX packaging bundles sidecar artifacts for first-run reliability.

## Prerequisites

- VS Code 1.85+
- Node.js 20+
- .NET SDK 8+

## Install from VSIX (Manual)

1. Build and package:

```bash
cd extension
npm install
npx @vscode/vsce package
```

2. Install the produced file:

- VS Code UI: Extensions view -> ... -> Install from VSIX...
- Or CLI:

```bash
code --install-extension extension/tabularcraft-<version>.vsix
```

3. Reload VS Code.

4. Open the Tabularcraft view and use Add Connection.

## Development

Extension build:

```bash
cd extension
npm run compile
```

Extension watch mode:

```bash
cd extension
npm run watch
```

Sidecar build:

```bash
cd sidecar
dotnet build
```

Run extension in dev host:

- Open workspace in VS Code
- Press F5

## Packaging Notes

- `npm run vscode:prepublish` builds and bundles the sidecar automatically.
- Sidecar startup supports executable launch and `dotnet <dll>` fallback.

## Changelog

- Full release history: [CHANGELOG.md](CHANGELOG.md)
- Latest release: `0.1.6`
	- Improved interactive Azure auth by attempting silent token acquisition before prompting in browser
	- Fixed foldered column/measure name handling to preserve raw object names for operations
	- Resolved object lookup reliability issues in delete/edit flows for foldered items

## License

Dual-licensed:

- Open source license: AGPL-3.0-or-later
- Commercial license: required for proprietary/commercial distribution outside AGPL obligations

See [extension/LICENSE](extension/LICENSE) and [extension/COMMERCIAL-LICENSE.md](extension/COMMERCIAL-LICENSE.md).
