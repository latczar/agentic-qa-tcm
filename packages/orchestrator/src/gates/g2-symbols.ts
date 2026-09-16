import type { FrameworkManifest, PageObjectInfo } from '@aiqa/framework-manifest';
import { didYouMean, symbolsOf } from '@aiqa/mcp-server';
import type { GateError, GateResult, SelfReport } from '../domain/types.js';
import type { CodeAnalysis } from './analysis.js';

/**
 * G2: every symbol the spec uses exists in the manifest: page objects, methods, locators,
 * fixtures, users, seeded ids, helpers. Arity is checked for method calls. Every error carries
 * the nearest real name, so the retry prompt can say "you meant submitRequest".
 * Also compares the model's claimed methods with the ones actually used.
 */
export function gateSymbols(
  analysis: CodeAnalysis,
  manifest: FrameworkManifest,
  claimedMethods: string[],
): { result: GateResult; selfReport: SelfReport } {
  const started = Date.now();
  const errors: GateError[] = [];
  const symbols = symbolsOf(manifest);
  const byField = new Map<string, PageObjectInfo>();
  const fieldByClassName = new Map<string, string>();
  for (const a of manifest.app) {
    const po = manifest.pageObjects.find((p) => p.name === a.className);
    if (po) byField.set(a.field, po);
    fieldByClassName.set(a.className, a.field);
  }
  /** "LeavePage.expectRemaining" -> "app.leave.expectRemaining", the form a spec actually uses. */
  const asAppCall = (symbolId: string): string => {
    const [owner, member] = symbolId.split('.');
    const field = owner ? fieldByClassName.get(owner) : undefined;
    return field ? `app.${field}.${member}` : symbolId;
  };
  const fixtureNames = new Set(manifest.fixtures.map((f) => f.name));
  const userKeys = new Set(manifest.users.map((u) => u.key));
  const seededKeys = new Set(manifest.seeded.map((s) => s.key));
  const helperNames = new Set(manifest.helpers.map((h) => h.name));
  const actualMethods = new Set<string>();

  for (const ref of analysis.appRefs) {
    const po = byField.get(ref.field);
    if (!po) {
      errors.push({
        code: 'UNKNOWN_PAGE_OBJECT',
        line: ref.line,
        message: `app.${ref.field} does not exist.`,
        hint: `Available: ${[...byField.keys()].map((f) => `app.${f}`).join(', ')}`,
      });
      continue;
    }
    const method = po.methods.find((m) => m.name === ref.member);
    const locator = po.locators.find((l) => l.name === ref.member);
    if (!method && !locator) {
      // Search every page object, not just this one: the model often has the right method
      // name but the wrong object (e.g. app.leaveForm.expectRemaining instead of app.leave.expectRemaining).
      const suggestions = didYouMean(
        symbols.filter((s) => s.kind === 'method' || s.kind === 'locator'),
        ref.member,
      ).map(asAppCall);
      errors.push({
        code: 'UNKNOWN_MEMBER',
        line: ref.line,
        message: `${po.name} (app.${ref.field}) has no member "${ref.member}".`,
        hint: suggestions.length
          ? `Did you mean ${suggestions.join(' or ')}? Methods on ${po.name}: ${po.methods.map((m) => m.name).join(', ')}.`
          : `Methods on ${po.name}: ${po.methods.map((m) => m.name).join(', ')}.`,
      });
      continue;
    }
    if (method) {
      actualMethods.add(`${po.name}.${method.name}`);
      if (ref.isCall) {
        const required = method.params.filter((p) => !p.optional).length;
        if (ref.args < required || ref.args > method.params.length) {
          errors.push({
            code: 'WRONG_ARITY',
            line: ref.line,
            message: `${po.name}.${method.name} was called with ${ref.args} argument(s) but takes ${describeArity(required, method.params.length)}.`,
            hint: `${method.name}(${method.params.map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')})`,
          });
        }
      }
    } else if (locator && ref.isCall) {
      errors.push({
        code: 'LOCATOR_CALLED',
        line: ref.line,
        message: `${po.name}.${ref.member} is a locator, not a method.`,
        hint: `Use it inside expect(...), for example await expect(app.${ref.field}.${ref.member}).toBeVisible().`,
      });
    }
  }

  for (const t of analysis.tests) {
    for (const f of t.fixtures) {
      if (!fixtureNames.has(f)) {
        errors.push({
          code: 'UNKNOWN_FIXTURE',
          line: t.line,
          message: `"${f}" is not a fixture.`,
          hint: `Available fixtures: ${[...fixtureNames].join(', ')}`,
        });
      }
    }
  }
  for (const u of analysis.userKeys) {
    if (!userKeys.has(u.key)) {
      errors.push({
        code: 'UNKNOWN_USER',
        line: u.line,
        message: `users.${u.key} does not exist.`,
        hint: `Available: ${[...userKeys].map((k) => `users.${k}`).join(', ')}`,
      });
    }
  }
  for (const s of analysis.seededKeys) {
    if (!seededKeys.has(s.key)) {
      errors.push({
        code: 'UNKNOWN_SEEDED',
        line: s.line,
        message: `seeded.${s.key} does not exist.`,
        hint: `Available: ${[...seededKeys].map((k) => `seeded.${k}`).join(', ')}`,
      });
    }
  }
  const importedHelpers = new Set(
    analysis.imports.flatMap((i) => i.names).filter((n) => helperNames.has(n)),
  );
  for (const call of analysis.functionCalls) {
    if (helperNames.has(call.name) && !importedHelpers.has(call.name)) {
      errors.push({
        code: 'HELPER_NOT_IMPORTED',
        line: call.line,
        message: `${call.name}() is used but not imported from the fixtures module.`,
      });
    }
  }

  const claimed = [...new Set(claimedMethods)];
  const hits = claimed.filter((c) => actualMethods.has(c)).length;
  const selfReport: SelfReport = {
    claimedMethods: claimed,
    actualMethods: [...actualMethods].sort(),
    accuracy: claimed.length ? hits / claimed.length : null,
  };

  return {
    selfReport,
    result: {
      gate: 'G2',
      name: 'Symbol existence',
      passed: errors.length === 0,
      durationMs: Date.now() - started,
      errors,
      details: { selfReportAccuracy: selfReport.accuracy },
    },
  };
}

function describeArity(required: number, total: number): string {
  if (required === total) return `${total}`;
  return `${required} to ${total}`;
}
