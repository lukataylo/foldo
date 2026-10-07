// Simulated mid-market rates quoted per 1 GBP. Replace with a real FX API later (e.g. exchangerate.host).
export const BASE_RATES = { GBP: 1, EUR: 1.17, USD: 1.27, NGN: 1950, INR: 106, SGD: 1.71, PLN: 5.05 };
export const CURRENCIES = Object.keys(BASE_RATES);
export const FLAGS = { GBP: 'GB', EUR: 'EU', USD: 'US', NGN: 'NG', INR: 'IN', SGD: 'SG', PLN: 'PL' };

// Our pricing vs a typical high-street bank (assumption, label it as such in the UI)
export const OUR_FEE = { fixed: 0.99, percent: 0.004 };
export const BANK_FEE = { fixed: 15, percent: 0.0, marginOnRate: 0.04 };

export const RECIPIENTS = [
  { id: 'r1', name: 'Kofi Mensah', country: 'NG', currency: 'NGN', account: 'NG•• •••• 4821' },
  { id: 'r2', name: 'Priya Patel', country: 'IN', currency: 'INR', account: 'IN•• •••• 9033' },
  { id: 'r3', name: 'Elena Novak', country: 'PL', currency: 'PLN', account: 'PL•• •••• 1175' },
];

export const STAGES = ['Created', 'Funds received', 'Compliance check', 'Sent to partner bank', 'Delivered'];
