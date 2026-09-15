import { daysAgo, test, users } from '../../../src/fixtures/test.js';

test.describe('Expense claims', () => {
  test('Employee can submit an expense claim', { tag: '@TC-020' }, async ({ app, signInAs }) => {
    await signInAs(users.employee);

    await app.expenses.goto();
    await app.expenses.openClaimForm();
    await app.expenseForm.submitClaim({
      category: 'travel',
      amount: '18.20',
      description: 'Taxi from the station',
      incurredOn: daysAgo(3),
    });

    await app.expenses.expectSuccess('Expense of £18.20 submitted for approval.');
    await app.expenses.expectClaimListed('ex-101', '£18.20', 'Pending');
  });

  test('Claim over the £5,000 cap is rejected', { tag: '@TC-021' }, async ({ app, signInAs }) => {
    await signInAs(users.employee);

    await app.expenseForm.goto();
    await app.expenseForm.submitClaim({
      category: 'equipment',
      amount: '5000.01',
      description: 'Workstation',
      incurredOn: daysAgo(1),
    });

    await app.expenseForm.expectFieldError('amount', 'cannot exceed £5,000.00');
  });

  test('Claim dated in the future is rejected', { tag: '@TC-022' }, async ({ app, signInAs }) => {
    await signInAs(users.employee);

    await app.expenseForm.goto();
    await app.expenseForm.submitClaim({
      category: 'meals',
      amount: '12.00',
      description: 'Lunch next week',
      incurredOn: daysAgo(-7),
    });

    await app.expenseForm.expectFieldError('incurredOn', 'cannot be in the future');
  });
});
