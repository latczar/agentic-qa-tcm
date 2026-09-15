import type { NextFunction, Request, Response } from 'express';
import type { InMemoryStore } from '../domain/store.js';
import type { Employee, Role } from '../domain/types.js';
import type { Flash } from './session.js';

/** Resolves the session's user id to an active employee and exposes it to routes and templates. */
export function attachCurrentUser(store: InMemoryStore) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.session.userId ? store.getEmployee(req.session.userId) : undefined;
    if (req.session.userId && (!user || !user.active)) {
      // The account was removed or deactivated after sign-in. Drop the session silently.
      delete req.session.userId;
    }
    res.locals.currentUser = user && user.active ? user : null;
    next();
  };
}

/** Moves a pending flash message from the session into template locals, then clears it. */
export function consumeFlash(req: Request, res: Response, next: NextFunction): void {
  res.locals.flash = req.session.flash ?? null;
  delete req.session.flash;
  next();
}

export function setFlash(req: Request, flash: Flash): void {
  req.session.flash = flash;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!res.locals.currentUser) {
    res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = currentUser(res);
    if (!roles.includes(user.role)) {
      renderError(res, 403, 'Not allowed', 'Your role does not have access to this page.');
      return;
    }
    next();
  };
}

/** Only call behind requireAuth. */
export function currentUser(res: Response): Employee {
  const user = res.locals.currentUser as Employee | null;
  if (!user) throw new Error('currentUser() called on a request that is not authenticated');
  return user;
}

export function renderError(res: Response, status: number, title: string, message: string): void {
  res.status(status).render('error', { title, status, message });
}

export function notFound(res: Response, what: string): void {
  renderError(res, 404, 'Not found', `${what} could not be found.`);
}

export function fullName(employee: Employee | undefined): string {
  return employee ? `${employee.firstName} ${employee.lastName}` : 'None';
}

/** Reads a string field from a parsed form body. Missing fields become empty strings. */
export function field(body: unknown, name: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}
