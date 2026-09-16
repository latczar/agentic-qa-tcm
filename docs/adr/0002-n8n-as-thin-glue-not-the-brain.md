# ADR-0002: n8n is thin scheduling glue, not the agent

Date: 2026-09-16
Status: accepted

## Context

n8n ships AI nodes (LLM chat, agent, tool-calling) that could run the whole generate-validate-retry loop as a single visual workflow: poll the TCM, call the model, run gates as HTTP requests, branch on the result. That would demo well and needs no TypeScript orchestrator at all.

The alternative is what this project actually built: n8n only polls and dispatches (`POST /runs`), and a webhook it receives at the end routes to notifications. All context building, generation, validation and retry logic lives in the orchestrator.

## Decision

n8n owns exactly two things: noticing a case is ready, and telling a human it happened. Everything about _how_ a test gets generated and judged is ordinary TypeScript, tested the ordinary way.

## Reasons

1. **Testability.** The 12-scenario failure matrix (`scenarios/`) runs as fast, deterministic vitest tests against a replay provider — no LLM, no browser automation of n8n's own UI required to prove the retry policy or a gate works. An n8n-native agent loop's logic lives inside node parameter expressions, which cannot be unit tested the same way.
2. **Reviewability.** A hiring manager reading this repo can read `run-pipeline.ts` top to bottom. A workflow's real logic lives in a JSON blob of node parameters, which does not review well in a diff or a GitHub file view.
3. **CI.** The whole pipeline runs in GitHub Actions with no n8n instance present at all, because n8n is not on the path from "test case" to "generated test." Phase 8 added n8n on top of an already-working, already-tested system.
4. **The gates need real processes.** `tsc`, `eslint`, and `playwright test` are child processes with structured output to parse. Driving three CLIs and interpreting their output from inside n8n's HTTP/Code nodes would just reinvent the orchestrator's gate runner, worse.

## Consequences

- Two systems to run instead of one, with a real (if simple) integration surface between them (`POST /runs`, one webhook).
- n8n's own visual "the AI decided this" demo appeal is smaller — the interesting engineering is in the orchestrator, and that's the point being made.
- If a future requirement needed a _different_ scheduler (a cron job, a queue, a different TCM's own webhooks), only the thin dispatch/notify layer changes. The orchestrator's HTTP API does not know or care that n8n exists.
