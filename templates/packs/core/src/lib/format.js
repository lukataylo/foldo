// Formatting helpers. Always format money with these, never by hand.
export const money = (amount, currency = 'GBP', opts = {}) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, ...opts }).format(amount);

export const moneyCompact = (amount, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount);

export const percent = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;

export const shortDate = (date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(date));

export const longDate = (date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date));

export const timeAgo = (date) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
