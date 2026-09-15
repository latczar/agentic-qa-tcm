import path from 'node:path';
import type { GateError, GateResult } from '../domain/types.js';
import { runNode, toolEntry } from './process.js';

/** G3: the framework still type-checks with the candidate in place. Only the candidate's errors count. */
export async function gateTypescript(
  frameworkRoot: string,
  candidateAbsPath: string,
): Promise<GateResult> {
  const result = await runNode(
    toolEntry('tsc'),
    ['-p', 'tsconfig.json', '--noEmit', '--pretty', 'false'],
    {
      cwd: frameworkRoot,
      timeoutMs: 120_000,
    },
  );
  const candidateRel = path.relative(frameworkRoot, candidateAbsPath).split(path.sep).join('/');
  const errors: GateError[] = [];
  const other: string[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim());
    if (!m) continue;
    const file = (m[1] ?? '').split(path.sep).join('/');
    if (file.endsWith(candidateRel)) {
      errors.push({ code: m[4] ?? 'TS', line: Number(m[2]), message: m[5] ?? line });
    } else {
      other.push(line.trim());
    }
  }
  if (result.timedOut)
    errors.push({ code: 'TIMEOUT', message: 'tsc did not finish within 120 seconds.' });
  return {
    gate: 'G3',
    name: 'TypeScript',
    passed: errors.length === 0,
    durationMs: result.durationMs,
    errors,
    details: other.length ? { errorsOutsideCandidate: other.slice(0, 5) } : undefined,
  };
}
