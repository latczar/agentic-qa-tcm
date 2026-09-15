import { test, users } from '../../../src/fixtures/test.js';

test.describe('Sign in', () => {
  test('Employee can sign in and sees their dashboard', { tag: '@TC-001' }, async ({ app }) => {
    await app.login.goto();
    await app.login.signIn(users.employee.email, users.employee.password);

    await app.dashboard.expectLoadedFor(users.employee.firstName);
    await app.dashboard.expectSignedInAs(users.employee.firstName, 'employee');
  });

  test('Wrong password is refused with a message', { tag: '@TC-002' }, async ({ app }) => {
    await app.login.goto();
    await app.login.signIn(users.employee.email, 'not-the-password');

    await app.login.expectSignInRefused('Email or password is incorrect.');
  });

  test('Deactivated account cannot sign in', { tag: '@TC-003' }, async ({ app }) => {
    await app.login.goto();
    await app.login.signIn(users.deactivated.email, users.deactivated.password);

    await app.login.expectSignInRefused(/deactivated/);
  });

  test('Signing out returns to the sign-in page', { tag: '@TC-004' }, async ({ app, signInAs }) => {
    await signInAs(users.employee);

    await app.dashboard.signOut();

    await app.login.expectSignInFormVisible();
  });
});
