import { daysAgo, test, users } from '../../../src/fixtures/test.js';

test.describe('Employee directory', () => {
  test('Admin can add an employee', { tag: '@TC-040' }, async ({ app, signInAs }) => {
    await signInAs(users.admin);

    await app.employees.goto();
    await app.employees.openAddForm();
    await app.employeeForm.fill({
      firstName: 'Nadia',
      lastName: 'Kowalski',
      email: 'nadia.kowalski@harbourhr.example',
      jobTitle: 'Finance Analyst',
      department: 'Finance',
      role: 'employee',
      managerId: users.admin.id,
      startDate: daysAgo(14),
      annualLeaveAllowance: 25,
      password: 'Welcome-2026!',
    });
    await app.employeeForm.save();

    await app.employeeDetail.expectSuccess('Nadia Kowalski has been added.');
    await app.employeeDetail.expectName('Nadia Kowalski');
    await app.employeeDetail.expectDetail('manager', 'Priya Shah');
  });

  test('Duplicate email is rejected', { tag: '@TC-041' }, async ({ app, signInAs }) => {
    await signInAs(users.admin);

    await app.employeeForm.gotoNew();
    await app.employeeForm.fill({
      firstName: 'Another',
      lastName: 'Dev',
      email: users.employee.email,
      jobTitle: 'Engineer',
      department: 'Engineering',
      role: 'employee',
      managerId: users.engineeringManager.id,
      startDate: daysAgo(1),
      annualLeaveAllowance: 25,
      password: 'Welcome-2026!',
    });
    await app.employeeForm.save();

    await app.employeeForm.expectFieldError('email', 'already exists');
  });

  test('Admin can deactivate an employee', { tag: '@TC-042' }, async ({ app, signInAs }) => {
    await signInAs(users.admin);

    await app.employees.goto();
    await app.employees.deactivate(users.platformEngineer.id);

    await app.employees.expectSuccess('Jack Whitfield has been deactivated.');
    await app.employees.expectStatus(users.platformEngineer.id, 'Inactive');
  });

  test(
    'Employee cannot open the add-employee form',
    { tag: '@TC-043' },
    async ({ app, signInAs }) => {
      await signInAs(users.employee);

      await app.employeeForm.gotoNew();

      await app.errorPage.expectStatus(403);
    },
  );
});
