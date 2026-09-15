import { repoRoot } from '@aiqa/framework-manifest';
import type { GateError, GateResult } from '../domain/types.js';
import { runNode, toolEntry } from './process.js';

interface EslintMessage {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  line: number;
}

/** G4: the framework's lint rules, including the five convention rules from packages/e2e-framework/eslint. */
export async function gateEslint(candidateAbsPath: string): Promise<GateResult> {
  const result = await runNode(toolEntry('eslint'), [candidateAbsPath, '--format', 'json'], {
    cwd: repoRoot,
    timeoutMs: 60_000,
  });
  const errors: GateError[] = [];
  let parsed: Array<{ messages: EslintMessage[] }> = [];
  try {
    parsed = JSON.parse(result.stdout) as Array<{ messages: EslintMessage[] }>;
  } catch {
    errors.push({ code: 'ESLINT_CRASH', message: (result.stderr || result.stdout).slice(0, 500) });
  }
  for (const file of parsed) {
    for (const m of file.messages) {
      if (m.severity !== 2) continue;
      errors.push({ code: m.ruleId ?? 'eslint', line: m.line, message: m.message });
    }
  }
  return {
    gate: 'G4',
    name: 'ESLint',
    passed: errors.length === 0,
    durationMs: result.durationMs,
    errors,
  };
}
