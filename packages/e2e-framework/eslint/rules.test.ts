import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import plugin from './index.js';

// Let ESLint's RuleTester report through Vitest.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

const goodTest = `
test('Employee can cancel', { tag: '@TC-013' }, async ({ app }) => {
  await app.leave.goto();
  await app.leave.expectRequestListed('lr-001', 'Cancelled');
});`;

tester.run('no-raw-locators-in-tests', plugin.rules['no-raw-locators-in-tests'], {
  valid: [
    { code: goodTest },
    { code: `await app.leave.row('lr-001').click();` },
    { code: `const x = page.url();` },
  ],
  invalid: [
    {
      code: `await page.locator('#x').click();`,
      errors: [{ messageId: 'raw', data: { method: 'locator' } }],
    },
    {
      code: `await page.getByTestId('leave-submit').click();`,
      errors: [{ messageId: 'raw', data: { method: 'getByTestId' } }],
    },
    {
      code: `await page.goto('/leave');`,
      errors: [{ messageId: 'raw', data: { method: 'goto' } }],
    },
    {
      code: `await page.waitForTimeout(500);`,
      errors: [{ messageId: 'raw', data: { method: 'waitForTimeout' } }],
    },
  ],
});

tester.run('no-hardcoded-urls', plugin.rules['no-hardcoded-urls'], {
  valid: [{ code: `await app.leave.goto();` }, { code: `const path = '/leave/new';` }],
  invalid: [
    { code: `await page.goto('http://localhost:3000/leave');`, errors: [{ messageId: 'url' }] },
    { code: 'const u = `https://example.test/${id}`;', errors: [{ messageId: 'url' }] },
  ],
});

tester.run('require-test-case-tag', plugin.rules['require-test-case-tag'], {
  valid: [
    { code: goodTest },
    { code: `test('Has tags', { tag: ['@smoke', '@TC-001'] }, async () => {});` },
    { code: `test('Legacy title @TC-002', async () => {});` },
    { code: `test.describe('Suite', () => {});` },
  ],
  invalid: [
    { code: `test('No tag at all', async ({ app }) => {});`, errors: [{ messageId: 'missing' }] },
    {
      code: `test('Wrong tag', { tag: '@smoke' }, async () => {});`,
      errors: [{ messageId: 'missing' }],
    },
    {
      code: `test.only('Focused and untagged', async () => {});`,
      errors: [{ messageId: 'missing' }],
    },
  ],
});

tester.run('no-trivial-assertions', plugin.rules['no-trivial-assertions'], {
  valid: [
    { code: `await expect(app.leave.remaining).toHaveText('17');` },
    { code: `expect(count).toBe(3);` },
    { code: `await expect(page).toHaveURL(/leave/);` },
  ],
  invalid: [
    { code: `expect(true).toBe(true);`, errors: [{ messageId: 'literal' }] },
    { code: `expect(1).toBe(1);`, errors: [{ messageId: 'literal' }] },
    { code: `expect('ok').toEqual('ok');`, errors: [{ messageId: 'literal' }] },
    {
      code: `expect(result).toBeDefined();`,
      errors: [{ messageId: 'weak', data: { matcher: 'toBeDefined' } }],
    },
    {
      code: `expect(await page.title()).toBeTruthy();`,
      errors: [{ messageId: 'weak', data: { matcher: 'toBeTruthy' } }],
    },
    {
      code: `expect(x).not.toBeFalsy();`,
      errors: [{ messageId: 'weak', data: { matcher: 'toBeFalsy' } }],
    },
  ],
});

tester.run('require-state-assertion', plugin.rules['require-state-assertion'], {
  valid: [
    { code: goodTest },
    {
      code: `test('Web-first matcher', { tag: '@TC-001' }, async ({ app }) => {
        await expect(app.leave.remaining).toHaveText('17');
      });`,
    },
    {
      code: `test('Soft matcher', { tag: '@TC-001' }, async ({ app }) => {
        await expect.soft(app.leave.remaining).not.toBeVisible();
      });`,
    },
  ],
  invalid: [
    {
      code: `test('Only actions', { tag: '@TC-001' }, async ({ app }) => {
        await app.leave.goto();
        await app.leave.cancel('lr-001');
      });`,
      errors: [{ messageId: 'none' }],
    },
    {
      code: `test('Trivial only', { tag: '@TC-001' }, async () => {
        expect(true).toBe(true);
      });`,
      errors: [{ messageId: 'none' }],
    },
    {
      code: `test('Weak only', { tag: '@TC-001' }, async ({ page }) => {
        expect(await page.title()).toBeTruthy();
      });`,
      errors: [{ messageId: 'none' }],
    },
  ],
});
