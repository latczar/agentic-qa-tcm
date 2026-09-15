import { Router } from 'express';
import { TcmAutomationStatus } from '@aiqa/shared';
import { allowedTargets, isAutomationStatus, statusLabel } from '../domain/transitions.js';
import { FEATURES, PRIORITIES, type CaseContent, type TestStep } from '../domain/types.js';
import type { CaseRepository } from '../repo/cases.js';

/** Server-rendered pages for people: browse cases, read one, edit it, request automation. */
export function uiRoutes(repo: CaseRepository): Router {
  const router = Router();

  router.get('/', (_req, res) => res.redirect('/cases'));

  router.get('/cases', async (req, res) => {
    const status = isAutomationStatus(req.query.status) ? req.query.status : undefined;
    const feature =
      typeof req.query.feature === 'string' && req.query.feature !== ''
        ? req.query.feature
        : undefined;
    const cases = await repo.list({ automation_status: status, feature });
    res.render('cases/index', {
      title: 'Test cases',
      cases,
      filter: { status: status ?? '', feature: feature ?? '' },
      statuses: Object.values(TcmAutomationStatus),
      features: FEATURES,
      statusLabel,
    });
  });

  router.get('/cases/:id', async (req, res) => {
    const testCase = await repo.get(req.params.id);
    if (!testCase) {
      res
        .status(404)
        .render('error', { title: 'Not found', message: `${req.params.id} does not exist.` });
      return;
    }
    res.render('cases/show', {
      title: testCase.id,
      testCase,
      history: await repo.history(testCase.id),
      actions: allowedTargets('human', testCase.automation_status),
      statusLabel,
      flash: req.query.flash ?? null,
      flashKind: req.query.kind ?? 'success',
    });
  });

  router.post('/cases/:id/status', async (req, res) => {
    const to = (req.body as Record<string, unknown>).to;
    if (!isAutomationStatus(to)) {
      res.redirect(
        `/cases/${req.params.id}?kind=error&flash=${encodeURIComponent('Unknown status.')}`,
      );
      return;
    }
    const result = await repo.transition(req.params.id, 'human', to, { actorName: 'tcm-ui' });
    const message = result.ok
      ? `${req.params.id} is now ${statusLabel(to)} (version ${result.testCase.version}).`
      : result.reason === 'not_found'
        ? 'Not found.'
        : result.message;
    res.redirect(
      `/cases/${req.params.id}?kind=${result.ok ? 'success' : 'error'}&flash=${encodeURIComponent(message)}`,
    );
  });

  router.get('/cases/:id/edit', async (req, res) => {
    const testCase = await repo.get(req.params.id);
    if (!testCase) {
      res
        .status(404)
        .render('error', { title: 'Not found', message: `${req.params.id} does not exist.` });
      return;
    }
    res.render('cases/edit', {
      title: `Edit ${testCase.id}`,
      testCase,
      values: toFormValues(testCase),
      errors: {},
      features: FEATURES,
      priorities: PRIORITIES,
    });
  });

  router.post('/cases/:id', async (req, res) => {
    const testCase = await repo.get(req.params.id);
    if (!testCase) {
      res
        .status(404)
        .render('error', { title: 'Not found', message: `${req.params.id} does not exist.` });
      return;
    }
    const values = readFormValues(req.body);
    const parsed = parseContent(values);
    if (!parsed.ok) {
      res.status(422).render('cases/edit', {
        title: `Edit ${testCase.id}`,
        testCase,
        values,
        errors: parsed.errors,
        features: FEATURES,
        priorities: PRIORITIES,
      });
      return;
    }
    const updated = await repo.updateContent(testCase.id, parsed.content, 'tcm-ui');
    res.redirect(
      `/cases/${testCase.id}?flash=${encodeURIComponent(`Saved. ${testCase.id} is now version ${updated?.version ?? '?'}.`)}`,
    );
  });

  return router;
}

interface FormValues {
  title: string;
  feature: string;
  priority: string;
  preconditions: string;
  /** One step per line: "action => expected". */
  steps: string;
  /** JSON object. */
  test_data: string;
}

function toFormValues(c: CaseContent): FormValues {
  return {
    title: c.title,
    feature: c.feature,
    priority: c.priority,
    preconditions: c.preconditions,
    steps: c.steps.map((s) => `${s.action} => ${s.expected}`).join('\n'),
    test_data: JSON.stringify(c.test_data, null, 2),
  };
}

function readFormValues(body: unknown): FormValues {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
  return {
    title: str('title'),
    feature: str('feature'),
    priority: str('priority'),
    preconditions: str('preconditions'),
    steps: str('steps'),
    test_data: str('test_data'),
  };
}

function parseContent(
  v: FormValues,
):
  | { ok: true; content: CaseContent }
  | { ok: false; errors: Partial<Record<keyof FormValues, string>> } {
  const errors: Partial<Record<keyof FormValues, string>> = {};
  const title = v.title.trim();
  if (title === '') errors.title = 'Enter a title.';
  if (!(FEATURES as readonly string[]).includes(v.feature)) errors.feature = 'Choose a feature.';
  if (!(PRIORITIES as readonly string[]).includes(v.priority))
    errors.priority = 'Choose a priority.';

  const steps: TestStep[] = [];
  for (const [i, line] of v.steps.split(/\r?\n/).entries()) {
    if (line.trim() === '') continue;
    const [action, expected] = line.split('=>').map((s) => s.trim());
    if (!action || !expected) {
      errors.steps = `Line ${i + 1} must look like "action => expected result".`;
      break;
    }
    steps.push({ action, expected });
  }
  if (!errors.steps && steps.length === 0) errors.steps = 'Add at least one step.';

  let test_data: Record<string, unknown> = {};
  try {
    const parsed: unknown = v.test_data.trim() === '' ? {} : JSON.parse(v.test_data);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
    test_data = parsed as Record<string, unknown>;
  } catch {
    errors.test_data = 'Test data must be a JSON object.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    content: {
      title,
      feature: v.feature as CaseContent['feature'],
      priority: v.priority as CaseContent['priority'],
      preconditions: v.preconditions.trim(),
      steps,
      test_data,
    },
  };
}
