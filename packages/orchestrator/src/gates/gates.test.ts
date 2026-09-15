import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadManifest, repoRoot } from '@aiqa/framework-manifest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FrameworkManifest } from '@aiqa/framework-manifest';
import { analyseCode } from './analysis.js';
import { gateContract } from './g0-contract.js';
import { gateStructure } from './g1-structure.js';
import { gateSymbols } from './g2-symbols.js';

// The fast gates, run against the scenario fixtures so the fixtures and the gates are checked together.

let manifest: FrameworkManifest;
const scenario = (name: string, n = 1) =>
  readFile(path.join(repoRoot, 'scenarios', name, `candidate-${n}.ts`), 'utf8');
const response = (name: string, n = 1) =>
  readFile(path.join(repoRoot, 'scenarios', name, `response-${n}.txt`), 'utf8');

beforeAll(async () => {
  manifest = await loadManifest();
});

describe('G0 response contract', () => {
  it('accepts the happy response and rejects truncated JSON with a readable problem', async () => {
    expect(gateContract(await response('happy'), 'TC-014').parsed).not.toBeNull();
    const bad = gateContract(await response('malformed-then-valid'), 'TC-014');
    expect(bad.parsed).toBeNull();
    expect(bad.result.errors[0]?.code).toBe('MALFORMED');
  });

  it('refuses a response for a different test case', async () => {
    const result = gateContract(await response('happy'), 'TC-999');
    expect(result.parsed).toBeNull();
    expect(result.result.errors[0]?.code).toBe('WRONG_TEST_CASE');
  });
});

describe('G1 structural policy', () => {
  it('passes the valid candidate', async () => {
    const g1 = gateStructure(analyseCode(await scenario('happy')), manifest, 'TC-014');
    expect(g1.errors).toEqual([]);
  });

  it('lists every violation in the structure-violation fixture with a hint', async () => {
    const g1 = gateStructure(
      analyseCode(await scenario('structure-violation')),
      manifest,
      'TC-014',
    );
    const codes = g1.errors.map((e) => e.code);
    expect(codes).toContain('FORBIDDEN_IMPORT');
    expect(codes).toContain('RAW_PAGE_CALL');
    expect(codes).toContain('ABSOLUTE_URL');
    expect(g1.errors.find((e) => e.code === 'RAW_PAGE_CALL')?.hint).toMatch(/page object/);
  });

  it('catches the wrong tag and says which one to use', async () => {
    const g1 = gateStructure(analyseCode(await scenario('wrong-tag')), manifest, 'TC-014');
    expect(g1.errors.map((e) => e.code)).toEqual(['WRONG_TAG']);
    expect(g1.errors[0]?.hint).toContain('@TC-014');
  });

  it('refuses dangerous constructs', () => {
    const code = `import { test } from '../../src/fixtures/test.js';
test('x', { tag: '@TC-014' }, async ({ app }) => {
  const fs = require('node:fs');
  await app.leave.goto();
  await page.waitForTimeout(500);
});
test.only('y', { tag: '@TC-014' }, async () => {});`;
    const g1 = gateStructure(analyseCode(code), manifest, 'TC-014');
    const codes = g1.errors.map((e) => e.code);
    expect(codes).toContain('FORBIDDEN_CONSTRUCT');
    expect(codes).toContain('RAW_PAGE_CALL');
    expect(g1.errors.some((e) => e.message.includes('test.only'))).toBe(true);
  });
});

describe('G2 symbol existence', () => {
  it('passes the valid candidate and reports self-report accuracy', async () => {
    const g2 = gateSymbols(analyseCode(await scenario('happy')), manifest, [
      'LeavePage.goto',
      'LeaveFormPage.submitRequest',
      'LeavePage.expectRemaining',
      'LeavePage.imaginary',
    ]);
    expect(g2.result.errors).toEqual([]);
    expect(g2.selfReport.accuracy).toBe(0.75);
    expect(g2.selfReport.actualMethods).toContain('LeaveFormPage.submitRequest');
  });

  it('names the invented method and suggests the real one', async () => {
    const g2 = gateSymbols(analyseCode(await scenario('unknown-method')), manifest, []);
    expect(g2.result.errors).toHaveLength(1);
    expect(g2.result.errors[0]).toMatchObject({ code: 'UNKNOWN_MEMBER' });
    expect(g2.result.errors[0]?.message).toContain('submitLeave');
    expect(g2.result.errors[0]?.hint).toContain('submitRequest');
  });

  it('catches an unknown locator', async () => {
    const g2 = gateSymbols(analyseCode(await scenario('unknown-locator')), manifest, []);
    expect(g2.result.errors.length).toBeGreaterThan(0);
    expect(new Set(g2.result.errors.map((e) => e.code))).toEqual(new Set(['UNKNOWN_MEMBER']));
    expect(g2.result.errors[0]?.message).toContain('balanceBadge');
  });

  it('checks arity, fixtures, users, seeded ids and helper imports', () => {
    const code = `import { test, users, seeded } from '../../src/fixtures/test.js';
test('x', { tag: '@TC-014' }, async ({ app, browserless }) => {
  await app.leave.cancel();
  await app.leave.expectRequestListed(seeded.nothing, 'Pending', 'extra');
  await app.login.signIn(users.ghost.email, 'x');
  const d = daysAgo(3);
});`;
    const g2 = gateSymbols(analyseCode(code), manifest, []);
    const codes = g2.result.errors.map((e) => e.code).sort();
    expect(codes).toEqual([
      'HELPER_NOT_IMPORTED',
      'UNKNOWN_FIXTURE',
      'UNKNOWN_SEEDED',
      'UNKNOWN_USER',
      'WRONG_ARITY',
      'WRONG_ARITY',
    ]);
    expect(g2.result.errors.find((e) => e.code === 'WRONG_ARITY')?.hint).toContain(
      'cancel(requestId: string)',
    );
  });

  it('does not flag the type error fixture, which is G3 territory', async () => {
    const g2 = gateSymbols(analyseCode(await scenario('type-error')), manifest, []);
    expect(g2.result.passed).toBe(true);
  });
});
