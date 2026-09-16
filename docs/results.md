# Generation results

Recorded 2026-09-16 on the development machine. Provider: Ollama, model `qwen2.5-coder:7b`
(free, local, GPU-accelerated), prompt version v2.

## Curated mode

The orchestrator builds a fixed context (conventions, fixtures, ranked page objects, one worked
example) and sends it in a single request per attempt.

| Case   | Result          | Attempts | Failed gates | Tool calls | Tokens (in+out) | Time |
| ------ | --------------- | -------- | ------------ | ---------- | --------------- | ---- |
| TC-005 | NEEDS_ATTENTION | 3        | G1, G1, G2   | 0          | 12096           | 14s  |
| TC-014 | NEEDS_ATTENTION | 3        | G3, G3, G4   | 0          | 13956           | 33s  |
| TC-034 | NEEDS_ATTENTION | 3        | G1, G1, G1   | 0          | 16674           | 25s  |
| TC-045 | NEEDS_ATTENTION | 3        | G1, G2, G4   | 0          | 15236           | 23s  |

0 of 4 cases reached review. 95s total.

## Agentic mode

Same test cases, but the model can call the MCP tools itself (search symbols, fetch a page
object, fetch another example) instead of receiving a fixed bundle up front.

| Case   | Result          | Attempts | Failed gates | Tool calls | Tokens (in+out) | Time |
| ------ | --------------- | -------- | ------------ | ---------- | --------------- | ---- |
| TC-005 | NEEDS_ATTENTION | 3        | G1, G1, G1   | 0          | 14808           | 25s  |
| TC-014 | NEEDS_ATTENTION | 3        | G3, G3, G3   | 0          | 16286           | 40s  |
| TC-034 | NEEDS_ATTENTION | 3        | G2, G2, G2   | 0          | 18099           | 25s  |
| TC-045 | NEEDS_ATTENTION | 3        | G3, G2, G2   | 0          | 18058           | 36s  |

0 of 4 cases reached review, 126s total. The model made 0 tool calls in every attempt — with
this model and these prompts, giving it tool access bought nothing over the curated context; it
just used more tokens and time to reach a similar, still-failing result.

## What this shows

Zero of eight runs reached `PENDING_REVIEW`. That is a real, honest result for a free 7B model
run locally, not a bug in the pipeline — every single failure was caught by a specific, correct
gate, with a specific, correct reason:

- **G1 (structural policy)**: the model repeatedly split one manual test case into several
  `test()` blocks with invented sub-tags (`@TC-005-01`), instead of the one tagged test the
  policy requires.
- **G2 (symbol existence)**: the model invented plausible-sounding methods that do not exist
  (`app.leaveForm.expectBalance`), or attached a real method name to the wrong page object.
- **G3/G4 (TypeScript/ESLint)**: unused imports, and hand-rolled date arithmetic instead of using
  the supplied date helpers.

None of these reached a human as a passing test, and none of them silently became a checked-in
file — which is the actual point of having gates rather than trusting the model's own opinion of
its work.

Two genuine pipeline bugs were found and fixed while diagnosing these runs, both now covered by
the behaviour above rather than by unit tests alone:

1. The "did you mean" hint in G2 only searched for suggestions on the _same_ page object as the
   mistake, so it could never point at the real fix when the model had the right method name on
   the wrong object. Broadened to search the whole manifest
   ([g2-symbols.ts](../packages/orchestrator/src/gates/g2-symbols.ts)).
2. The worked example shown to the model always used its own file's import path
   (`tests/e2e/<feature>/`), but generated candidates are always written to the shallower
   `tests/generated/`. The model was correctly copying an import path that could never resolve.
   The example text is now rewritten to the path the candidate will actually need
   ([builder.ts](../packages/orchestrator/src/context/builder.ts)).

Retrying with a small local model does not reliably self-correct a structural mistake (all three
attempts for TC-014 were byte-for-byte identical despite a corrected, on-target hint on the
second attempt) — a fixed-attempt cap and a hard stop at `NEEDS_ATTENTION` is doing real work
here, not just guarding against an edge case.
