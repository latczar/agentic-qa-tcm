import { readFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { RunStatus } from '@aiqa/shared';
import { loadConfig } from '../config.js';
import { parseGeneratedTest } from '../domain/output-schema.js';
import { executeRun, startRun, type PipelineDeps } from '../pipeline/run-pipeline.js';
import { applyReview } from '../pipeline/review.js';
import { renderDetail, renderInbox, renderMessage } from './review-pages.js';
import { wire } from '../wiring.js';

/**
 * Small HTTP surface for n8n and people.
 *   POST /runs { test_case_id, version?, scenario? }  -> 202 created | 200 existing (idempotent)
 *   GET  /runs                                        -> recent runs
 *   GET  /runs/:id                                    -> run with attempts
 *   POST /runs/:id/retry                              -> resume a DEFERRED run
 *   POST /runs/:id/review { decision, reviewer, comment? } -> approve/reject (JSON, for n8n)
 *   GET  /review, GET /review/:id                     -> human review pages
 *   POST /review/:id/decide                           -> the review page's approve/reject form
 *   GET  /health
 * Runs execute one at a time in the background: the gates share one application and one browser.
 */
export function createApi(getDeps: (scenario?: string) => Promise<PipelineDeps>): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  let queue: Promise<unknown> = Promise.resolve();

  app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'orchestrator' }));

  app.post('/runs', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const testCaseId = typeof body.test_case_id === 'string' ? body.test_case_id : '';
    if (!/^TC-\d+$/.test(testCaseId)) {
      res.status(400).json({ error: 'test_case_id must look like TC-014' });
      return;
    }
    const version = body.version === undefined ? undefined : Number(body.version);
    const scenario = typeof body.scenario === 'string' ? body.scenario : undefined;
    const deps = await getDeps(scenario);
    const { created, run } = await startRun(deps, testCaseId, version);
    if (created) {
      queue = queue.then(() =>
        executeRun(deps, run.id).catch((e) => deps.log?.(`run ${run.id} crashed: ${String(e)}`)),
      );
    }
    res.status(created ? 202 : 200).json({ created, run });
  });

  app.get('/runs', async (_req, res) => {
    const deps = await getDeps();
    res.json({ runs: await deps.runs.list() });
  });

  app.get('/runs/:id', async (req, res) => {
    const deps = await getDeps();
    const run = await deps.runs.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ run, attempts: await deps.runs.attempts(run.id) });
  });

  // Resumes a DEFERRED run in place: same run id, no re-claim, picks up where executeRun left off.
  app.post('/runs/:id/retry', async (req, res) => {
    const deps = await getDeps();
    const run = await deps.runs.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (run.status !== RunStatus.DEFERRED) {
      res.status(409).json({ error: `run is ${run.status}, not DEFERRED` });
      return;
    }
    queue = queue.then(() =>
      executeRun(deps, run.id).catch((e) => deps.log?.(`run ${run.id} crashed: ${String(e)}`)),
    );
    res.status(202).json({ run });
  });

  // JSON review decision, for n8n and scripts.
  app.post('/runs/:id/review', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const decision =
      body.decision === 'approve' || body.decision === 'reject' ? body.decision : null;
    const reviewer = typeof body.reviewer === 'string' ? body.reviewer.trim() : '';
    if (!decision || !reviewer) {
      res
        .status(400)
        .json({ error: 'decision must be "approve" or "reject", reviewer is required' });
      return;
    }
    const comment =
      typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;
    const deps = await getDeps();
    const outcome = await applyReview(deps, req.params.id, { decision, reviewer, comment });
    if (!outcome.ok) {
      res.status(outcome.reason === 'not_found' ? 404 : 409).json({ error: outcome.reason });
      return;
    }
    res.json({ run: outcome.run });
  });

  // Human review pages: plain server-rendered HTML, no client framework.
  app.get('/review', async (_req, res) => {
    const deps = await getDeps();
    res.type('html').send(renderInbox(await deps.runs.list()));
  });

  app.get('/review/:id', async (req, res) => {
    const deps = await getDeps();
    const run = await deps.runs.get(req.params.id);
    if (!run) {
      res
        .status(404)
        .type('html')
        .send(renderMessage('Not found', `No run ${req.params.id}.`));
      return;
    }
    const [testCase, attempts] = await Promise.all([
      deps.tcm.getCase(run.testCaseId),
      deps.runs.attempts(run.id),
    ]);
    const lastAttempt = attempts.at(-1) ?? null;
    let code: string | null = null;
    if (run.candidatePath) {
      code = await readFile(path.join(deps.frameworkRoot, run.candidatePath), 'utf8').catch(
        () => null,
      );
    }
    const parsedResult = lastAttempt?.rawResponse
      ? parseGeneratedTest(lastAttempt.rawResponse)
      : null;
    res.type('html').send(
      renderDetail({
        run,
        testCase,
        code,
        lastAttempt,
        parsed: parsedResult?.ok ? parsedResult.value : null,
      }),
    );
  });

  app.post('/review/:id/decide', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const decision =
      body.decision === 'approve' || body.decision === 'reject' ? body.decision : null;
    const reviewer = typeof body.reviewer === 'string' ? body.reviewer.trim() : '';
    if (!decision || !reviewer) {
      res
        .status(400)
        .type('html')
        .send(renderMessage('Missing information', 'Reviewer name and a decision are required.'));
      return;
    }
    const comment =
      typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;
    const deps = await getDeps();
    const outcome = await applyReview(deps, req.params.id, { decision, reviewer, comment });
    if (!outcome.ok) {
      res
        .status(outcome.reason === 'not_found' ? 404 : 409)
        .type('html')
        .send(
          renderMessage(
            'Could not record decision',
            outcome.reason === 'not_found'
              ? `No run ${req.params.id}.`
              : 'This run already has a decision.',
          ),
        );
      return;
    }
    res.redirect(303, `/review/${req.params.id}`);
  });

  return app;
}

const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*\//, ''));
if (isMain) {
  const config = loadConfig();
  const cache = new Map<string, Promise<PipelineDeps>>();
  const getDeps = (scenario?: string) => {
    const key = scenario ?? '';
    if (!cache.has(key))
      cache.set(key, wire({ config, scenario: scenario ?? process.env.LLM_SCENARIO }));
    return cache.get(key)!;
  };
  createApi(getDeps).listen(config.port, () => {
    console.log(
      `Orchestrator API listening on http://localhost:${config.port} (provider ${config.provider})`,
    );
  });
}
