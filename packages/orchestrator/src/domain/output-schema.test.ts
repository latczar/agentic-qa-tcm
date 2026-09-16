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
    if (!result.ok) expect(result.problems[0]).toMatch(/no JSON object|Invalid JSON/i);
  });

  it('names the missing or wrong fields', () => {
    const { code: _code, ...withoutCode } = valid;
    const result = parseGeneratedTest(JSON.stringify({ ...withoutCode, title: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.some((p) => p.startsWith('code:'))).toBe(true);
      expect(result.problems.some((p) => p.startsWith('title:'))).toBe(true);
    }
  });

  it('clamps an out-of-range confidence instead of rejecting the reply', () => {
    const result = parseGeneratedTest(JSON.stringify({ ...valid, confidence: -1 }));
    expect(result.ok && result.value.confidence).toBe(0);
  });

  it('fills defaults for optional lists', () => {
    const { usedMethods: _m, assumptions: _a, ...rest } = valid;
    const result = parseGeneratedTest(JSON.stringify(rest));
    expect(result.ok && result.value.usedMethods).toEqual([]);
  });
});

describe('parseGeneratedTest with the fenced format', () => {
  const code = `import { test, users } from '../../src/fixtures/test.js';\n\ntest('Sick leave can be recorded for a day in the past', { tag: '@TC-014' }, async ({ app, signInAs }) => {\n  await signInAs(users.qaEngineer);\n  await app.leave.expectRemaining(20);\n});\n`;

  it('takes the file from the ts fence and the metadata from the json fence', () => {
    const raw = `Here you go.\n\`\`\`ts\n${code}\`\`\`\n\`\`\`json\n{"testCaseId":"TC-014","fileName":"tc-014-sick.spec.ts","usedMethods":["LeavePage.expectRemaining"],"confidence":0.9}\n\`\`\``;
    const result = parseGeneratedTest(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.code).toBe(code.trim());
      expect(result.value.usedMethods).toEqual(['LeavePage.expectRemaining']);
      expect(result.value.title).toBe('Sick leave can be recorded for a day in the past');
    }
  });

  it('survives a missing or broken metadata block by reading the tag and title from the code', () => {
    const result = parseGeneratedTest(
      `\`\`\`typescript\n${code}\`\`\`\n\`\`\`json\n{not json\n\`\`\``,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.testCaseId).toBe('TC-014');
      expect(result.value.fileName).toBe('tc-014-generated.spec.ts');
      expect(result.value.confidence).toBe(0.5);
    }
  });

  it('rejects a fenced reply whose code carries no test case tag and no metadata', () => {
    const result = parseGeneratedTest('```ts\n' + code.replace("{ tag: '@TC-014' }, ", '') + '```');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/testCaseId/);
  });
});
