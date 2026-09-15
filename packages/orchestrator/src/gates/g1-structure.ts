import type { FrameworkManifest } from '@aiqa/framework-manifest';
import type { GateError, GateResult } from '../domain/types.js';
import type { CodeAnalysis } from './analysis.js';

const FIXTURES_MODULE = /(^|\/)src\/fixtures\/test(\.js|\.ts)?$/;

/**
 * G1: the spec has the shape the framework demands. Imports only from the fixtures module,
 * one tagged test for the right case, no raw page calls, no absolute URLs, nothing dangerous.
 * Assertion quality is G4's job (ESLint), which keeps the two gates distinct.
 */
export function gateStructure(
  analysis: CodeAnalysis,
  manifest: FrameworkManifest,
  expectedTestCaseId: string,
): GateResult {
  const started = Date.now();
  const errors: GateError[] = [];
  const allowedNames = new Set([
    'test',
    'expect',
    'users',
    'seeded',
    'SEED_PASSWORD',
    ...manifest.helpers.map((h) => h.name),
  ]);

  if (analysis.imports.length === 0) {
    errors.push({
      code: 'NO_IMPORT',
      message: 'The file imports nothing. Import test from the fixtures module.',
    });
  }
  for (const imp of analysis.imports) {
    if (!FIXTURES_MODULE.test(imp.module)) {
      errors.push({
        code: 'FORBIDDEN_IMPORT',
        line: imp.line,
        message: `Import from "${imp.module}" is not allowed.`,
        hint: 'Import only from the fixtures module: ../../src/fixtures/test.js',
      });
      continue;
    }
    for (const name of imp.names) {
      if (!allowedNames.has(name)) {
        errors.push({
          code: 'UNKNOWN_IMPORT',
          line: imp.line,
          message: `"${name}" is not exported by the fixtures module.`,
          hint: `Available: ${[...allowedNames].join(', ')}`,
        });
      }
    }
  }

  if (analysis.tests.length === 0) {
    errors.push({ code: 'NO_TEST', message: 'No test() call found.' });
  }
  const expectedTag = `@${expectedTestCaseId}`;
  for (const t of analysis.tests) {
    if (t.tags.length === 0) {
      errors.push({
        code: 'MISSING_TAG',
        line: t.line,
        message: `Test "${t.title}" has no tag.`,
        hint: `Add { tag: '${expectedTag}' } as the second argument.`,
      });
    } else if (!t.tags.includes(expectedTag)) {
      errors.push({
        code: 'WRONG_TAG',
        line: t.line,
        message: `Test "${t.title}" is tagged ${t.tags.join(', ')} but this run is for ${expectedTestCaseId}.`,
        hint: `Use { tag: '${expectedTag}' }.`,
      });
    }
  }

  for (const call of analysis.pageCalls) {
    errors.push({
      code: 'RAW_PAGE_CALL',
      line: call.line,
      message: `page.${call.method}() is not allowed in a spec.`,
      hint: 'Use a page object through app.<pageObject>.<method>().',
    });
  }
  for (const url of analysis.absoluteUrls) {
    errors.push({
      code: 'ABSOLUTE_URL',
      line: url.line,
      message: `Absolute URL "${url.text}".`,
      hint: 'Navigate with a page object goto() method; the base URL is configuration.',
    });
  }
  for (const f of analysis.forbidden) {
    errors.push({
      code: 'FORBIDDEN_CONSTRUCT',
      line: f.line,
      message: `${f.what} is not allowed in a spec.`,
    });
  }

  return {
    gate: 'G1',
    name: 'Structural policy',
    passed: errors.length === 0,
    durationMs: Date.now() - started,
    errors,
  };
}
