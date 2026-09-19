import { Router, type Response } from 'express';
import { todayIso } from '../../domain/dates.js';
import {
  plural,
  remainingAnnualLeave,
  validateLeave,
  type LeaveField,
  type LeaveInput,
} from '../../domain/leave.js';
import type { InMemoryStore } from '../../domain/store.js';
import { LEAVE_TYPES, type FieldErrors, type LeaveRequest } from '../../domain/types.js';
import { currentUser, field, fullName, notFound, requireAuth, setFlash } from '../middleware.js';

export function leaveRoutes(store: InMemoryStore): Router {
  const router = Router();
  router.use(requireAuth);

  const renderForm = (
    res: Response,
    status: number,
    values: LeaveInput,
    errors: FieldErrors<LeaveField>,
    remaining: number,
  ) => {
    res.status(status).render('leave/form', {
      title: 'Request leave',
      values,
      errors,
      remaining,
      leaveTypes: LEAVE_TYPES,
    });
  };

  router.get('/', (_req, res) => {
    const user = currentUser(res);
    const requests = store.leaveFor(user.id);
    res.render('leave/index', {
      title: 'My leave',
      requests,
      remaining: remainingAnnualLeave(user, requests),
      allowance: user.annualLeaveAllowance,
      deciderName: (r: LeaveRequest) =>
        fullName(r.decidedById ? store.getEmployee(r.decidedById) : undefined),
    });
  });

  router.get('/new', (_req, res) => {
    const user = currentUser(res);
    const today = todayIso();
    renderForm(
      res,
      200,
      { type: 'annual', startDate: today, endDate: today, reason: '' },
      {},
      remainingAnnualLeave(user, store.leaveFor(user.id)),
    );
  });

  router.post('/', (req, res) => {
    const user = currentUser(res);
    const values: LeaveInput = {
      type: field(req.body, 'type'),
      startDate: field(req.body, 'startDate'),
      endDate: field(req.body, 'endDate'),
      reason: field(req.body, 'reason'),
    };
    const remaining = remainingAnnualLeave(user, store.leaveFor(user.id));
    const result = validateLeave(values, remaining, todayIso());
    if (!result.ok) {
      renderForm(res, 422, values, result.errors, remaining);
      return;
    }
    // Sabotage for G6: pretend to accept the request but never actually store it. The response
    // is identical either way, so only a test that checks the balance or the request list (not
    // just the success message) will notice. Test-only; there is no legitimate reason a real
    // client would send this header.
    if (req.header('X-Sabotage') !== 'leave.submit') {
      store.addLeave({ employeeId: user.id, ...result.value });
    }
    setFlash(req, {
      kind: 'success',
      message: `Leave request submitted for approval (${result.value.workingDays} working ${plural(result.value.workingDays, 'day')}).`,
    });
    res.redirect('/leave');
  });

  router.post('/:id/cancel', (req, res) => {
    const user = currentUser(res);
    const request = store.getLeave(req.params.id);
    if (!request || request.employeeId !== user.id) return notFound(res, 'That leave request');
    if (request.status !== 'pending') {
      setFlash(req, { kind: 'error', message: 'Only pending requests can be cancelled.' });
    } else {
      store.updateLeave(request.id, { status: 'cancelled' });
      setFlash(req, { kind: 'success', message: 'Leave request cancelled.' });
    }
    res.redirect('/leave');
  });

  return router;
}
