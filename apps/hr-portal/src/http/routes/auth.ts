import { Router } from 'express';
import type { InMemoryStore } from '../../domain/store.js';
import { field } from '../middleware.js';

export const SESSION_COOKIE = 'hrportal.sid';

export function authRoutes(store: InMemoryStore): Router {
  const router = Router();

  router.get('/login', (req, res) => {
    if (res.locals.currentUser) {
      res.redirect('/');
      return;
    }
    res.render('login', {
      title: 'Sign in',
      values: { email: '' },
      error: null,
      returnTo: safeReturnTo(req.query.returnTo),
    });
  });

  router.post('/login', (req, res, next) => {
    const email = field(req.body, 'email').trim();
    const password = field(req.body, 'password');
    const returnTo = safeReturnTo(field(req.body, 'returnTo'));
    const user = store.findEmployeeByEmail(email);

    if (!user || user.password !== password) {
      res.status(401).render('login', {
        title: 'Sign in',
        values: { email },
        error: 'Email or password is incorrect.',
        returnTo,
      });
      return;
    }
    if (!user.active) {
      res.status(403).render('login', {
        title: 'Sign in',
        values: { email },
        error: 'This account has been deactivated. Contact People Operations.',
        returnTo,
      });
      return;
    }

    // A fresh session id on sign-in prevents session fixation.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.redirect(returnTo || '/');
      });
    });
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(SESSION_COOKIE);
      res.redirect('/login');
    });
  });

  return router;
}

/** Only allow same-site relative paths, never protocol-relative or absolute URLs. */
function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '';
}
