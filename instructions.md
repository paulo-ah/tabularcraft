
# GitHub Copilot Instructions — AAS VS Code Extension

This document provides **high-level guidance and development rules** for GitHub Copilot when contributing to this repository.

The goal is to build and evolve a **cross-platform VS Code extension** that allows users to connect to **Azure Analysis Services (AAS)** and manage **tabular models** using **TOM / XMLA**, similar in spirit to **Tabular Editor**, but natively inside VS Code.

---

## 1. Scope & Product Vision

### In Scope (current)
- Azure Analysis Services (AAS) **only**
- VS Code extension (TypeScript)
- Cross-platform support (macOS + Windows)
- .NET **sidecar** process (NET 8+) hosting:
  - Tabular Object Model (TOM / AMO)
  - ADOMD.NET (for queries)
- Features:
  - Connect to AAS via XMLA
  - Browse databases, tables, partitions
  - Full processing:
    - Database
    - Table
    - Partition
  - **Simple Measure Editor** (DAX only, no advanced IntelliSense yet)
  - **TMSL Console** with reusable templates
  - Incremental processing via **ProcessAdd (TMSL)**

### Explicitly Out of Scope (for now)
- Power BI / Fabric XMLA
- Advanced DAX IntelliSense or semantic validation
- Visual relationship diagrams
- Background jobs or async long-running orchestration
- Multidimensional (MD) models

---

## 2. Architectural Principles

### Extension Architecture
- **VS Code extension (TypeScript)** is UI/orchestration only
- **All Analysis Services logic lives in the .NET sidecar**
- Communication is via **local HTTP (localhost)** using JSON
- The extension must never embed or reimplement TOM logic

### Sidecar Architecture
- .NET 8 Minimal API
- Uses **NuGet packages only**:
  - `Microsoft.AnalysisServices`
  - `Microsoft.AnalysisServices.Tabular`
  - `Microsoft.AnalysisServices.AdomdClient`
- No MSI installers
- Stateless endpoints, single active connection per session

---

## 3. Authentication & Connectivity

Supported authentication modes:
- ✅ Interactive Entra ID (device / interactive login)
- ✅ Username + Password (only if tenant policy allows)
- ✅ Service Principal (appId / tenantId / clientSecret)

Rules:
- Credentials are **never stored**
- The sidecar relies on AMO/ADOMD for authentication handling
- The VS Code extension only passes connection strings

---

## 4. Coding Guidelines for Copilot

### General
- Prefer **clarity over cleverness**
- Keep functions small and explicit
- Add comments where TOM or XMLA behavior may be non-obvious
- Do not introduce background threads, schedulers, or daemons

### TypeScript (Extension)
- Use VS Code APIs idiomatically
- Keep UI logic separate from API clients
- Webviews should be:
  - Minimal HTML
  - No frameworks (React, Vue, etc.)
  - Plain JS + postMessage

### C# (Sidecar)
- Use TOM first, TMSL second
- Always follow:
  - `RequestRefresh(...)`
  - `Model.SaveChanges()`
- Validate inputs early and return meaningful HTTP errors
- Avoid static mutable state beyond the active `Server` connection

---

## 5. Feature Implementation Rules

### Measures
- Measures are created/updated via TOM:
  - Name
  - Expression (DAX)
  - Optional FormatString
- No advanced validation required (server errors are acceptable)

### Processing
- Use TOM for:
  - Full database refresh
  - Full table refresh
  - Full partition refresh
- Use TMSL for:
  - ProcessAdd
  - Advanced or scripted operations

### TMSL Console
- Accept **raw JSON**
- Execute via XMLA `Execute`
- Provide starter templates (do not auto-generate complex scripts)

---

## 6. Incremental Refresh (ProcessAdd)

- Implemented via **TMSL only**
- Copilot should:
  - Not attempt to auto-detect incremental logic
  - Not abstract ProcessAdd into custom APIs
- Responsibility for correctness (duplicates, filters) remains with the user

---

## 7. Repository Conventions

- No secrets committed
- `.gitignore` must exclude:
  - `node_modules`
  - `out/`
  - `bin/`, `obj/`
  - `.env`
- Keep the repo **commit-ready at all times**
- Prefer additive changes over refactors unless requested

---

## 8. Future Extensions (Do Not Implement Yet)

Copilot may prepare for (but not implement):
- Power BI / Fabric XMLA support
- DAX query editor
- Partition designer UI
- Best Practice Analyzer
- CI/CD deployment workflows

---

## 9. Guiding Principle

> **This tool should feel like Tabular Editor logic with VS Code ergonomics.**  
> Powerful, scriptable, explicit — not magical.

When in doubt:
- Favor **TOM/TMSL parity** with existing enterprise tooling
- Favor **predictability** over abstraction
- Favor **developer control** over automation
``
