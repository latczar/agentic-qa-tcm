import { test, expect } from '@playwright/test';

test.describe('Leave requests', () => {
  test('Sick leave can be recorded for a day in the past', { tag: '@TC-014' }, async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.getByTestId('login-email').fill('amira.hassan@harbourhr.example');
    await page.getByTestId('login-password').fill('Password123!');
    await page.getByTestId('login-submit').click();
    await page.goto('http://localhost:3000/leave');
    await expect(page.getByTestId('leave-remaining')).toHaveText('20');
  });
});
