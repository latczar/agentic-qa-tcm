# Framework conventions

The rules every test in this framework follows. They are short on purpose: a person can hold them in their head, and a machine can check most of them. The lint rules under `eslint/` enforce the ones marked with a tick.

## Files and names

- Specs live in `tests/e2e/<feature>/` and end in `.spec.ts`. Generated candidates live in `tests/generated/` until a human approves them.
- One `test.describe` per file, named after the feature. Test titles are full sentences in plain English that describe behaviour, not implementation: "Employee can cancel a pending request", not "test cancel button".
- ✔ Every test carries its test case id as a tag: `test('...', { tag: '@TC-010' }, async ({ app }) => { ... })`.

## Imports

- ✔ Specs import `test`, `expect`, `users`, `seeded` and the date helpers from `src/fixtures/test.ts`, never from `@playwright/test` directly. The framework's `test` resets the application and provides the page objects.
- Specs do not import page object classes. They use them through the `app` fixture: `app.leave`, `app.leaveForm`, `app.approvals`, and so on.

## Locators and navigation

- ✔ Specs never call `page.locator`, `page.getBy*` or `page.goto`. All locators and navigation live in page objects.
- Page objects find elements by `data-testid` only. Rows include the record id: `leave-row-lr-001`, `employee-row-emp-004`.
- ✔ No absolute URLs anywhere in a spec. Navigation goes through a page object's `goto()`.
- No `waitForTimeout`, no `test.only`, no `test.skip` in committed code.

## Page objects

- Locators are `readonly` fields. Behaviour is an `async` method with a one-line JSDoc comment. Methods do one user-visible thing.
- Action methods do not assert the outcome. `submitRequest()` fills and submits; the test decides whether to expect a success banner or a field error.
- Assertion helpers are named `expect*` and contain the `expect` call: `expectRequestListed('lr-101', 'Pending')`. Lint counts a call to an `expect*` method as a state assertion.

## Assertions

- ✔ Every test asserts something a user can see: a locator's visibility, text, count, value or the page URL. Web-first matchers only: `toBeVisible`, `toHaveText`, `toContainText`, `toHaveCount`, `toHaveURL`, `toHaveValue`, and their relatives.
- ✔ No trivial assertions. `expect(true).toBe(true)`, `expect(1).toBe(1)` and the matchers `toBeDefined`, `toBeTruthy` and `toBeFalsy` are banned in specs because they pass without proving anything.
- Assert the specific outcome the test case describes: the new row with its status, the exact validation message, the changed balance. Not just "the page loaded".

## Data

- Every test starts from the seed. The `resetState` fixture restores it automatically, so tests never depend on order.
- Use the seed accounts from `users` and the seeded record ids from `seeded`. Never type an email or an id inline.
- The first record a test creates always gets a known id: `lr-101` for leave, `ex-101` for expenses, `emp-101` for employees.
- Dates are relative to today through the date helpers, so tests still pass next year. Money is asserted as the formatted string the user sees, for example `£42.50`.

## Structure of a test

Arrange, act, assert, separated by blank lines:

```ts
test(
  'Employee can submit an annual leave request',
  { tag: '@TC-010' },
  async ({ app, signInAs }) => {
    await signInAs(users.employee);
    const monday = mondayWeeksAhead(4);

    await app.leave.goto();
    await app.leave.openRequestForm();
    await app.leaveForm.submitRequest({
      type: 'annual',
      startDate: monday,
      endDate: addDays(monday, 2),
    });

    await app.leave.expectSuccess('submitted for approval');
    await app.leave.expectRequestListed('lr-101', 'Pending');
    await app.leave.expectRemaining(17);
  },
);
```
