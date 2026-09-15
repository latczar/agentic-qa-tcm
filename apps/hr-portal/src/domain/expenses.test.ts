import { describe, expect, it } from 'vitest';
import { formatPence, parseAmountToPence, validateExpense } from './expenses.js';

describe('parseAmountToPence', () => {
  it('reads pounds and pence in the forms people actually type', () => {
    expect(parseAmountToPence('12')).toBe(1200);
    expect(parseAmountToPence('12.5')).toBe(1250);
    expect(parseAmountToPence('12.50')).toBe(1250);
    expect(parseAmountToPence('£12.50')).toBe(1250);
    expect(parseAmountToPence('1,250.00')).toBe(125000);
    expect(parseAmountToPence(' 0.01 ')).toBe(1);
  });

  it('rejects anything that is not a money amount', () => {
    expect(parseAmountToPence('')).toBeNull();
    expect(parseAmountToPence('abc')).toBeNull();
    expect(parseAmountToPence('12.345')).toBeNull();
    expect(parseAmountToPence('-5')).toBeNull();
    expect(parseAmountToPence('1e3')).toBeNull();
  });

  it('never goes through floating point', () => {
    // 0.1 + 0.2 style errors cannot happen because we only ever multiply integers.
    expect(parseAmountToPence('0.10')).toBe(10);
    expect(parseAmountToPence('0.20')).toBe(20);
  });
});

describe('formatPence', () => {
  it('formats as British pounds', () => {
    expect(formatPence(1250)).toBe('£12.50');
    expect(formatPence(125000)).toBe('£1,250.00');
  });
});

describe('validateExpense', () => {
  const today = '2026-09-15';
  const valid = {
    category: 'travel',
    amount: '42.50',
    description: 'Train to Leeds',
    incurredOn: '2026-09-02',
  };

  it('accepts a valid claim and stores pence', () => {
    expect(validateExpense(valid, today)).toEqual({
      ok: true,
      value: {
        category: 'travel',
        amountPence: 4250,
        description: 'Train to Leeds',
        incurredOn: '2026-09-02',
      },
    });
  });

  it('rejects a zero amount, an unreadable amount, and an amount over the cap', () => {
    for (const [amount, pattern] of [
      ['0', /more than £0\.00/],
      ['lots', /for example 12\.50/],
      ['5000.01', /cannot exceed £5,000\.00/],
    ] as const) {
      const result = validateExpense({ ...valid, amount }, today);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.amount).toMatch(pattern);
    }
  });

  it('accepts exactly the cap', () => {
    expect(validateExpense({ ...valid, amount: '5000' }, today).ok).toBe(true);
  });

  it('rejects dates in the future', () => {
    const result = validateExpense({ ...valid, incurredOn: '2026-09-16' }, today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.incurredOn).toMatch(/future/);
  });

  it('rejects a description that is too short', () => {
    const result = validateExpense({ ...valid, description: 'ab' }, today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.description).toBeDefined();
  });

  it('reports every failing field at once', () => {
    const result = validateExpense(
      { category: 'bribes', amount: '', description: '', incurredOn: 'yesterday' },
      today,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        'amount',
        'category',
        'description',
        'incurredOn',
      ]);
    }
  });
});
