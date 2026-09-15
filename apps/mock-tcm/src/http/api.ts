import { Router } from 'express';
import type { SeedCase } from '../domain/seed-loader.js';
import { isAutomationStatus } from '../domain/transitions.js';
import type { CaseRepository } from '../repo/cases.js';

/**
 * JSON API used by n8n and the orchestrator. Field names follow TestRail's snake_case habit.
 *
 * GET  /api/cases?automation_status=&feature=   list
 * GET  /api/cases/:id                           one case with its history
 * POST /api/cases/:id/claim   { version, run_id }
 *      -> 200 { case } when this caller won, 409 { error, case } otherwise
 * POST /api/cases/:id/automation { status, run_id?, automation_ref?, note? }
 *      -> 200 { case } | 409 { error, case }   (pipeline-owned transitions only)
 * POST /api/__test__/reset                      restore the seed (test mode only)
 */
export function apiRoutes(repo: CaseRepository, seed: SeedCase[], testMode: boolean): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', app: 'mock-tcm', cases: seed.length, testMode });
  });

  router.get('/cases', async (req, res) => {
    const status = req.query.automation_status;
    if (status !== undefined && !isAutomationStatus(status)) {
      res.status(400).json({ error: `Unknown automation_status ${String(status)}` });
      return;
    }
    const feature = typeof req.query.feature === 'string' ? req.query.feature : undefined;
    const cases = await repo.list({ automation_status: status, feature });
    res.json({ cases });
  });

  router.get('/cases/:id', async (req, res) => {
    const testCase = await repo.get(req.params.id);
    if (!testCase) {
      res.status(404).json({ error: `${req.params.id} not found` });
      return;
    }
    res.json({ case: testCase, history: await repo.history(req.params.id) });
  });

  router.post('/cases/:id/claim', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const version = Number(body.version);
    const runId = typeof body.run_id === 'string' ? body.run_id : '';
    if (!Number.isInteger(version) || runId === '') {
      res.status(400).json({ error: 'claim needs an integer version and a run_id' });
      return;
    }
    const result = await repo.transition(req.params.id, 'pipeline', 'AUTOMATION_IN_PROGRESS', {
      expectedVersion: version,
      run_id: runId,
      note: null,
    });
    respond(res, result);
  });

  router.post('/cases/:id/automation', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!isAutomationStatus(body.status)) {
      res.status(400).json({ error: `status must be one of the automation statuses` });
      return;
    }
    const result = await repo.transition(req.params.id, 'pipeline', body.status, {
      run_id: optionalString(body.run_id),
      automation_ref: optionalString(body.automation_ref),
      note: optionalString(body.note),
    });
    respond(res, result);
  });

  if (testMode) {
    router.post('/__test__/reset', async (_req, res) => {
      await repo.replaceAll(seed);
      res.json({ ok: true, cases: seed.length });
    });
  }

  return router;
}

function respond(
  res: import('express').Response,
  result: Awaited<ReturnType<CaseRepository['transition']>>,
) {
  if (result.ok) {
    res.json({ case: result.testCase });
  } else if (result.reason === 'not_found') {
    res.status(404).json({ error: 'not found' });
  } else {
    res.status(409).json({ error: result.message, case: result.testCase });
  }
}

/** undefined means "leave unchanged"; null clears the field. */
function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return String(value);
}
