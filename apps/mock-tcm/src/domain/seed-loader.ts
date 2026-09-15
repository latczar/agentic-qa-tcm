import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { TcmAutomationStatus } from '@aiqa/shared';
import { parse } from 'yaml';
import { FEATURES, PRIORITIES, type CaseContent, type TestStep } from './types.js';
import { isAutomationStatus } from './transitions.js';

/** A case as written in the YAML seed files. */
export interface SeedCase extends CaseContent {
  id: string;
  automation_status: TcmAutomationStatus;
  automation_ref: string | null;
}

const ID = /^TC-\d{3,}$/;

/** Reads every *.yaml file in the directory, validates each case, and returns them sorted by id. */
export async function loadSeedCases(dir: string): Promise<SeedCase[]> {
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();
  const cases: SeedCase[] = [];
  for (const file of files) {
    const parsed: unknown = parse(await readFile(path.join(dir, file), 'utf8'));
    if (!Array.isArray(parsed)) throw new Error(`${file}: expected a list of test cases`);
    parsed.forEach((raw, index) => cases.push(validateSeedCase(raw, `${file}[${index}]`)));
  }
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`Duplicate test case id ${c.id} in seed`);
    ids.add(c.id);
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

export function validateSeedCase(raw: unknown, where: string): SeedCase {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: not an object`);
  const r = raw as Record<string, unknown>;
  const fail = (message: string): never => {
    throw new Error(`${where} (${String(r.id ?? '?')}): ${message}`);
  };

  if (typeof r.id !== 'string' || !ID.test(r.id)) fail('id must look like TC-001');
  if (typeof r.title !== 'string' || r.title.trim() === '') fail('title is required');
  if (!(FEATURES as readonly unknown[]).includes(r.feature))
    fail(`feature must be one of ${FEATURES.join(', ')}`);
  if (!(PRIORITIES as readonly unknown[]).includes(r.priority))
    fail(`priority must be one of ${PRIORITIES.join(', ')}`);
  if (!Array.isArray(r.steps) || r.steps.length === 0) fail('at least one step is required');
  const steps: TestStep[] = (r.steps as unknown[]).map((s, i) => {
    if (typeof s !== 'object' || s === null) return fail(`step ${i + 1} is not an object`);
    const step = s as Record<string, unknown>;
    if (typeof step.action !== 'string' || typeof step.expected !== 'string') {
      return fail(`step ${i + 1} needs action and expected`);
    }
    return { action: step.action.trim(), expected: step.expected.trim() };
  });
  const status = r.automation_status ?? TcmAutomationStatus.NOT_PLANNED;
  if (!isAutomationStatus(status)) fail(`unknown automation_status ${String(status)}`);
  if (status === TcmAutomationStatus.AUTOMATED && typeof r.automation_ref !== 'string') {
    fail('an AUTOMATED case must have automation_ref');
  }

  return {
    id: r.id as string,
    title: (r.title as string).trim(),
    feature: r.feature as SeedCase['feature'],
    priority: r.priority as SeedCase['priority'],
    preconditions: typeof r.preconditions === 'string' ? r.preconditions.trim() : '',
    steps,
    test_data:
      typeof r.test_data === 'object' && r.test_data !== null
        ? (r.test_data as Record<string, unknown>)
        : {},
    automation_status: status as TcmAutomationStatus,
    automation_ref: typeof r.automation_ref === 'string' ? r.automation_ref : null,
  };
}
