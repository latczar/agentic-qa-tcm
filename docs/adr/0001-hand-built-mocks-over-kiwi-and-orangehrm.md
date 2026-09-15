# ADR-0001: Hand-built mocks instead of Kiwi TCMS and OrangeHRM

Date: 2026-09-15
Status: accepted

## Context

The pipeline needs a test case management tool (TCM) to poll and update, and a business application for generated tests to run against. Both could be real open-source products run locally: Kiwi TCMS (GPL-2.0, Docker image, JSON-RPC API with `is_automated`, `script`, properties and history) and OrangeHRM 5.x open source (login, employees, leave with supervisor approval, expense claims since 5.5). Horilla HRMS was also considered.

Project constraints: fully local and free, no infrastructure beyond what is needed, every component explainable in an interview, and deterministic checks around AI-generated tests.

## Decision

Build two small Express applications instead:

- `apps/mock-tcm`: a TestRail-shaped REST API and minimal UI, backed by the `tcm` database in Postgres.
- `apps/hr-portal`: a server-rendered employee portal with a deterministic in-memory seed, a reset endpoint, `data-testid` attributes and a sabotage flag for negative-control testing.

## Reasons

1. **Determinism.** The validation gates only mean something if a failing generated test failed because of the test. A purpose-built app with a reset endpoint gives a known state on every run. OrangeHRM needs a database restore between runs and unique data per test.
2. **Setup cost.** Kiwi's initial setup is an interactive command and OrangeHRM installs through a web installer. Both must be scripted or snapshotted for CI, and each adds a MariaDB or MySQL instance next to Postgres.
3. **Speed.** Two small Node apps start in under a second in CI. OrangeHRM plus MySQL takes minutes and is heavy to run alongside n8n, Postgres and Ollama on a laptop.
4. **Explainability.** A few hundred lines of Express can be read in full and defended in an interview. A third-party HRMS cannot.
5. **Nothing in the pipeline design depends on the choice.** Real TCM APIs have no compare-and-set either, so idempotency lives in the orchestrator regardless. The TCM client sits behind an interface, so a Kiwi or TestRail adapter can be added later without touching the pipeline.

## Consequences

- Less realism in the system under test. Mitigated by realistic manual test cases and a framework built the way a real team would build one.
- More code to own: roughly 400 lines for the TCM and 800 for the portal, plus their tests.
- Revisit if the portfolio goal shifts to "integrates with a real TCM". Kiwi TCMS is the first candidate, behind the existing TCM client interface.
