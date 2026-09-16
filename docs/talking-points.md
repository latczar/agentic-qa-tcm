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
