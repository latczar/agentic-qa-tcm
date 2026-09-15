import express from 'express';
import { loadConfig } from '../config.js';
import { executeRun, startRun, type PipelineDeps } from '../pipeline/run-pipeline.js';
import { wire } from '../wiring.js';

/**
 * Small HTTP surface for n8n and people.
 *   POST /runs { test_case_id, version?, scenario? }  -> 202 created | 200 existing (idempotent)
 *   GET  /runs                                        -> recent runs
 *   GET  /runs/:id                                    -> run with attempts
 *   GET  /health
 * Runs execute one at a time in the background: the gates share one application and one browser.
 */
export function createApi(getDeps: (scenario?: string) => Promise<PipelineDeps>): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
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
