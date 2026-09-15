import { Router, type Response } from 'express';
import {
  validateEmployee,
  type EmployeeField,
  type EmployeeInput,
} from '../../domain/employees.js';
import type { InMemoryStore } from '../../domain/store.js';
import { DEPARTMENTS, ROLES, type Employee, type FieldErrors } from '../../domain/types.js';
import {
  currentUser,
  field,
  fullName,
  notFound,
  requireAuth,
  requireRole,
  setFlash,
} from '../middleware.js';

type IdParams = { id: string };

export function employeesRoutes(store: InMemoryStore): Router {
  const router = Router();
  router.use(requireAuth);

  const renderForm = (
    res: Response,
    status: number,
    mode: 'create' | 'edit',
    id: string | null,
    values: EmployeeInput,
    errors: FieldErrors<EmployeeField>,
  ) => {
    res.status(status).render('employees/form', {
      title: mode === 'create' ? 'Add employee' : 'Edit employee',
      mode,
      id,
      values,
      errors,
      roles: ROLES,
      departments: DEPARTMENTS,
      managers: store
        .listEmployees()
        .filter((e) => e.active && e.role !== 'employee' && e.id !== id),
    });
  };

  router.get('/', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const needle = q.toLowerCase();
    const employees = store
      .listEmployees()
      .filter(
        (e) =>
          needle === '' ||
          [`${e.firstName} ${e.lastName}`, e.email, e.department, e.jobTitle].some((v) =>
            v.toLowerCase().includes(needle),
          ),
      );
    res.render('employees/index', {
      title: 'Employees',
      employees,
      q,
      canManage: currentUser(res).role === 'admin',
      managerName: (e: Employee) =>
        fullName(e.managerId ? store.getEmployee(e.managerId) : undefined),
    });
  });

  router.get('/new', requireRole('admin'), (_req, res) => {
    renderForm(res, 200, 'create', null, emptyInput(), {});
  });

  router.post('/', requireRole('admin'), (req, res) => {
    const values = readInput(req.body);
    const result = validateEmployee(values, { existing: store.listEmployees(), editingId: null });
    if (!result.ok) {
      renderForm(res, 422, 'create', null, values, result.errors);
      return;
    }
    const { password, ...rest } = result.value;
    // Validation guarantees a password when creating; the fallback only satisfies the type.
    const created = store.addEmployee({ ...rest, password: password ?? '', active: true });
    setFlash(req, { kind: 'success', message: `${fullName(created)} has been added.` });
    res.redirect(`/employees/${created.id}`);
  });

  router.get('/:id', (req, res) => {
    const employee = store.getEmployee(req.params.id);
    if (!employee) return notFound(res, 'That employee');
    res.render('employees/show', {
      title: fullName(employee),
      employee,
      manager: employee.managerId ? store.getEmployee(employee.managerId) : undefined,
      canManage: currentUser(res).role === 'admin',
    });
  });

  // Adding middleware to a route chain makes Express's types fall back to a loose params type,
  // so the admin routes below name their params explicitly.
  router.get<IdParams>('/:id/edit', requireRole('admin'), (req, res) => {
    const employee = store.getEmployee(req.params.id);
    if (!employee) return notFound(res, 'That employee');
    renderForm(res, 200, 'edit', employee.id, toInput(employee), {});
  });

  router.post<IdParams>('/:id', requireRole('admin'), (req, res) => {
    const employee = store.getEmployee(req.params.id);
    if (!employee) return notFound(res, 'That employee');
    const values = readInput(req.body);
    const result = validateEmployee(values, {
      existing: store.listEmployees(),
      editingId: employee.id,
    });
    if (!result.ok) {
      renderForm(res, 422, 'edit', employee.id, values, result.errors);
      return;
    }
    const { password, ...rest } = result.value;
    store.updateEmployee(employee.id, password === null ? rest : { ...rest, password });
    setFlash(req, {
      kind: 'success',
      message: `${rest.firstName} ${rest.lastName} has been updated.`,
    });
    res.redirect(`/employees/${employee.id}`);
  });

  router.post<IdParams>('/:id/deactivate', requireRole('admin'), (req, res) => {
    const employee = store.getEmployee(req.params.id);
    if (!employee) return notFound(res, 'That employee');
    if (employee.id === currentUser(res).id) {
      setFlash(req, { kind: 'error', message: 'You cannot deactivate your own account.' });
    } else {
      store.updateEmployee(employee.id, { active: false });
      setFlash(req, { kind: 'success', message: `${fullName(employee)} has been deactivated.` });
    }
    res.redirect('/employees');
  });

  router.post<IdParams>('/:id/reactivate', requireRole('admin'), (req, res) => {
    const employee = store.getEmployee(req.params.id);
    if (!employee) return notFound(res, 'That employee');
    store.updateEmployee(employee.id, { active: true });
    setFlash(req, { kind: 'success', message: `${fullName(employee)} has been reactivated.` });
    res.redirect('/employees');
  });

  return router;
}

function emptyInput(): EmployeeInput {
  return {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'employee',
    department: '',
    jobTitle: '',
    managerId: '',
    startDate: '',
    annualLeaveAllowance: '25',
  };
}

function readInput(body: unknown): EmployeeInput {
  return {
    firstName: field(body, 'firstName'),
    lastName: field(body, 'lastName'),
    email: field(body, 'email'),
    password: field(body, 'password'),
    role: field(body, 'role'),
    department: field(body, 'department'),
    jobTitle: field(body, 'jobTitle'),
    managerId: field(body, 'managerId'),
    startDate: field(body, 'startDate'),
    annualLeaveAllowance: field(body, 'annualLeaveAllowance'),
  };
}

function toInput(e: Employee): EmployeeInput {
  return {
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    password: '',
    role: e.role,
    department: e.department,
    jobTitle: e.jobTitle,
    managerId: e.managerId ?? '',
    startDate: e.startDate,
    annualLeaveAllowance: String(e.annualLeaveAllowance),
  };
}
