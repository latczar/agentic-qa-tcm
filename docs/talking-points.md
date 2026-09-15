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
