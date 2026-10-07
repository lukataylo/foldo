// Small, well-tested finance maths. All pure functions: easy to reuse and explain to judges.

/** Monthly payment for an amortising loan. rate = annual rate as a fraction (0.12 = 12% APR). */
export function monthlyPayment(principal, annualRate, months) {
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Full repayment schedule: [{ month, payment, interest, principal, balance }] */
export function amortisation(principal, annualRate, months) {
  const payment = monthlyPayment(principal, annualRate, months);
  let balance = principal;
  const rows = [];
  for (let month = 1; month <= months; month++) {
    const interest = balance * (annualRate / 12);
    const principalPaid = Math.min(balance, payment - interest);
    balance = Math.max(0, balance - principalPaid);
    rows.push({ month, payment, interest, principal: principalPaid, balance });
  }
  return rows;
}

/** Future value with monthly compounding and a monthly contribution. */
export function futureValue(start, monthly, annualRate, years) {
  const r = annualRate / 12;
  let v = start;
  const points = [{ year: 0, value: start }];
  for (let m = 1; m <= years * 12; m++) {
    v = v * (1 + r) + monthly;
    if (m % 12 === 0) points.push({ year: m / 12, value: v });
  }
  return points;
}

/** Convert using a rate table { GBP: 1, EUR: 1.17, ... } quoted against one base. */
export const convert = (amount, from, to, rates) => (amount / rates[from]) * rates[to];

/** Luhn checksum: validates card numbers (demo checkout uses it, no real card is ever charged). */
export function luhn(number) {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 12) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function cardBrand(number) {
  const n = number.replace(/\D/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  return 'Card';
}
