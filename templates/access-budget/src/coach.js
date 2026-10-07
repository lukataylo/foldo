import { INCOME, SPENDING } from '@/data';

// Rule-based tips: transparent on purpose. Each tip says why it appeared.
export function tips() {
  const total = SPENDING.reduce((n, s) => n + s.value, 0);
  const out = [];
  const share = (name) => (SPENDING.find((s) => s.name === name)?.value ?? 0) / INCOME;

  if (share('Food') > 0.15) out.push({ id: 'food', tone: 'warning', title: 'Food is 19% of your income', body: 'Planning three meals ahead can often save £30 to £50 a month. Try one batch-cooking day.', why: 'Shown because food is above 15% of income.' });
  if (share('Fun') > 0.08) out.push({ id: 'fun', tone: 'default', title: 'Fun money is 8% of income', body: 'Fun spending is healthy. A weekly cash limit of £25 keeps it from creeping up.', why: 'Shown because fun is above 8% of income.' });
  if (INCOME - total > 200) out.push({ id: 'save', tone: 'success', title: `You have £${INCOME - total} left over`, body: 'Moving £50 into a savings jar as soon as you are paid makes saving automatic.', why: 'Shown because more than £200 is left after spending.' });
  return out;
}
