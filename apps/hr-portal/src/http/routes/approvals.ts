import { Router } from 'express';
import { canDecideFor, pendingExpensesFor, pendingLeaveFor } from '../../domain/approvals.js';
import { formatPence } from '../../domain/expenses.js';
import { remainingAnnualLeave } from '../../domain/leave.js';
import type { InMemoryStore } from '../../domain/store.js';
import type { Employee } from '../../domain/types.js';
import {
  currentUser,
  field,
  fullName,
  notFound,
  requireAuth,
  requireRole,
  setFlash,
} from '../middleware.js';

type Decision = 'approve' | 'reject';

export function approvalsRoutes(store: InMemoryStore): Router {
  const router = Router();
  router.use(requireAuth, requireRole('manager', 'admin'));

  router.get('/', (_req, res) => {
    const approver = currentUser(res);
    res.render('approvals/index', {
      title: 'Approvals',
      leave: pendingLeaveFor(store, approver),
      expenses: pendingExpensesFor(store, approver),
      remainingFor: (requester: Employee) =>
        remainingAnnualLeave(requester, store.leaveFor(requester.id)),
    });
  });

  router.post('/leave/:id/:decision', (req, res) => {
    const approver = currentUser(res);
    const decision = parseDecision(req.params.decision);
    const request = store.getLeave(req.params.id);
    const requester = request ? store.getEmployee(request.employeeId) : undefined;
    if (!decision || !request || !requester || !canDecideFor(approver, requester)) {
      return notFound(res, 'That leave request');
    }
    if (request.status !== 'pending') {
      setFlash(req, { kind: 'error', message: 'This request has already been decided.' });
      return res.redirect('/approvals');
    }
    const comment = field(req.body, 'comment').trim();
    if (decision === 'reject' && comment === '') {
      setFlash(req, { kind: 'error', message: 'Add a comment explaining the rejection.' });
      return res.redirect('/approvals');
    }
    store.updateLeave(request.id, {
      status: decision === 'approve' ? 'approved' : 'rejected',
      decidedById: approver.id,
      decisionComment: comment === '' ? null : comment,
    });
    setFlash(req, {
      kind: 'success',
      message: `Leave request for ${fullName(requester)} ${decision === 'approve' ? 'approved' : 'rejected'}.`,
    });
    res.redirect('/approvals');
  });

  router.post('/expenses/:id/:decision', (req, res) => {
    const approver = currentUser(res);
    const decision = parseDecision(req.params.decision);
    const expense = store.getExpense(req.params.id);
    const requester = expense ? store.getEmployee(expense.employeeId) : undefined;
    if (!decision || !expense || !requester || !canDecideFor(approver, requester)) {
      return notFound(res, 'That expense claim');
    }
    if (expense.status !== 'pending') {
      setFlash(req, { kind: 'error', message: 'This claim has already been decided.' });
      return res.redirect('/approvals');
    }
    const comment = field(req.body, 'comment').trim();
    if (decision === 'reject' && comment === '') {
      setFlash(req, { kind: 'error', message: 'Add a comment explaining the rejection.' });
      return res.redirect('/approvals');
    }
    store.updateExpense(expense.id, {
      status: decision === 'approve' ? 'approved' : 'rejected',
      decidedById: approver.id,
      decisionComment: comment === '' ? null : comment,
    });
    setFlash(req, {
      kind: 'success',
      message: `Expense of ${formatPence(expense.amountPence)} for ${fullName(requester)} ${decision === 'approve' ? 'approved' : 'rejected'}.`,
    });
    res.redirect('/approvals');
  });

  return router;
}

function parseDecision(value: string): Decision | null {
  return value === 'approve' || value === 'reject' ? value : null;
}
