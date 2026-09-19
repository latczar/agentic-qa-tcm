# Changelog

One entry per phase tag. Each phase ends with something runnable and tested — see `docs/ARCHITECTURE.md` §14 for the full roadmap and `docs/talking-points.md` for the reasoning behind each decision.

## phase-11 — 2026-09-19

Closed a real gap found after phase 10 shipped: a `DEFERRED` run (model briefly unreachable) had no resumption path at all — not automatic, not even manual, since `POST /runs` is idempotent on `(testCaseId, version)` and never re-executes an existing run. Added `POST /runs/:id/retry`, a thin endpoint that calls the same `executeRun()` the pipeline already uses, guarded to only accept a `DEFERRED` run. A third n8n workflow, `deferred-watcher`, polls `/runs` every 5 minutes, finds anything still `DEFERRED` after 10 minutes, retries it, and emails a notice. Verified live against real Postgres and real n8n (temporarily dropped to a 10-second schedule to prove it without waiting): it found four genuinely stale `DEFERRED` runs left over from earlier manual testing, retried all four, and both the watcher's own email and the pipeline's normal `run.deferred` event fired correctly. Also corrected a README inaccuracy found while scoping the next item (G6): the "HR Portal already has a sabotage header wired in" claim was never actually true — grepped the whole app, no matches. Fixed the limitations section to say so plainly.

Also discovered mid-session: this machine has two separate, unsynced Docker engines (Docker Desktop and a native WSL2 install), and Docker Desktop — believed permanently broken per an earlier gotcha — has actually been the one serving this project for over a day. Consolidated onto Docker Desktop and removed the redundant WSL-native containers/volumes; no code or compose changes needed since Docker Desktop resolves `host.docker.internal` correctly on its own.

## phase-10 — 2026-09-16

Polish. README rewritten from its phase-0 skeleton state: the pitch, an explicit "why this is not prompt-to-code" section, a quickstart that runs the whole loop without a model install, a 12-row failure gallery verified against the real scenario fixtures (one outcome was wrong in the aspirational version of this table and is corrected here), the honest phase 6 results, and a section that says outright what's missing rather than leaving it implied. Four ADRs added for the decisions a reviewer would question (n8n as glue not brain, no embeddings, replay provider, framework manifest as source of truth), plus a CHANGELOG. The demo GIF was recorded live against the real running stack, not staged — which is also how a real gap in `.gitignore` was found and fixed: `tests/generated/` candidates were never actually ignored, so a stray one from earlier manual testing had been sitting there ready to be swept into the next `git add -A`.

## phase-9 — 2026-09-16

CI hardening. Verified against a real GitHub Actions run rather than just the YAML: `checks`, `framework-e2e` and `integration` all green on first push, a manual (`workflow_dispatch`-only) Ollama bench job that never gates a merge, artefacts confirmed downloadable from the run.

## phase-8 — 2026-09-16

n8n scheduling and notifications. Both workflows and the Mailpit SMTP credential committed as plain JSON, auto-imported and auto-published on `docker compose up`. Orchestrator gained a best-effort event emitter. Verified live: flipping a case to `READY_FOR_AUTOMATION` produces a run with no manual steps, and a run's outcome produces a real SMTP email in Mailpit.

## phase-7 — 2026-09-16

Human review UI and API. Approve promotes a candidate into the real test suite and reports `AUTOMATED`; reject reports `NEEDS_ATTENTION` and deliberately keeps the candidate for a human to finish. An atomic conditional update (mirroring the TCM's own claim) guards against a double-decision. Verified against real Postgres and the real mock TCM, not just unit tests.

## phase-6 — 2026-09-16

Real local model (Ollama, `qwen2.5-coder:7b`) wired in behind the same provider interface as the replay provider, plus an agentic mode where the model calls the MCP tools itself. Benchmarked honestly: 0 of 8 runs (curated and agentic, across the 4 ready cases) reached review — a genuine result for a free 7B model, not a pipeline defect, since every attempt was stopped by a specific, correct gate. Two real pipeline bugs were found and fixed while diagnosing why.

## phase-5 — 2026-09-16

The orchestrator core: run state machine in Postgres, context builder, structured output contract, gates G0–G5, retry policy, artefact store, and a replay provider. The 12-scenario failure matrix (`scenarios/`) was built and proven entirely against replayed responses before any real model was involved — this is the phase the rest of the AI story sits on top of.

## phase-4 — 2026-09-15

Framework manifest (ts-morph extractor, drift-checked in CI) and the MCP server exposing it as seven read-only tools.

## phase-3 — 2026-09-15

Mock TCM: TestRail-shaped API, atomic claim, versioning, a minimal UI, seeded manual test cases.

## phase-2 — 2026-09-15

The Playwright framework the AI has to fit into: page objects, fixtures, custom ESLint rules encoding project conventions, exemplar tests. Built and tested before any AI work.

## phase-1 — 2026-09-15

HR Portal, the mock business application generated tests run against: server-rendered, deterministic seed, reset endpoint, `data-testid` everywhere.

## phase-0 — 2026-09-15

Repository skeleton: npm workspaces, TypeScript/ESLint/Prettier, Docker Compose with Postgres and n8n, CI lint and typecheck.
