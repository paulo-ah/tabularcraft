# Changelog

All notable changes to this project will be documented in this file.

## [0.1.5] - 2026-03-18

### Added
- Column creation workflows from the model tree:
  - Create New Data Column on Columns node
  - Create New Calculated Column on Columns node
- Measure creation workflow from the model tree:
  - Create New Measure on Measures node
- New creation webviews:
  - Data/Calculated column editor
  - Measure creator
- Deletion support for columns and measures:
  - Right-click delete in navigation tree
  - Delete button in Properties view
- New sidecar request model for column creation.

### Changed
- Sidecar endpoint surface extended with:
  - Column creation endpoints
  - Generic model delete endpoint
- Sidecar service layer now supports creating and deleting columns/measures.
- Extension-side API client expanded for create/delete operations.
- Sidecar path resolution now prefers workspace Debug/Release builds before packaged sidecar in development, preventing stale endpoint mismatches.
- Improved API error reporting to include operation and HTTP status when sidecar returns empty error body.

### Fixed
- Properties-view delete action reliability by moving confirmation to VS Code host (instead of webview `confirm`).
- Empty delete error message issue (`Tabularcraft delete failed:` with no details).
