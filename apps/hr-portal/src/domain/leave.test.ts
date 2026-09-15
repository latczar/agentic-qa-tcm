import { describe, expect, it } from 'vitest';
import { isIsoDate, workingDaysBetween } from './dates.js';
import { remainingAnnualLeave, validateLeave } from './leave.js';
import { createSeed } from './seed.js';

// Calendar facts used below: 5 Oct 2026 is a Monday, 9 Oct 2026 a Friday, 3 and 4 Oct a weekend.

describe('isIsoDate', () => {
  it('accepts real dates and rejects impossible or malformed ones', () => {
    expect(isIsoDate('2026-10-05')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('05/10/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('workingDaysBetween', () => {
  it('counts Monday to Friday inclusive', () => {
    expect(workingDaysBetween('2026-10-05', '2026-10-09')).toBe(5);
  });

  it('counts a single weekday as one day', () => {
    expect(workingDaysBetween('2026-10-05', '2026-10-05')).toBe(1);
  });

  it('ignores weekends entirely', () => {
    expect(workingDaysBetween('2026-10-03', '2026-10-04')).toBe(0);
  });

  it('skips the weekend inside a range', () => {
    expect(workingDaysBetween('2026-10-09', '2026-10-12')).toBe(2);
  });

  it('returns zero when the end is before the start', () => {
    expect(workingDaysBetween('2026-10-09', '2026-10-05')).toBe(0);
  });
});

describe('validateLeave', () => {
  const today = '2026-09-15';
  const valid = { type: 'annual', startDate: '2026-10-05', endDate: '2026-10-09', reason: '' };

  it('accepts a valid request and computes working days', () => {
    const result = validateLeave(valid, 20, today);
    expect(result).toEqual({ ok: true, value: { ...valid, workingDays: 5 } });
  });

  it('rejects an end date before the start date', () => {
    const result = validateLeave({ ...valid, endDate: '2026-10-01' }, 20, today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.endDate).toMatch(/after the start date/);
  });

  it('rejects annual leave in the past but allows sick leave', () => {
    const annual = validateLeave(
      { ...valid, startDate: '2026-09-01', endDate: '2026-09-01' },
      20,
      today,
    );
    const sick = validateLeave(
      { ...valid, type: 'sick', startDate: '2026-09-01', endDate: '2026-09-01' },
      20,
      today,
    );
    expect(annual.ok).toBe(false);
    expect(sick.ok).toBe(true);
  });

  it('rejects weekend-only requests', () => {
    const result = validateLeave(
      { ...valid, startDate: '2026-10-03', endDate: '2026-10-04' },
      20,
      today,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.startDate).toMatch(/no working days/);
  });

  it('rejects annual leave beyond the remaining balance and says how many days remain', () => {
    const result = validateLeave(valid, 3, today);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.endDate).toBe(
        'This request needs 5 working days but you have 3 remaining.',
      );
  });

  it('does not apply the balance to unpaid leave', () => {
    const result = validateLeave({ ...valid, type: 'unpaid' }, 0, today);
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown leave type', () => {
    const result = validateLeave({ ...valid, type: 'sabbatical' }, 20, today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.type).toBeDefined();
  });
});

describe('remainingAnnualLeave', () => {
  it('subtracts approved and pending annual leave from the allowance, ignoring sick and unpaid', () => {
    const seed = createSeed();
    const dev = seed.employees.find((e) => e.id === 'emp-004');
    const amira = seed.employees.find((e) => e.id === 'emp-005');
    if (!dev || !amira) throw new Error('seed changed');
    // Dev: 5 days pending annual, 1 day sick approved.
    expect(remainingAnnualLeave(dev, seed.leaveRequests)).toBe(20);
    // Amira: 5 days approved annual, 5 days unpaid rejected.
    expect(remainingAnnualLeave(amira, seed.leaveRequests)).toBe(20);
  });
});
