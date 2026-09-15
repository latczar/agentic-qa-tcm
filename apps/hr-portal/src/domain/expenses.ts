import { isIsoDate } from './dates.js';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type FieldErrors,
  type Validation,
} from './types.js';

/** £5,000 per claim. Larger amounts go through procurement, not expenses. */
export const MAX_EXPENSE_PENCE = 500_000;
export const MIN_DESCRIPTION_LENGTH = 3;
export const MAX_DESCRIPTION_LENGTH = 200;

export interface ExpenseInput {
  category: string;
  amount: string;
  description: string;
  incurredOn: string;
}

export interface ValidExpense {
  category: ExpenseCategory;
  amountPence: number;
  description: string;
  incurredOn: string;
}

export type ExpenseField = keyof ExpenseInput;

/** Accepts "12", "12.5", "12.50", "£12.50" and "1,250.00". Returns whole pence, or null if unreadable. */
export function parseAmountToPence(raw: string): number | null {
  const cleaned = raw.trim().replace(/^£/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [pounds = '0', pence = ''] = cleaned.split('.');
  return Number(pounds) * 100 + Number(pence.padEnd(2, '0'));
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

/** 1250 becomes "£12.50". */
export function formatPence(pence: number): string {
  return gbp.format(pence / 100);
}

export function validateExpense(
  input: ExpenseInput,
  today: string,
): Validation<ValidExpense, ExpenseField> {
  const errors: FieldErrors<ExpenseField> = {};
  const category = input.category.trim();
  const description = input.description.trim();
  const incurredOn = input.incurredOn.trim();
  const amountPence = parseAmountToPence(input.amount);

  if (!isCategory(category)) errors.category = 'Choose a category.';
  if (amountPence === null) {
    errors.amount = 'Enter an amount in pounds, for example 12.50.';
  } else if (amountPence === 0) {
    errors.amount = 'Amount must be more than £0.00.';
  } else if (amountPence > MAX_EXPENSE_PENCE) {
    errors.amount = `Amount cannot exceed ${formatPence(MAX_EXPENSE_PENCE)} per claim.`;
  }
  if (description.length < MIN_DESCRIPTION_LENGTH) {
    errors.description = `Describe the expense in at least ${MIN_DESCRIPTION_LENGTH} characters.`;
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }
  if (!isIsoDate(incurredOn)) {
    errors.incurredOn = 'Enter a valid date.';
  } else if (incurredOn > today) {
    errors.incurredOn = 'Date cannot be in the future.';
  }

  if (Object.keys(errors).length > 0 || !isCategory(category) || amountPence === null) {
    return { ok: false, errors };
  }
  return { ok: true, value: { category, amountPence, description, incurredOn } };
}

function isCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}
