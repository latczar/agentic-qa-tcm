import { addDays, mondayWeeksAhead, seeded, test, users } from '../../../src/fixtures/test.js';

test.describe('Leave requests', () => {
  test(
    'Employee can submit an annual leave request',
    { tag: '@TC-010' },
    async ({ app, signInAs }) => {
      await signInAs(users.employee);
      const monday = mondayWeeksAhead(4);

      await app.leave.goto();
      await app.leave.expectRemaining(20);
      await app.leave.openRequestForm();
      await app.leaveForm.submitRequest({
        type: 'annual',
        startDate: monday,
        endDate: addDays(monday, 2),
        reason: 'Long weekend away',
      });

      await app.leave.expectSuccess('Leave request submitted for approval (3 working days)');
      await app.leave.expectRequestListed('lr-101', 'Pending');
      await app.leave.expectRemaining(17);
    },
  );

  test(
    'Annual leave beyond the remaining balance is rejected',
    { tag: '@TC-011' },
    async ({ app, signInAs }) => {
      await signInAs(users.employee);
      const monday = mondayWeeksAhead(4);

      await app.leaveForm.goto();
      await app.leaveForm.submitRequest({
        type: 'annual',
        startDate: monday,
        endDate: addDays(monday, 4 + 7 * 4), // five working weeks
        reason: 'Sabbatical',
      });

      await app.leaveForm.expectFieldError('endDate', 'but you have 20 remaining');
    },
  );

  test('Weekend-only dates are rejected', { tag: '@TC-012' }, async ({ app, signInAs }) => {
    await signInAs(users.employee);
    const saturday = addDays(mondayWeeksAhead(4), 5);

    await app.leaveForm.goto();
    await app.leaveForm.submitRequest({
      type: 'annual',
      startDate: saturday,
      endDate: addDays(saturday, 1),
    });

    await app.leaveForm.expectFieldError('startDate', 'no working days');
  });

  test(
    'Employee can cancel a pending request and the days return to the balance',
    { tag: '@TC-013' },
    async ({ app, signInAs }) => {
      await signInAs(users.employee);

      await app.leave.goto();
      await app.leave.expectRequestListed(seeded.pendingLeaveForEmployee, 'Pending');
      await app.leave.cancel(seeded.pendingLeaveForEmployee);

      await app.leave.expectSuccess('Leave request cancelled.');
      await app.leave.expectRequestListed(seeded.pendingLeaveForEmployee, 'Cancelled');
      await app.leave.expectRemaining(seeded.annualLeaveAllowance);
    },
  );
});
