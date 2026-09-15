import { Router } from 'express';
import { SEED_VERSION } from '../../domain/seed.js';
import type { InMemoryStore } from '../../domain/store.js';

const startedAt = Date.now();

/** Liveness and identity. Always mounted. */
export function healthRoutes(testMode: boolean): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'hr-portal',
      seedVersion: SEED_VERSION,
      testMode,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });
  return router;
}

/** Test-only controls. Mounted under /__test__ only when test mode is on. */
export function testSupportRoutes(store: InMemoryStore): Router {
  const router = Router();
  router.post('/reset', (_req, res) => {
    store.reset();
    res.json({ ok: true, seedVersion: SEED_VERSION });
  });
  return router;
}
