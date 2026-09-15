import { addDays, mondayWeeksAhead, test, users } from '../../src/fixtures/test.js';

test.describe('Leave requests', () => {
  test('Sick leave can be recorded for a day in the past', { tag: '@TC-014' }, async ({ app, signInAs }) => {
    await signInAs(users.qaEngineer);
    const lastMonday = addDays(mondayWeeksAhead(1), -14);

    await app.leave.goto();
    await app.leave.expectRemaining(20);
    await app.leave.openRequestForm();
    await app.leaveForm.submitRequest({ type: 'sick', startDate: lastMonday, endDate: lastMonday, reason: 'Flu' });

    await app.leave.expectSuccess('Leave request submitted for approval (1 working day)');
    await app.leave.expectRequestListed('lr-101', 'Pending');
    await app.leave.expectRemaining(20 - test.info().repeatEachIndex);
  });
});
