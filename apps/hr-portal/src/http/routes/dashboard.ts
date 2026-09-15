import { Router } from 'express';
import { pendingExpensesFor, pendingLeaveFor } from '../../domain/approvals.js';
import { remainingAnnualLeave } from '../../domain/leave.js';
import type { InMemoryStore } from '../../domain/store.js';
import { currentUser, requireAuth } from '../middleware.js';

export function dashboardRoutes(store: InMemoryStore): Router {
  const router = Router();

  router.get('/', requireAuth, (_req, res) => {
    const user = currentUser(res);
    const myLeave = store.leaveFor(user.id);
    const myExpenses = store.expensesFor(user.id);
    const awaiting =
      user.role === 'employee'
        ? null
        : {
            leave: pendingLeaveFor(store, user).length,
            expenses: pendingExpensesFor(store, user).length,
          };

    res.render('dashboard', {
      title: 'Dashboard',
      remaining: remainingAnnualLeave(user, myLeave),
      pendingLeave: myLeave.filter((r) => r.status === 'pending').length,
      pendingExpenses: myExpenses.filter((x) => x.status === 'pending').length,
      awaiting,
    });
  });

  return router;
}
