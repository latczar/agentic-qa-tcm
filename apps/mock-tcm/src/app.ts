import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { TcmConfig } from './config.js';
import type { SeedCase } from './domain/seed-loader.js';
import { apiRoutes } from './http/api.js';
import { uiRoutes } from './http/ui.js';
import type { CaseRepository } from './repo/cases.js';

const packageRoot = path.resolve(import.meta.dirname, '..');

export function createApp(
  repo: CaseRepository,
  seed: SeedCase[],
  config: TcmConfig,
): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(packageRoot, 'views'));
  app.locals.appName = 'Mock TCM';

  app.use(express.static(path.join(packageRoot, 'public')));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use('/api', apiRoutes(repo, seed, config.testMode));
  app.use(uiRoutes(repo));

  app.use((req: Request, res: Response) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: `No route ${req.method} ${req.path}` });
      return;
    }
    res
      .status(404)
      .render('error', { title: 'Not found', message: `There is no page at ${req.path}.` });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    if (req.path.startsWith('/api/')) {
      res.status(500).json({ error: 'Internal error. See the server log.' });
      return;
    }
    res
      .status(500)
      .render('error', { title: 'Something went wrong', message: 'See the server log.' });
  });

  return app;
}
