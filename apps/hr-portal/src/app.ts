import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import type { AppConfig } from './config.js';
import { formatDate } from './domain/dates.js';
import { formatPence } from './domain/expenses.js';
import type { InMemoryStore } from './domain/store.js';
import { attachCurrentUser, consumeFlash, renderError } from './http/middleware.js';
import { approvalsRoutes } from './http/routes/approvals.js';
import { authRoutes, SESSION_COOKIE } from './http/routes/auth.js';
import { dashboardRoutes } from './http/routes/dashboard.js';
import { employeesRoutes } from './http/routes/employees.js';
import { expensesRoutes } from './http/routes/expenses.js';
import { leaveRoutes } from './http/routes/leave.js';
import { healthRoutes, testSupportRoutes } from './http/routes/support.js';

const packageRoot = path.resolve(import.meta.dirname, '..');

/**
 * Builds the Express application. Kept separate from `server.ts` so tests can construct an
 * app around their own store without opening a port.
 */
export function createApp(store: InMemoryStore, config: AppConfig): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(packageRoot, 'views'));

  // Helpers available inside every template.
  app.locals.appName = 'Harbour HR';
  app.locals.formatDate = formatDate;
  app.locals.formatPence = formatPence;
  app.locals.capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  app.use(express.static(path.join(packageRoot, 'public')));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      name: SESSION_COOKIE,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
    }),
  );
  app.use(attachCurrentUser(store));
  app.use(consumeFlash);

  app.use(healthRoutes(config.testMode));
  if (config.testMode) app.use('/__test__', testSupportRoutes(store));

  app.use(authRoutes(store));
  app.use(dashboardRoutes(store));
  app.use('/employees', employeesRoutes(store));
  app.use('/leave', leaveRoutes(store));
  app.use('/expenses', expensesRoutes(store));
  app.use('/approvals', approvalsRoutes(store));

  app.use((req: Request, res: Response) => {
    renderError(res, 404, 'Page not found', `There is no page at ${req.path}.`);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    renderError(
      res,
      500,
      'Something went wrong',
      'An unexpected error occurred. The details are in the server log.',
    );
  });

  return app;
}
