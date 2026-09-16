# Orchestrator (`packages/orchestrator`)

The pipeline. It claims a test case from the TCM, builds context for the model through MCP, asks a provider for a structured test, writes the candidate into the framework, runs it through the gates, retries with structured feedback, persists every attempt, and reports back to the TCM. The model is one dependency behind one interface.

## Run it

```bash
docker compose up -d postgres            # run state lives in the pipeline database
npm run dev -w apps/mock-tcm             # in another terminal, or use --tcm fake
npm run pipeline -- scenarios            # what the replay provider can play
npm run pipeline -- run --scenario happy # TC-014 through every gate, no model needed
npm run pipeline -- run --scenario unknown-method --tcm fake --memory
```

`--tcm fake` uses an in-memory TCM seeded from the mock TCM's YAML. `--memory` keeps run state in memory instead of Postgres. Artefacts for every attempt land in `artifacts/runs/<runId>/`.

| Variable               | Default                                                   |
| ---------------------- | --------------------------------------------------------- |
| `DATABASE_URL`         | `postgres://aiqa:aiqa@localhost:5432/pipeline`            |
| `TCM_URL`              | `http://localhost:4000`                                   |
| `LLM_PROVIDER`         | `replay`, `failing` or `ollama`                           |
| `LLM_SCENARIO`         | scenario name for the replay provider                     |
| `LLM_MODEL`            | `qwen2.5-coder:7b` (any Ollama model that supports tools) |
| `OLLAMA_URL`           | `http://localhost:11434`                                  |
| `LLM_TIMEOUT_MS`       | `600000`, ten minutes, because CPU inference is slow      |
| `NUM_CTX`              | `12288`, the context window requested from the model      |
| `AGENT_MODE`           | `curated` or `agentic`                                    |
| `MAX_TOOL_CALLS`       | `6` per attempt in agentic mode                           |
| `MAX_ATTEMPTS`         | `3`                                                       |
| `MAX_DEFERRALS`        | `3`                                                       |
| `CONTEXT_TOKEN_BUDGET` | `6000`                                                    |
| `PROMPT_VERSION`       | `v1` (a folder under `prompts/`)                          |
| `PORT`                 | `5000` for the HTTP API                                   |

## With a real model

```bash
ollama serve                     # if it is not already running
ollama pull qwen2.5-coder:7b     # once, about 4.7 GB
npm run pipeline -- run --provider ollama --case TC-014 --tcm fake --memory
npm run pipeline -- run --provider ollama --mode agentic --case TC-014 --tcm fake --memory
npm run pipeline -- bench --provider ollama --out docs/results.md
```

**Curated** mode is what phase 5 built: the orchestrator decides everything the model sees and asks for constrained JSON output. **Agentic** mode gives the model the seven framework-context MCP tools on top of the same context; it may look things up before answering, every call is logged on the attempt, and the final answer goes through the same gates. The mode actually used is recorded on each attempt, because a provider that cannot call tools falls back to curated.

The health check confirms Ollama is up and the model is pulled; if not, the run is deferred rather than failed, and the message says which command to run.

## How a run goes

1. **Start** is idempotent: one run per test case id and version, enforced by a unique index. A second `POST /runs` for the same identity returns the existing run.
2. **Claim** the case in the TCM. A conflict (not ready, wrong version) ends the run as Needs attention with the reason.
3. **Health-check the provider.** If the model is unreachable the run is Deferred without spending an attempt, up to `MAX_DEFERRALS`.
4. **Build context** once, through the framework-context MCP server: conventions, fixtures, page objects ranked by feature and keyword overlap, one or two same-feature examples, inside a token budget. The context receipt records what went in and what was dropped.
5. **Attempt loop.** Ask the provider, run G0 on the reply, write the candidate into `tests/generated/`, run G1 to G5, persist the attempt, write artefacts. On success: Pending review, the TCM is told where the candidate is. On failure: the candidate is removed from the framework (the artefact copy stays), the retry policy decides, and the feedback is appended to the conversation.
6. **Stop** after `MAX_ATTEMPTS` or on a flaky result: Needs attention, with the best attempt recorded.

## Gates

| Gate | What it checks                                                                                                            | Failure class                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| G0   | The reply is one JSON object matching the contract, for this test case                                                    | `MALFORMED_RESPONSE`           |
| G1   | Imports only from the fixtures module, tagged with the right id, no raw `page`, no absolute URLs, nothing dangerous       | `POLICY_VIOLATION`             |
| G2   | Every page object, method, locator, fixture, user, seeded id and helper exists; arity is right; errors carry did-you-mean | `UNKNOWN_SYMBOL`               |
| G3   | `tsc` on the framework with the candidate in place                                                                        | `TYPE_ERROR`                   |
| G4   | ESLint with the framework's five convention rules                                                                         | `LINT_ERROR`                   |
| G5   | Playwright, twice, no retries, against the HR Portal                                                                      | `EXECUTION_FAILURE` or `FLAKY` |

Cheapest first. Each gate's errors are written to be pasted into the retry prompt. G2 also compares the model's claimed methods with the ones the code really uses and stores the accuracy.

## Retry policy

| Failure                               | Action                              | Uses an attempt |
| ------------------------------------- | ----------------------------------- | --------------- |
| Malformed response                    | one short repair prompt             | yes             |
| Policy, symbol, type, lint, execution | regenerate with structured feedback | yes             |
| Flaky                                 | stop                                | yes             |
| Model unavailable or timeout          | defer, backoff 1, 5, 15 minutes     | no              |

## Scenarios

`scenarios/<name>/` holds a `scenario.json` with the expected outcome and one readable `candidate-N.ts` per attempt. `node scenarios/build.mjs` turns them into the `response-N.txt` a model would emit. The integration test runs every scenario through the real pipeline and asserts the final run status, attempt count, failure classes and TCM status.

| Scenario             | Caught by | Ends as                            |
| -------------------- | --------- | ---------------------------------- |
| happy                | nothing   | Pending review                     |
| malformed-then-valid | G0        | Pending review after repair        |
| structure-violation  | G1        | Pending review after retry         |
| wrong-tag            | G1        | Pending review after retry         |
| unknown-method       | G2        | Pending review after retry         |
| unknown-locator      | G2        | Pending review after retry         |
| type-error           | G3        | Pending review after retry         |
| trivial-assertion    | G4        | Pending review after retry         |
| execution-failure    | G5        | Pending review after retry         |
| flaky                | G5        | Needs attention, no retry          |
| exhausted            | G2 x3     | Needs attention, best attempt kept |
| llm-unavailable      | provider  | Deferred, no attempt spent         |

Duplicate events are covered by the unit tests: a second start for the same case and version returns the existing run.

## Tests

- `npm test`: retry policy, output contract, gates G0 to G2 against the scenario fixtures, and the pipeline's control flow with scripted gates (idempotency, repair, retry feedback, exhaustion, flaky, deferral, claim conflict).
- `npm run test:integration`: the scenario matrix through the real gates against Postgres and the HR Portal.

## HTTP API

`npm run dev -w packages/orchestrator` starts it on port 5000. `POST /runs {"test_case_id":"TC-014"}` returns 202 with the run, or 200 with the existing one. Runs execute one at a time in the background because the gates share one application and one browser. `GET /runs/:id` returns the run with its attempts.
