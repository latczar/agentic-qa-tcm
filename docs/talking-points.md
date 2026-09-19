# Talking points

Short answers to the questions an interviewer would ask about this project, added phase by phase. The aim is to be able to explain every component and every "why" without notes.

## The five-line version

- **n8n** decides _when_ work happens and carries events between systems. Stateless glue.
- **Orchestrator** decides _what_ happens: context, generation, gates, retries, review. Owns all run state.
- **Postgres** is the memory: one run per test case version, every attempt and gate result, every review decision.
- **MCP** is the controlled window the model looks through: read-only, typed, bounded tools over the framework.
- **Playwright, tsc and ESLint** are the judges. The model never gets a vote on whether its own test is accepted.

## Phase 0: skeleton and Compose stack

**Why is n8n on SQLite rather than the project's Postgres?**
Because n8n is scheduling glue, not the system of record. Giving it a private store keeps its state and the pipeline's state from being confused, and it needs zero configuration. Moving it to Postgres later is six environment variables.

**Why is port 5432 published to the host?**
So the orchestrator and Playwright can run on the developer's machine during development while only the infrastructure runs in Docker. That is the fastest feedback loop, especially on Windows.

**What does the Postgres init script do, and what is the gotcha?**
It creates the `tcm` and `pipeline` databases. It only runs when the data volume is empty, so editing it and restarting does nothing. `docker compose down -v` is how you get it to run again.

**Why validate the Compose file in CI?**
Because `docker compose config` is a deterministic, one-second check that catches a broken stack before anyone tries to start it. It is the same principle as the pipeline's gates: cheapest check first.

**Why did the n8n log matter?**
Its startup log listed deprecated settings we had used. Reading logs after an image update is a habit, not a chore. Two settings were fixed within minutes of first start.

**Why a `.gitattributes` file?**
Windows git converted line endings to CRLF on commit. Prettier, shell scripts and container builds expect LF. Pinning `eol=lf` in the repository settles it for every contributor rather than relying on each machine's configuration.

## Phase 1: HR Portal, the system under test

**Why build the application instead of using OrangeHRM?**
Determinism and control. The validation gates only mean something if a failing generated test failed because of the test. A purpose-built app gives a reset endpoint, stable test ids, a fixed seed and sub-second start-up. OrangeHRM would have added a MySQL instance, a web installer to script, fragile locators and minutes of start-up in CI. The decision record is ADR-0001.

**Why server-rendered Express and EJS rather than a React front end?**
Fewer moving parts and nothing to build. The application is a test target, not a product. A single-page app would add a bundler and a second framework to explain, and would make the pipeline's execution gate slower for no gain.

**Why is browser-side validation switched off?**
So every server-side error message can be reached and asserted by a test. With `required` attributes on, the browser blocks the submission and the test never sees the application's own message.

**Why store money in pence?**
Floating point cannot represent 0.10 exactly. Storing whole pence and only formatting at the edge means totals are always right. The unit test that proves it is one line.

**Why do pending leave requests count against the balance?**
Because they reserve the days. If they did not, an employee could submit three overlapping requests for the same fortnight and the manager would approve the first without knowing the others exist. It is also a good example of a rule a manual test case will describe and a generated test will need to respect.

**Why are passwords in plain text?**
Because they are synthetic accounts in a local test double that never holds real data, and hashing would add a dependency and slow every login in every test for no benefit. The README says so in bold. In a product they would be hashed.

**Why are new record ids deterministic?**
After a reset, the first leave request created is always `lr-101`. That lets a generated test target the exact record it made without parsing the page, which removes a whole class of flaky selectors.

**How does the reset endpoint stay out of production?**
It is only mounted when test mode is on, and test mode defaults to off when `NODE_ENV=production`. The health endpoint reports which mode is active so a test can refuse to run against the wrong environment.

## Phase 2: Playwright framework

**Why build page objects when Playwright's locators are already readable?**
Because the framework, not each test, should be the one place that knows how the application is built. When a test id changes, one line changes. It also gives the AI a vocabulary: the model composes calls to `app.leave.submitRequest()` rather than inventing selectors, and the manifest in phase 4 is extracted from exactly these classes.

**Why is `workers: 1`?**
The application holds shared in-memory state and every test resets it. Two workers would reset each other mid-test. One app instance per worker would fix that, but it is complexity the project does not need at this size, and the whole suite runs in about fifteen seconds.

**Why `retries: 0`?**
A flaky test is a finding. Retrying hides it. The pipeline later runs generated tests twice on purpose to catch flakiness, and the handwritten suite holds itself to the same standard.

**Why does the framework start the application itself?**
Playwright's `webServer` option starts the HR Portal, waits for its health endpoint, and reuses a server you already have running. One command works the same on a laptop and in CI, and there is no separate "start the app first" step to forget.

**Why are the conventions lint rules rather than a document?**
A document is advice. A lint rule is a gate. The same five rules run over human specs today and over generated specs in phase 5, so "does the generated test follow the framework" becomes a deterministic yes or no with a precise message the model can act on.

**How does `require-state-assertion` know a page object method asserts something?**
By naming convention: assertion helpers are named `expect*` and contain the real `expect` call. The rule counts either a web-first matcher such as `toHaveText` or a call to an `expect*` method. A test with neither passes whatever the application does, which is the "useless assertion" failure scenario from the brief.

**Why relative dates in tests?**
The application refuses annual leave in the past. A test that hard-codes October 2026 breaks in November 2026. `mondayWeeksAhead(4)` keeps the test valid indefinitely and always lands on a working week.

**Why two Playwright projects?**
`e2e` is the handwritten suite that CI runs. `candidates` points at `tests/generated`, where AI output waits for review. Separating them means a bad generated test can never fail the main build or sneak into it unreviewed.

**What did the negative check show?**
A deliberately bad spec, raw locators, an absolute URL, `waitForTimeout`, `expect(true)`, a `toBeTruthy` on the title, and no tag, produced one lint error per violation with a message saying what to do instead. Those messages are what the pipeline will feed back to the model on retry.

## Phase 3: mock TCM

**Why does the TCM need Postgres when the HR Portal got away with memory?**
Because the pipeline's idempotency rests on the claim being one atomic, conditional update. A real database gives that for free and lets an integration test prove it: four concurrent claims, one winner. The HR Portal only needs to be deterministic; the TCM needs to be correct under concurrency.

**Why two actors with separate transition tables?**
Humans decide whether something should be automated; the pipeline reports what happened. Encoding that as data, one table per actor, means the rule is readable, unit-tested, and enforced by the same function in the API and the UI. A pipeline bug can never mark a case Ready, and a human cannot pull a case out from under a running job.

**What does the version mean?**
It is the identity of an automation request. It changes when the content changes and when a human asks for automation. It does not change when the pipeline reports. So a duplicate poll of an unchanged case maps to the same (id, version) and is ignored, while a deliberate retry after a failure is a new (id, version) and runs. That one rule covers both the duplicate-event scenario and the retry scenario.

**What happens when the pipeline sends a stale claim?**
The claim carries the version it read. If the case moved on, the update matches nothing and the caller gets a 409 with the current case in the body, so it can log why and move on rather than guess.

**Why is there a history table?**
Because the review step is human and humans ask "who moved this and when". Every transition writes a row with the actor, from, to, version and note. It also makes the demo readable: the detail page shows seed, claim, pending review, approve, re-request, in order.

**Why YAML for the seed?**
Manual test cases are prose with structure, and people will edit them. YAML reads like the document a tester would write, one file per feature, and the loader validates every case on start so a typo fails fast with the file and index in the message. The first run found one: a colon inside a sentence is a nested mapping to YAML unless the value is quoted.

**Why split unit and integration tests?**
Unit tests for the transition rules and the seed validator run in milliseconds with no database. Integration tests for the repository run against the real Postgres, locally from Docker and in CI from a service container. The split keeps the fast loop fast and still proves the SQL.

## Phase 4: manifest and MCP server

**Why extract a manifest instead of giving the model the source files?**
Three reasons. Size: a 7B model has a small context window and the manifest is a tenth of the source. Precision: signatures, test ids and JSDoc are what a test author needs; import lists and constructors are noise. Agreement: the validators in phase 5 check generated code against the same manifest, so what the model was shown and what it is held to are one artefact.

**Why commit the manifest and check drift in CI?**
Because a reviewer should be able to open one file and see exactly what the model was told, and trust that it matches the code. The check regenerates in memory and diffs. Forget to rebuild after changing a page object and CI fails with a one-line fix.

**Why is the extractor built on the TypeScript compiler rather than regular expressions?**
Because it has to be right, not roughly right. ts-morph gives real types, real inheritance and real JSDoc. Inherited members from BasePage are included and labelled, so the model knows `app.leave.expectSuccess()` exists without being shown BasePage separately.

**How does method kind get inferred?**
From the framework's own conventions: `goto*` is navigation, `expect*` is an assertion, a method returning a Locator is a locator, the rest are actions. The lint rules in phase 2 enforce the same naming, so the convention holds at both ends.

**Why is every MCP tool read-only?**
The model proposes; the pipeline disposes. If a tool could write a file or run a test, the model could act outside the gates. Keeping writes in the orchestrator is what makes the validation story honest.

**Why does `search_symbols` exist when `get_page_object` already lists methods?**
Because models invent names. The single most common failure in the design brief is "method does not exist". A search that maps an invented `submitLeave` to the real `LeaveFormPage.submitRequest` turns that failure into a correction, both when the model calls the tool itself and when the validator builds a retry message.

**How are the tools tested?**
Through the real protocol over an in-memory transport: a client connects, lists tools, calls each one, and checks the responses, including the error path for a typo and the refusal to read outside the framework directory. A separate probe launches the server over stdio exactly as `.mcp.json` does, which is the same way Claude Code launches it.

**Why register the server in `.mcp.json`?**
So the side-by-side demo is one command: open the repo in Claude Code and it has the same framework context the pipeline gives the local model. It also proves the server is a standalone, reusable thing rather than an internal detail.

## Phase 5: the orchestrator

**Why build the whole pipeline before touching a model?**
Because everything except the model is deterministic and testable, and that is most of the system. With a replay provider serving canned responses, every failure path in the brief runs in CI, on every commit, with no GPU and no network. When the real model arrives it drops into an interface that already has two implementations and a scenario matrix waiting for it.

**What is a scenario?**
A folder with the expected outcome and one readable candidate test per attempt. A build step turns each candidate into the exact JSON a model would emit. The integration test runs every scenario through the real gates, Postgres, ESLint, tsc and Chromium, and asserts the final status, the attempt count, the failure classes and what the TCM was told. Twelve scenarios cover every failure in the brief: malformed output, framework violations, invented methods and locators, type errors, useless assertions, execution failures, flakiness, exhaustion, an unavailable model, and duplicate events.

**Why is the context built through MCP when the manifest is right there in memory?**
So the model's context comes through the same seven tools an IDE agent would use. The orchestrator is an MCP client connected in-process over an in-memory transport: same protocol, same tool outputs, no child process. Swapping in the stdio transport is a one-line change and nothing above it moves.

**Why does the model return JSON instead of code?**
A contract. The pipeline can refuse a reply before it ever writes a file, name exactly which field is wrong, and ask for a repair rather than a regeneration. The `usedMethods` field is the model's self-report; gate G2 compares it with the code and stores the accuracy, which is a number worth putting in a README.

**Why gates in that order?**
Cost. Parsing JSON is microseconds. Reading the AST is milliseconds. The compiler is seconds. The browser is tens of seconds. A candidate that fails G1 never costs a browser run, and the message it gets back is more precise than a stack trace would have been.

**What did the first real run of the matrix find?**
Every gate from G0 to G4 caught exactly what its scenario had planted. G5 failed for everything because Playwright's `--project` flag accepts several values and swallowed the file path that followed it. The artefact directory made it a two-minute diagnosis: one gates.json per attempt, one line naming the error. That is the argument for persisting everything.

**Why is a flaky test never retried?**
Regenerating would hide it. A test that passes once and fails once against a deterministic application is telling you something about the test or the application, and a human should look. The pipeline runs every candidate twice for exactly this reason.

**Why does an unavailable model not count as an attempt?**
Because the model was never asked. Attempts measure how many times the model tried and failed; deferrals measure how many times the infrastructure was not there. Mixing them would make a bad night for Ollama look like a bad model.

**What happens to a failed candidate's file?**
It is removed from the framework immediately and kept in the run's artefacts. `tests/generated` only ever holds candidates that passed every gate and are waiting for a human. A failing file can never sneak into the suite.

## Phase 6: the model

**Why did the model arrive last?**
Because by the time it did, every other part of the system was tested and every failure path had a scenario. The Ollama provider is one class behind the same interface the replay provider implements. Nothing in the pipeline changed to accommodate it except a health check that names the fix: "run ollama pull".

**What is the difference between curated and agentic mode?**
In curated mode the orchestrator decides everything the model sees and asks for constrained JSON. In agentic mode the model also gets the seven MCP tools and may look things up before answering. Both run the same gates afterwards; the mode is recorded on every attempt; tool calls are capped and logged. Agentic mode is the more impressive demo. Curated mode is cheaper, more predictable and easier to reproduce, and small models are often better at it. The bench measures rather than assumes.

**Why constrained output, and why does it switch off when tools are on?**
Ollama can force the reply to match a JSON schema, which removes a whole class of malformed responses from small models. But a model forced to emit the answer schema cannot emit a tool call, so while tools are offered the schema is withheld, and it comes back for the final turn once the model stops calling tools.

**Why temperature zero?**
Reproducibility beats creativity here. The same case with the same prompt should produce the same test as often as the hardware allows, so a change in outcome can be traced to a change in prompt, context or framework rather than dice.

**Why a ten-minute timeout?**
Because CPU inference of a 7B model on a laptop can take minutes, and a slow answer should become a deferral, not a crash. A timeout is classed with "model unavailable": the model was never really asked, so no attempt is spent.

**Why does the provider report token counts?**
So the attempt record can say how much context the model actually consumed against the estimate the context builder made. When those two drift apart the four-characters-per-token heuristic is wrong for that model, and the budget should be tuned.

**How was the provider tested without a model?**
Against a fake Ollama HTTP server: health with and without the model pulled, an unreachable server, the request shape (temperature, context size, schema, tools), the reply mapping including tool calls, and a hang becoming a timeout. The agent loop was tested with a scripted model against the real MCP server, so the tool definitions and results are genuine.

**Why two prompt versions?**
Prompt v1 asked for one JSON object with the whole test file escaped inside a string field, constrained with Ollama's JSON-schema mode. Against the real model this produced truncated code — a 7B model can't reliably keep track of escaping a few hundred lines inside a JSON string and also finish the file within a sane token budget. Prompt v2 asks for the file in a plain `ts fence and the metadata in a separate `json fence. Same model, same test case: complete files instead of truncated ones. The response format is declared per prompt version (`prompts/<version>/prompt.json`), so the gates and the agent loop treat it as data, not a hardcoded assumption.

**Did the real model actually produce a passing test?**
Not on the four `READY_FOR_AUTOMATION` cases, in either curated or agentic mode — see [docs/results.md](results.md) for the full run. That is a genuine, reportable result for a free local 7B model, not a pipeline failure: every attempt was stopped by a specific, correct gate (wrong test structure, an invented method, an unused import) and every run correctly reached `NEEDS_ATTENTION` rather than shipping something wrong. Two real bugs turned up while diagnosing this, both fixed and worth describing in an interview:

1. The G2 "did you mean" hint only searched the same page object as the mistake, so when the model had the right method name on the wrong object it could never be told the actual fix.
2. The worked example handed to the model used its own file's import depth, which didn't match where generated candidates are actually written — the model was faithfully copying a path that could never resolve.
   Neither was found by reading code; both were found by reading what a real model actually did and refusing to shrug at "the retry didn't work".

**What did retrying actually buy you?**
Less than the plan hoped, and that is itself worth saying out loud. For TC-014, all three attempts produced byte-for-byte identical code, even on the attempt after the "did you mean" hint fix started pointing at the exactly correct method — the model anchored on the "your previous code" block and didn't restructure it. A fixed attempt cap that gives up and asks a human, rather than looping forever or accepting a fourth identical wrong answer, is doing real work here.

## Phase 7: human review

**Why columns on `generation_runs` instead of a `review_decisions` table, when the architecture doc originally planned one?**
A run has exactly one decision, ever — it is a terminal state, not a history. A side table would exist only to hold a single row per run, which is a join for no benefit. The same reasoning already put each attempt's gate report in a `jsonb` column rather than its own table. Reach for a new table when there is a one-to-many relationship to model, not by default.

**How is a double-click or two reviewers racing handled?**
The same way the TCM's `claim()` already does it: one atomic, conditional `UPDATE ... WHERE status = 'PENDING_REVIEW'`. Whoever's update actually changes a row is the only one who proceeds to touch the filesystem or call the TCM. This was tested by calling `applyReview` twice on the same run and asserting the second call returns `not_pending` and the TCM was reported to exactly once.

**Why does reject keep the file instead of deleting it, when a failed gate always deletes the candidate?**
Different situation. A candidate that fails a gate never proved anything — deleting it is correct because keeping it would just be broken code cluttering the tree. A candidate that reaches `PENDING_REVIEW` already passed every deterministic gate the pipeline has; a human rejecting it is a judgement call the gates could not make (style, a business nuance, a subtly wrong assertion), not proof the code is broken. Keeping it in `tests/generated/` means a person can pick it up and fix it rather than starting from nothing.

**Why is the review UI hand-written HTML instead of a template engine?**
There are three pages. Pulling in EJS (already used by the HR Portal) for three server-rendered strings would be a dependency for its own sake. The templates are plain functions returning strings, which makes them trivial to unit test directly — no HTTP server needed to check that generated code is HTML-escaped before it reaches `<pre>`, for instance.

**How was the approve path actually verified?**
Not just unit tests. The happy replay scenario was run against the real Postgres database and the real mock TCM, the orchestrator API was started for real, and the review pages were opened in a browser and driven with the same HTTP requests a submitted form makes. The file moved from `tests/generated/` into `tests/e2e/leave/` on disk, the TCM's real record flipped to `AUTOMATED` with the right `automation_ref`, and a second decision attempt on the same run correctly got a 409. That test file was then removed again before committing — it was a manual verification, not a deliberate addition to the framework's exemplar suite, and leaving it in would have silently inflated the manifest's example count for no reason anyone chose.

## Phase 8: n8n and notifications

**Why does the orchestrator's webhook call swallow every error?**
n8n is scheduling and notification glue, not part of the pipeline's own correctness — a run's status is decided entirely by the gates and the human reviewer, never by whether an email went out. If `WebhookEventEmitter` let a delivery failure propagate, a down or misconfigured n8n instance could fail runs that had nothing to do with n8n. It logs and moves on, the same principle as `NullEventEmitter` being the default when no webhook URL is configured: every existing test and CI job keeps working unchanged with notifications simply switched off.

**Why is there no explicit "idempotency key" on the n8n → orchestrator call, when the architecture doc mentions one?**
Because `POST /runs` was already idempotent from phase 5 — `startRun` inserts with `ON CONFLICT (test_case_id, test_case_version) DO NOTHING` and returns the existing row otherwise. An `Idempotency-Key` header would be enforcing a property the database already guarantees. n8n's poll-and-dispatch workflow calls `POST /runs` for every still-`READY_FOR_AUTOMATION` case on every tick, by design, and relies on exactly this: the first call creates the run, every later one until the status changes is a no-op that returns 200.

**How does a workflow end up active without ever opening the n8n UI?**
`n8n import:workflow` (and `import:credentials`) work with no user or project at all — tested directly against the running container before writing a line of the compose file, since an n8n workflow committed by hand is only as good as its actual import behaviour, not what the docs claim. The one wrinkle: in regular (non-queue) deployment mode, `import:workflow --activeState=fromJson` refuses to run — activation from an import file is queue-mode-only. The fix is `n8n publish:workflow --id=<id>` immediately after import, which sets the DB's activation flag directly; n8n's normal boot sequence re-registers every active workflow's triggers on `n8n start`, which is exactly how activation survives an ordinary restart, so this is using a documented mechanism, not a hack.

**What did testing this for real actually find?**
An email that looked fine in the workflow editor but arrived at Mailpit with an empty body. The cause: n8n's Send Email node gates its `text` field's own logic on a separate `emailFormat` parameter (default `"html"`) that I hadn't set — the multi-line `text` expression was correct, but the node only reads whichever field matches the format it's in, and the unset `html` field was empty. This was found by reading Mailpit's actual API response rather than trusting a 200 from the webhook, which only proves n8n _accepted_ the event, not that the email that reached the reviewer said anything.

**Was the whole loop verified live, or just each half separately?**
Live, end to end, more than once. A test case was flipped to `READY_FOR_AUTOMATION`, and with no manual `POST /runs`, n8n's own schedule trigger polled and created the run inside two minutes. Separately, a run driven through to `PENDING_REVIEW` produced a real SMTP email in Mailpit with the correct subject, run id and review link. One environment-specific snag surfaced along the way: this dev machine's Docker runs natively inside WSL2 (see the Docker Desktop bug in project memory), which adds an extra network hop `host.docker.internal` doesn't cross by default the way it does under real Docker Desktop — worked around locally for verification, not by changing the committed compose file, which is written for the normal, documented deployment target.

## Phase 9: CI hardening

**What was actually left to "harden" if the pipeline scenario matrix and Playwright suite already ran in CI from phase 5?**
Less code than it sounds — the `checks`, `framework-e2e` and `integration` jobs were already correctly structured; hardening meant _verifying_ that, not rebuilding it. Every script name and artefact path (`test:integration`, `artifacts/integration-runs`, the Playwright HTML reporter's default output directory) was cross-checked against what the code actually writes before trusting the YAML, since a CI config that has never run for real is just a guess about the codebase written in a different syntax.

**Why is the Ollama bench job `workflow_dispatch`-only rather than running on every push?**
Two reasons. Practically, pulling and running a 7B model with no GPU on a shared runner is slow and would make every push wait on it. More importantly, phase 6 already found and documented that this model doesn't reliably pass every gate from scratch — a job that fails whenever the model fails would be a flaky, meaningless gate on every PR. What the job actually verifies is infrastructure: does Ollama still install, start, and answer a real request against the real HR Portal on a completely fresh machine. That's worth checking occasionally, by hand, not worth blocking a merge on.

**Was this actually run on GitHub, or just read as YAML?**
Run for real, on the first push — this was the point of the phase. `checks` (39s), `framework-e2e` (41s) and `integration` (139s) all passed; `bench-ollama` correctly reported as skipped, since a plain push isn't a manual dispatch. Both artefact uploads (`playwright-report`, `pipeline-artifacts`) were confirmed downloadable from the run itself, via the GitHub API, not assumed from the config.

## Phase 11: closing the DEFERRED gap

**The README said DEFERRED runs "have no automatic resumption path" — why was that true, and what would it actually take to fix it?**
It was true in a stronger sense than it first sounds: there was no resumption path at all, manual or automatic. `POST /runs` is idempotent on `(testCaseId, version)` — if a run already exists for that pair, it just hands back the existing row untouched and never calls `executeRun` again. So even a human who noticed a stuck `DEFERRED` run and tried to "just retry it" via the API would get a no-op. The fix was one small endpoint, `POST /runs/:id/retry`, that calls the exact same `executeRun()` the rest of the pipeline already uses, guarded to only accept a run that's actually `DEFERRED`. No new pipeline logic — it just exposes an internal capability that already existed.

**Why give n8n the job of calling that endpoint instead of, say, a cron inside the orchestrator?**
Same reasoning as [ADR-0002](adr/0002-n8n-as-thin-glue-not-the-brain.md): scheduling and polling are plumbing, and n8n already owns every other "check on a timer, act, notify" job in this system. The watcher makes zero decisions about correctness — it just asks "is anything stuck," calls a single endpoint, and emails about it. All the actual logic (what counts as stuck, whether a retry is safe) still lives in the orchestrator's own code.

**How was this actually verified, given the real staleness window is 10 minutes?**
Against real Postgres and a real running n8n container, not by reading the JSON and assuming it was right. The workflow's schedule was temporarily dropped to 10 seconds, which surfaced four genuinely stale `DEFERRED` runs already sitting in the database from earlier manual testing days earlier — a real find, not a planted fixture. All four were retried, the orchestrator's own log showed the `deferrals` counter increment (proof `executeRun` actually re-ran, not just that the HTTP call returned 200), and Mailpit received both the watcher's own "retried" email and the pipeline's normal `run.deferred` event email. The schedule was then restored to 5 minutes and re-verified before committing.

**What else came out of just scoping this phase, before any code was written?**
Two things worth having ready. First, a README inaccuracy: the limitations section claimed the HR Portal "already has the sabotage header wired in" for a future G6 gate — a grep of the entire app found zero matches. It was aspirational documentation that had never been built, caught only because G6 was being scoped as the next phase. Second, and unrelated to the pipeline itself: this dev machine turned out to have two separate, unsynced Docker engines — Docker Desktop and a native WSL2 install — and Docker Desktop, believed permanently broken since phase 8, had actually been the one serving the project for over a day. Neither of these would have surfaced without actually trying to build and test the next thing, which is the recurring theme across every phase here: verify against the real system, not the documentation of it.
