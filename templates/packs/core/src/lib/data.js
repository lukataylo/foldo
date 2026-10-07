// Seeded fake data so the demo looks the same every run. NEVER put real customer data in a hackathon project.
export function rng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const pick = (rand, list) => list[Math.floor(rand() * list.length)];
export const between = (rand, min, max) => min + rand() * (max - min);

const FIRST = ['Amara', 'Noah', 'Priya', 'Leo', 'Sofia', 'Kofi', 'Mei', 'Omar', 'Elena', 'Jamal', 'Yara', 'Tom'];
const LAST = ['Okafor', 'Smith', 'Patel', 'Nguyen', 'Rossi', 'Mensah', 'Chen', 'Haddad', 'Novak', 'Brown', 'Silva', 'Ali'];
export const fakeName = (rand) => `${pick(rand, FIRST)} ${pick(rand, LAST)}`;

export const MERCHANTS = ['Coffee Corner', 'Metro Tickets', 'GreenGrocer', 'Pixel Games', 'Bright Energy', 'City Pharmacy', 'BookNook', 'Fresh Bites'];
export const CITIES = ['London', 'Manchester', 'Leeds', 'Bristol', 'Glasgow', 'Lagos', 'Singapore', 'Mumbai'];

/** n fake card transactions across the last `days` days, newest first. */
export function fakeTransactions(n = 40, days = 30, seed = 7) {
  const rand = rng(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `txn_${1000 + i}`,
    merchant: pick(rand, MERCHANTS),
    amount: Math.round(between(rand, 2, 180) * 100) / 100,
    city: pick(rand, CITIES),
    date: new Date(Date.now() - rand() * days * 86400000).toISOString(),
    status: rand() > 0.08 ? 'settled' : 'pending',
  })).sort((a, b) => new Date(b.date) - new Date(a.date));
}
