# ADR-0004: A replay provider is the primary way the pipeline is tested

Date: 2026-09-16
Status: accepted

## Context

Every part of the pipeline downstream of "ask the model" — gates, retry policy, TCM reporting, idempotency, human review — needs to be tested against specific model behaviours: a perfect answer, a truncated one, an invented method name, a flaky test, a dead model server. Testing these against a real local LLM would make every test run non-deterministic, slow (seconds per call even with a GPU), and dependent on a model actually being installed.

## Decision

`LlmProvider` is an interface with three implementations: `OllamaProvider` (real), `FailingProvider` (always errors, for the "model unavailable" and timeout scenarios), and `ReplayProvider` (serves a canned response from a `scenarios/<name>/` fixture). The 12-scenario failure matrix and the CLI's `bench`/`run --scenario` commands are built entirely on the replay provider. CI never talks to a real model except in the manual, non-gating `bench-ollama` job.

## Reasons

1. **Speed and determinism.** The full 12-scenario matrix runs against real Postgres, real `tsc`/ESLint, and real Playwright execution in about two minutes, with the same outcome every run. A real model would make this slow and occasionally flaky for reasons that have nothing to do with the pipeline.
2. **Coverage of failures that are hard to provoke on demand.** Getting a real 7B model to reliably produce a specific failure (truncated JSON, a flaky assertion, an invented locator) on command is not practical. A fixture makes every failure class a one-line, reviewable test case.
3. **The interface is the point.** Because gates, retry policy and reporting only depend on `LlmProvider`, swapping in Ollama in phase 6 required no changes to any of that code — only a new class implementing the same three methods. The replay provider is not a testing shortcut bolted on afterwards; it is what let phases 5 through 9 be built and fully proven before a real model was ever involved.

## Consequences

- Scenario fixtures can drift from what a real model actually does if nobody keeps writing new ones as real-model failures are discovered. In practice this already happened usefully in reverse: real-model runs in phase 6 found two genuine pipeline bugs (see `docs/results.md`) that no existing fixture had covered, which is a sign to add fixtures for them, not a flaw in the approach.
- A change that only breaks against real models (a prompt wording issue, a token-budget miscalculation) will pass the whole CI suite and only surface in the manual `bench-ollama` job or a real local run. This is accepted: it is the same tradeoff any mocked-dependency test suite makes, and the manual job exists specifically to catch it occasionally.
