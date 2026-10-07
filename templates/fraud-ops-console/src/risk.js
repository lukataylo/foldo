// Explainable risk scoring: every rule says WHY in plain words, and can be switched off in the Rules tab.
export const RULES = [
  { id: 'amount', label: 'Unusually large amount', weight: 30, test: (t) => t.amount > 400, why: (t) => `£${t.amount.toFixed(2)} is far above this cardholder's typical spend.` },
  { id: 'geo', label: 'Far from home city', weight: 25, test: (t) => t.city !== t.home, why: (t) => `Card used in ${t.city}, but the holder usually spends in ${t.home}.` },
  { id: 'device', label: 'New device', weight: 20, test: (t) => t.newDevice, why: () => 'First time we have seen this device for this card.' },
  { id: 'hour', label: 'Odd hour', weight: 10, test: (t) => t.hour <= 4 || t.hour >= 23, why: (t) => `Purchase at ${String(t.hour).padStart(2, '0')}:00, outside normal hours.` },
  { id: 'merchant', label: 'High-risk merchant', weight: 25, test: (t) => ['CryptoSwap', 'GiftCard Hub', 'Luxury Watches'].includes(t.merchant), why: (t) => `${t.merchant} is a category fraudsters favour (hard to reverse).` },
];

/** score(t, enabledIds) -> { score 0-100, level, reasons[] } */
export function score(t, enabled = RULES.map((r) => r.id)) {
  const hits = RULES.filter((r) => enabled.includes(r.id) && r.test(t));
  const raw = hits.reduce((n, r) => n + r.weight, 0);
  const value = Math.min(100, raw);
  return { score: value, level: value >= 60 ? 'high' : value >= 30 ? 'medium' : 'low', reasons: hits.map((r) => ({ id: r.id, label: r.label, text: r.why(t), weight: r.weight })) };
}
