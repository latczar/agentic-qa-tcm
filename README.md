# ai-qa-pipeline

Local, free, AI-assisted Playwright test generation with deterministic validation and human review.

A TestRail-style mock TCM holds manual test cases. When one is marked Ready for Automation, n8n dispatches it to a TypeScript orchestrator. The orchestrator gathers framework context through an MCP server, asks a local model (Ollama) for a structured test, runs the result through validation gates (response schema, framework structure, symbol existence, TypeScript, ESLint, Playwright execution), retries with feedback when a gate fails, and parks the candidate for human approval before the TCM is updated.

The model is one component. Everything else is ordinary, testable software. The design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the decisions in [docs/adr](docs/adr).

## Status

Phase 0 of 10: repository skeleton, Compose stack with Postgres and n8n, CI. The roadmap is in the architecture document.

## Prerequisites

- Node 24 (see `.nvmrc`)
- Docker Desktop with WSL 2 on Windows, or Docker Engine with Compose v2 elsewhere

## Quickstart

```bash
npm ci
docker compose config -q
docker compose up -d
docker compose ps
```

- n8n: http://localhost:5678
- Postgres: `localhost:5432`, user and password `aiqa`, databases `aiqa`, `tcm`, `pipeline`

## Checks

```bash
npm run lint
npm run typecheck
npm run format:check
```

## Layout

```
apps/         mock systems: hr-portal (system under test), mock-tcm (TestRail stand-in)
packages/     shared types, e2e-framework, framework-manifest, mcp-server, orchestrator
docker/       container init scripts
docs/         architecture, decision records
n8n/          exported workflows (from phase 8)
scenarios/    deterministic failure-scenario fixtures (from phase 5)
prompts/      versioned prompt templates (from phase 5)
```
