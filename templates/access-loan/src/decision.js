import { monthlyPayment } from '@/lib/finance';

export const APR = 0.19; // illustrative rate; show it everywhere the user sees a price
export const MAX_SHARE = 0.35; // payment must be <= 35% of disposable income

/**
 * Explainable decision: every reason is a sentence the applicant can read and challenge.
 * No protected characteristics (age, gender, ethnicity, postcode) are ever used.
 */
export function decide({ income, outgoings, amount, months, missedPayments }) {
  const disposable = Math.max(0, income - outgoings);
  const payment = monthlyPayment(amount, APR, months);
  const share = disposable > 0 ? payment / disposable : Infinity;
  const reasons = [];

  reasons.push({
    ok: share <= MAX_SHARE,
    text: `The monthly payment would be ${Math.round(share * 100)}% of what you have left after bills. We aim for 35% or less so the loan stays comfortable.`,
  });
  reasons.push({
    ok: missedPayments <= 1,
    text: missedPayments <= 1 ? 'Your recent payment history looks steady.' : 'You told us about several missed payments recently. We want to be sure repayments will be manageable.',
  });
  reasons.push({ ok: income > 0, text: income > 0 ? 'We could confirm a regular income.' : 'We need a regular income to check affordability.' });

  const approved = reasons.every((r) => r.ok);
  // suggest the largest amount that would pass, so a "no" always comes with a next step
  let suggestion = 0;
  for (let a = amount; a >= 50; a -= 50) {
    if (monthlyPayment(a, APR, months) / Math.max(1, disposable) <= MAX_SHARE) {
      suggestion = a;
      break;
    }
  }
  return { approved, reasons, payment, share, disposable, total: payment * months, cost: payment * months - amount, suggestion };
}
