import { Router, type Response } from 'express';
import { todayIso } from '../../domain/dates.js';
import {
  formatPence,
  validateExpense,
  type ExpenseField,
  type ExpenseInput,
} from '../../domain/expenses.js';
import type { InMemoryStore } from '../../domain/store.js';
import { EXPENSE_CATEGORIES, type Expense, type FieldErrors } from '../../domain/types.js';
import { currentUser, field, fullName, requireAuth, setFlash } from '../middleware.js';

export function expensesRoutes(store: InMemoryStore): Router {
  const router = Router();
  router.use(requireAuth);

  const renderForm = (
    res: Response,
    status: number,
    values: ExpenseInput,
    errors: FieldErrors<ExpenseField>,
  ) => {
    res.status(status).render('expenses/form', {
      title: 'Submit an expense',
      values,
      errors,
      categories: EXPENSE_CATEGORIES,
    });
  };

  router.get('/', (_req, res) => {
    const user = currentUser(res);
    const expenses = store.expensesFor(user.id);
    res.render('expenses/index', {
      title: 'My expenses',
      expenses,
      pendingTotal: formatPence(
        expenses.filter((x) => x.status === 'pending').reduce((s, x) => s + x.amountPence, 0),
      ),
      deciderName: (x: Expense) =>
        fullName(x.decidedById ? store.getEmployee(x.decidedById) : undefined),
    });
  });

  router.get('/new', (_req, res) => {
    renderForm(
      res,
      200,
      { category: 'travel', amount: '', description: '', incurredOn: todayIso() },
      {},
    );
  });

  router.post('/', (req, res) => {
    const user = currentUser(res);
    const values: ExpenseInput = {
      category: field(req.body, 'category'),
      amount: field(req.body, 'amount'),
      description: field(req.body, 'description'),
      incurredOn: field(req.body, 'incurredOn'),
    };
    const result = validateExpense(values, todayIso());
    if (!result.ok) {
      renderForm(res, 422, values, result.errors);
      return;
    }
    const created = store.addExpense({ employeeId: user.id, ...result.value });
    setFlash(req, {
      kind: 'success',
      message: `Expense of ${formatPence(created.amountPence)} submitted for approval.`,
    });
    res.redirect('/expenses');
  });

  return router;
}
