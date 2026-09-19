# ADR-0006: G6 only sabotages one named feature, not every feature generically

Date: 2026-09-19
Status: accepted

## Context

The pipeline's other gates (G0–G5) all check something intrinsic to the candidate: does it parse, does it follow structure, do its symbols exist, does it compile, does it lint, does it pass. None of them can catch a test that is well-formed and passes but never actually observes the thing it claims to verify — for example, a leave-submission test that checks only the success message and never checks that the leave balance changed or the request appears in the list. A generated test surviving every existing gate while proving nothing was a real, named gap in the "Honest limitations" section before this phase.

## Decision

G6 works by deliberately breaking one specific feature at a time via a request header (`X-Sabotage: leave.submit`), read by the application itself, and re-running the already-passing candidate once more expecting it to fail. It is not a generic mutation-testing framework: there is exactly one sabotage-able feature (leave submission silently not persisting), declared in a small table in `gates/runner.ts` mapping a framework-manifest field/method pair to a sabotage id. G6 only runs at all when static analysis shows the candidate actually calls that method — sabotaging leave submission while testing sign-in would prove nothing either way, so it is skipped rather than run pointlessly.

## Reasons

1. **A real negative control beats a generic one that might not fire.** A framework-wide "randomly mutate something" approach (real mutation testing tools like Stryker) would require instrumenting the whole app and deciding which mutants are meaningful — disproportionate for proving the concept on one pipeline. One deliberately-chosen, realistic failure mode (accept-but-silently-drop) is exactly the shape of bug a shallow generated test is most likely to miss, and it is easy to reason about precisely because it is singular.
2. **Relevance checking avoids false signal.** Without checking whether the candidate touches the sabotaged feature, G6 would either always pass trivially (for unrelated tests, proving nothing) or need to sabotage something for every possible feature on every run (expensive, and most of those sabotages don't exist yet). Checking `CodeAnalysis.appRefs` against a small table reuses the exact mechanism G2 already relies on for symbol existence, rather than inventing a new one.
3. **Consistent with the retry story.** G6's failure class, `WEAK_ASSERTION`, feeds the same retry-with-feedback path as every other content gate: the model is told exactly what survived unnoticed and how to fix it (assert on the real effect, not the surface response). It is not a special case bolted on separately.

## Consequences

- Adding a new sabotage-able feature means writing the header-guard in the app, adding one row to the `SABOTAGES` table, and (ideally) a scenario fixture proving it — a deliberate manual step, not something that falls out automatically from writing a new feature.
- G6 says nothing about any feature other than the one it currently covers. A generated test for, say, expense approval could still have the same "checks only the surface response" flaw with no gate to catch it, until that feature gets its own sabotage flag.
- The three existing scenarios that already reach `PENDING_REVIEW` (`happy`, `malformed-then-valid`, `execution-failure`) all happen to touch `leave.submit` with a real outcome assertion already, so turning G6 on did not change their outcome — but it did mean their gate-report length grew from six entries to seven, which the integration test's assertion had to be made to expect rather than hard-code.
