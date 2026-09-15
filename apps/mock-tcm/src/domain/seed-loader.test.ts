import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSeedCases, validateSeedCase } from './seed-loader.js';

const seedDir = path.resolve(import.meta.dirname, '../../seed/test-cases');

describe('the committed seed', () => {
  it('loads, has unique ids, and every automated case points at a spec file', async () => {
    const cases = await loadSeedCases(seedDir);
    expect(cases.length).toBeGreaterThanOrEqual(20);
    const automated = cases.filter((c) => c.automation_status === 'AUTOMATED');
    expect(automated.length).toBeGreaterThan(0);
    for (const c of automated) expect(c.automation_ref).toMatch(/\.spec\.ts$/);
    const ready = cases.filter((c) => c.automation_status === 'READY_FOR_AUTOMATION');
    expect(ready.length).toBeGreaterThan(0);
  });
});

describe('validateSeedCase', () => {
  const good = {
    id: 'TC-999',
    title: 'Something works',
    feature: 'leave',
    priority: 'high',
    steps: [{ action: 'Do it', expected: 'It worked' }],
  };

  it('fills defaults', () => {
    const c = validateSeedCase(good, 'x');
    expect(c.automation_status).toBe('NOT_PLANNED');
    expect(c.preconditions).toBe('');
    expect(c.test_data).toEqual({});
  });

  it('rejects a bad id, unknown feature, missing steps and an automated case without a ref', () => {
    expect(() => validateSeedCase({ ...good, id: 'T-1' }, 'x')).toThrow(/TC-001/);
    expect(() => validateSeedCase({ ...good, feature: 'billing' }, 'x')).toThrow(/feature/);
    expect(() => validateSeedCase({ ...good, steps: [] }, 'x')).toThrow(/step/);
    expect(() => validateSeedCase({ ...good, automation_status: 'AUTOMATED' }, 'x')).toThrow(
      /automation_ref/,
    );
  });
});
