import { describe, expect, it } from 'vitest';
import { parseGeneratedTest } from './output-schema.js';

const valid = {
  testCaseId: 'TC-014',
  fileName: 'tc-014-sick-leave-past-date.spec.ts',
  title: 'Sick leave can be recorded for a day in the past',
  usedPageObjects: ['LeaveFormPage'],
  usedMethods: ['LeaveFormPage.submitRequest'],
  usedFixtures: ['app', 'signInAs'],
  code: 'x'.repeat(60),
  assumptions: [],
  confidence: 0.8,
};

describe('parseGeneratedTest', () => {
  it('accepts a clean JSON object', () => {
    const result = parseGeneratedTest(JSON.stringify(valid));
    expect(result.ok).toBe(true);
  });

  it('tolerates code fences and prose around the object', () => {
    const wrapped = `Here is the test:\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\nLet me know.`;
    expect(parseGeneratedTest(wrapped).ok).toBe(true);
  });

  it('reports truncated JSON as a parse problem', () => {
    const result = parseGeneratedTest(JSON.stringify(valid).slice(0, 80));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/No JSON object|Invalid JSON/);
  });

  it('names the missing or wrong fields', () => {
    const { code: _code, ...withoutCode } = valid;
    const result = parseGeneratedTest(JSON.stringify({ ...withoutCode, fileName: 'Bad Name.ts' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.some((p) => p.startsWith('code:'))).toBe(true);
      expect(result.problems.some((p) => p.startsWith('fileName:'))).toBe(true);
    }
  });

  it('fills defaults for optional lists', () => {
    const { usedMethods: _m, assumptions: _a, ...rest } = valid;
    const result = parseGeneratedTest(JSON.stringify(rest));
    expect(result.ok && result.value.usedMethods).toEqual([]);
  });
});
