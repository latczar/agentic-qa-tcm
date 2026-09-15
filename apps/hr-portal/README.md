# Harbour HR (`apps/hr-portal`)

A small, deterministic employee portal that exists to be tested. It is the system under test for the Playwright framework and, through it, for every test the pipeline generates.

Express 5, EJS templates, one CSS file, no database. All state lives in memory and comes from a fixed seed, so every start and every reset produces the same world.

## Run it

```bash
npm run dev -w apps/hr-portal
```

Then open http://localhost:3000. `npm start -w apps/hr-portal` runs it without file watching.

| Variable         | Default                         | Meaning                                                              |
| ---------------- | ------------------------------- | -------------------------------------------------------------------- |
| `PORT`           | `3000`                          | Listening port                                                       |
| `TEST_MODE`      | on unless `NODE_ENV=production` | Mounts `POST /__test__/reset`                                        |
| `SESSION_SECRET` | a fixed local value             | Cookie signing secret. Irrelevant locally, required if ever deployed |

## Seed accounts

Every account signs in with the password `Password123!`. The email domain is reserved for examples and never routes.

| Id      | Name           | Role     | Department  | Manager     | Notes                              |
| ------- | -------------- | -------- | ----------- | ----------- | ---------------------------------- |
| emp-001 | Priya Shah     | admin    | People      | None        | Head of People                     |
| emp-002 | Tom Okafor     | manager  | Engineering | Priya Shah  | Manages Dev, Amira and Jack        |
| emp-003 | Hannah Reid    | manager  | Sales       | Priya Shah  | Manages Sophie and Leon            |
| emp-004 | Dev Patel      | employee | Engineering | Tom Okafor  | Has a pending leave request        |
| emp-005 | Amira Hassan   | employee | Engineering | Tom Okafor  | Has approved leave and a rejection |
| emp-006 | Jack Whitfield | employee | Engineering | Tom Okafor  | No requests yet                    |
| emp-007 | Sophie Clarke  | employee | Sales       | Hannah Reid | Has a pending leave request        |
| emp-008 | Leon Baptiste  | employee | Sales       | Hannah Reid | Deactivated. Cannot sign in        |

Emails follow `firstname.lastname@harbourhr.example`.

Seeded requests: two pending leave requests (Dev, Sophie), two pending expenses (Dev, Sophie), plus approved and rejected examples so lists are never empty. Everyone has a 25 day annual leave allowance.

## Business rules

- **Roles.** Employees see the directory read-only and manage their own leave and expenses. Managers also decide on requests from their direct reports. Admins also add, edit, deactivate and reactivate employees, and decide on anyone's requests.
- **Leave.** Working days are Monday to Friday; weekends never count and bank holidays are out of scope. Annual leave is limited by the remaining balance, where approved and pending requests both count as used. Only sick leave may start in the past. Only pending requests can be cancelled, and only by their owner.
- **Expenses.** Amounts are entered in pounds and stored as whole pence. Maximum £5,000 per claim. The date cannot be in the future.
- **Approvals.** Nobody can approve their own request. Rejecting requires a comment. A request that has already been decided cannot be decided again.
- **Accounts.** Emails are unique. A deactivated account cannot sign in and any existing session for it is dropped. An admin cannot deactivate themselves.

## Endpoints that matter to tests

| Method | Path              | Purpose                                                 |
| ------ | ----------------- | ------------------------------------------------------- |
| GET    | `/health`         | `{ status, app, seedVersion, testMode, uptimeSeconds }` |
| POST   | `/__test__/reset` | Restore the seed. Test mode only                        |

Everything else is a normal page. Forms use POST-redirect-GET and show a one-shot flash message on the next page.

## Design notes for the curious

- **Server-side validation only.** Browser validation attributes are left off so every error message is reachable and assertable. Each field error is rendered with `data-testid="error-<field>"`.
- **Stable test ids everywhere.** Every button, link, row, badge and field carries a `data-testid`. Rows include the record id, for example `leave-row-lr-001`, so a test can target the exact record it created.
- **Deterministic ids.** New records continue from a fixed counter after every reset, so the first leave request a test creates is always `lr-101`.
- **Plain-text passwords.** Deliberate. These are synthetic accounts in a test double that never holds real data. A product would hash them.
- **In-memory state.** Restarting the process is a reset. This is what makes the pipeline's execution gate trustworthy: a failing generated test failed because of the test, not because of leftover data.
