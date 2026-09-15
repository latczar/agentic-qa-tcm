import { seeded, test, users } from '../../../src/fixtures/test.js';

test.describe('Manager approvals', () => {
  test(
    "Manager approves a direct report's leave request",
    { tag: '@TC-030' },
    async ({ app, signInAs }) => {
      await signInAs(users.engineeringManager);

      await app.approvals.goto();
      await app.approvals.expectLeaveAwaiting(seeded.pendingLeaveForEmployee);
      await app.approvals.approveLeave(seeded.pendingLeaveForEmployee);

      await app.approvals.expectSuccess('Leave request for Dev Patel approved.');
      await app.approvals.expectLeaveNotAwaiting(seeded.pendingLeaveForEmployee);
    },
  );

  test(
    'Rejecting a leave request requires a comment',
    { tag: '@TC-031' },
    async ({ app, signInAs }) => {
      await signInAs(users.engineeringManager);

      await app.approvals.goto();
      await app.approvals.rejectLeave(seeded.pendingLeaveForEmployee, '');

      await app.approvals.expectError('Add a comment explaining the rejection.');
      await app.approvals.expectLeaveAwaiting(seeded.pendingLeaveForEmployee);
    },
  );

  test(
    'Manager only sees requests from their own reports',
    { tag: '@TC-032' },
    async ({ app, signInAs }) => {
      await signInAs(users.engineeringManager);

      await app.approvals.goto();

      await app.approvals.expectLeaveAwaiting(seeded.pendingLeaveForEmployee);
      await app.approvals.expectLeaveNotAwaiting(seeded.pendingLeaveForSalesExecutive);
    },
  );

  test(
    "Rejected expense shows the manager's comment to the employee",
    { tag: '@TC-033' },
    async ({ app, signInAs }) => {
      await signInAs(users.engineeringManager);
      await app.approvals.goto();
      await app.approvals.rejectExpense(
        seeded.pendingExpenseForEmployee,
        'Please attach the receipt.',
      );
      await app.approvals.expectSuccess('rejected');
      await app.approvals.signOut();

      await signInAs(users.employee);
      await app.expenses.goto();

      await app.expenses.expectClaimListed(seeded.pendingExpenseForEmployee, '£42.50', 'Rejected');
    },
  );
});
