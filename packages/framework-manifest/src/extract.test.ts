import { describe, expect, it } from 'vitest';
import { extractManifest } from './extract.js';
import {
  DEFAULT_FRAMEWORK_LABEL,
  DEFAULT_FRAMEWORK_ROOT,
  serialiseManifest,
} from './manifest-file.js';

// Runs against the real framework, so it doubles as a check that the framework still has the
// shape the pipeline relies on.
const manifest = extractManifest({
  frameworkRoot: DEFAULT_FRAMEWORK_ROOT,
  frameworkLabel: DEFAULT_FRAMEWORK_LABEL,
});

const pageObject = (name: string) => {
  const found = manifest.pageObjects.find((p) => p.name === name);
  if (!found) throw new Error(`${name} missing from manifest`);
  return found;
};

describe('extractManifest', () => {
  it('finds every page object on the App bundle and maps its field', () => {
    const names = manifest.pageObjects.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'LoginPage',
        'LeavePage',
        'LeaveFormPage',
        'ApprovalsPage',
        'BasePage',
      ]),
    );
    expect(pageObject('LeavePage').appField).toBe('leave');
    expect(pageObject('BasePage').appField).toBeNull();
    expect(manifest.app.find((a) => a.field === 'approvals')?.className).toBe('ApprovalsPage');
  });

  it('describes methods with params, return type, JSDoc and kind', () => {
    const submit = pageObject('LeaveFormPage').methods.find((m) => m.name === 'submitRequest');
    expect(submit).toMatchObject({
      params: [{ name: 'details', type: 'LeaveRequestDetails', optional: false }],
      returns: 'Promise<void>',
      kind: 'action',
      inheritedFrom: null,
    });
    expect(submit?.description).toMatch(/Fills the form and submits/);

    const kinds = Object.fromEntries(pageObject('LeavePage').methods.map((m) => [m.name, m.kind]));
    expect(kinds).toMatchObject({
      goto: 'navigation',
      row: 'locator',
      cancel: 'action',
      expectRequestListed: 'assertion',
    });
  });

  it('includes inherited members from BasePage and says where they came from', () => {
    const expectSuccess = pageObject('LeavePage').methods.find((m) => m.name === 'expectSuccess');
    expect(expectSuccess?.inheritedFrom).toBe('BasePage');
    const nav = pageObject('LeavePage').locators.find((l) => l.name === 'navApprovals');
    expect(nav).toMatchObject({ testId: 'nav-approvals', inheritedFrom: 'BasePage' });
  });

  it('extracts locators with their test ids', () => {
    const locators = Object.fromEntries(
      pageObject('LoginPage').locators.map((l) => [l.name, l.testId]),
    );
    expect(locators).toMatchObject({
      emailInput: 'login-email',
      passwordInput: 'login-password',
      submitButton: 'login-submit',
    });
    const chained = pageObject('DashboardPage').locators.find((l) => l.name === 'remainingLeave');
    expect(chained?.testId).toBeNull();
    expect(chained?.expression).toContain("getByTestId('stat-remaining-leave')");
  });

  it('never exposes private or protected members', () => {
    for (const p of manifest.pageObjects) {
      expect(p.locators.map((l) => l.name)).not.toContain('page');
      expect(p.methods.map((m) => m.name)).not.toContain('constructor');
    }
  });

  it('lists fixtures, users, seeded records and helpers with descriptions', () => {
    expect(manifest.fixtures.map((f) => f.name)).toEqual(['app', 'api', 'signInAs', 'resetState']);
    expect(manifest.fixtures.find((f) => f.name === 'signInAs')?.description).toMatch(
      /Signs a seed user in/,
    );
    expect(manifest.users.find((u) => u.key === 'employee')).toMatchObject({
      id: 'emp-004',
      firstName: 'Dev',
      lastName: 'Patel',
      role: 'employee',
    });
    expect(manifest.seeded.find((s) => s.key === 'pendingLeaveForEmployee')?.value).toBe(
      "'lr-001'",
    );
    expect(manifest.helpers.map((h) => h.name)).toEqual(
      expect.arrayContaining(['mondayWeeksAhead', 'addDays', 'daysAgo']),
    );
  });

  it('indexes every example test with its title and tag', () => {
    const allTests = manifest.examples.flatMap((e) => e.tests);
    expect(allTests.length).toBe(19);
    for (const t of allTests) expect(t.tags.some((tag) => /^@TC-\d+$/.test(tag))).toBe(true);
    const leave = manifest.examples.find((e) => e.path.includes('request-leave'));
    expect(leave).toMatchObject({ feature: 'leave', describe: 'Leave requests' });
  });

  it('is deterministic', () => {
    const again = extractManifest({
      frameworkRoot: DEFAULT_FRAMEWORK_ROOT,
      frameworkLabel: DEFAULT_FRAMEWORK_LABEL,
    });
    expect(serialiseManifest(again)).toBe(serialiseManifest(manifest));
  });
});
