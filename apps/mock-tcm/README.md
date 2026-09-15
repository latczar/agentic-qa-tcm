# Mock TCM (`apps/mock-tcm`)

A TestRail-style test case management stand-in. It holds the manual test cases, lets a person mark them ready for automation, and lets the pipeline report back. Express 5, EJS, Postgres (the `tcm` database from `docker-compose.yml`).

## Run it

```bash
docker compose up -d postgres
npm run dev -w apps/mock-tcm
```

UI at http://localhost:4000/cases, API under http://localhost:4000/api. On first start the schema is created and the seed loaded. `POST /api/__test__/reset` reloads the seed (test mode only, which is the default unless `NODE_ENV=production`).

| Variable       | Default                                   |
| -------------- | ----------------------------------------- |
| `PORT`         | `4000`                                    |
| `DATABASE_URL` | `postgres://aiqa:aiqa@localhost:5432/tcm` |
| `TEST_MODE`    | on unless `NODE_ENV=production`           |
| `SEED_DIR`     | `seed/test-cases` inside this package     |

## Status model

Two actors, two sets of allowed moves. Anything else is refused with a 409.

| Actor    | From                   | To                                 |
| -------- | ---------------------- | ---------------------------------- |
| human    | Not planned            | Ready for automation               |
| human    | Ready for automation   | Not planned                        |
| human    | Needs attention        | Ready for automation, Not planned  |
| human    | Automated              | Ready for automation (re-automate) |
| pipeline | Ready for automation   | Automation in progress (the claim) |
| pipeline | Automation in progress | Pending review, Needs attention    |
| pipeline | Pending review         | Automated, Needs attention         |

**Version.** Increments when the content is edited and when a human requests automation. It does not change when the pipeline reports. The pipeline runs at most once per (id, version): a duplicate poll of an unchanged case collapses, a deliberate re-request is a new run.

**Claim.** `POST /api/cases/:id/claim` with `{ "version": n, "run_id": "..." }` is a single conditional update. If the case is not Ready at exactly that version, the caller gets a 409 with the current case. Four concurrent claims produce one winner; there is an integration test for it.

## API

| Method | Path                        | Body                                          | Notes                          |
| ------ | --------------------------- | --------------------------------------------- | ------------------------------ |
| GET    | `/api/health`               |                                               |                                |
| GET    | `/api/cases`                |                                               | `?automation_status=&feature=` |
| GET    | `/api/cases/:id`            |                                               | includes `history`             |
| POST   | `/api/cases/:id/claim`      | `{ version, run_id }`                         | 200 won, 409 lost              |
| POST   | `/api/cases/:id/automation` | `{ status, run_id?, automation_ref?, note? }` | pipeline transitions only      |
| POST   | `/api/__test__/reset`       |                                               | test mode only                 |

## Seed

`seed/test-cases/*.yaml`, one file per feature, 31 cases. Nineteen mirror the handwritten Playwright tests and are seeded as Automated with `automation_ref` pointing at the spec. Four are Ready for automation (TC-005, TC-014, TC-034, TC-045) so the pipeline has work on day one. The rest are Not planned. Every person and record they mention is fictional.

## Tests

- `npm test` runs the unit tests: transition rules, seed validation.
- `npm run test:integration` runs the repository tests against the real Postgres in Docker: filters, claim once, concurrent claims, version bumps, history.
