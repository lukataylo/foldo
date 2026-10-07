// Fake data only. Never load real transactions into a hackathon demo.
let seed = 11;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (list) => list[Math.floor(rand() * list.length)];

export const CITIES = ['London', 'Manchester', 'Leeds', 'Bristol', 'Lagos', 'Singapore', 'Mumbai', 'Warsaw'];
export const MERCHANTS = ['Coffee Corner', 'Metro Tickets', 'GreenGrocer', 'Pixel Games', 'Bright Energy', 'City Pharmacy', 'CryptoSwap', 'GiftCard Hub', 'Luxury Watches'];
export const NAMES = ['Amara Okafor', 'Noah Smith', 'Priya Patel', 'Leo Nguyen', 'Sofia Rossi', 'Kofi Mensah', 'Mei Chen', 'Omar Haddad'];

let counter = 1000;

/** One simulated card transaction. `home` is the cardholder's usual city. */
export function makeTransaction(forceRisky = false) {
  const home = pick(['London', 'Manchester', 'Leeds', 'Bristol']);
  const risky = forceRisky || rand() < 0.22;
  return {
    id: `TXN-${++counter}`,
    time: Date.now(),
    holder: pick(NAMES),
    merchant: risky && rand() < 0.6 ? pick(['CryptoSwap', 'GiftCard Hub', 'Luxury Watches']) : pick(MERCHANTS.slice(0, 6)),
    amount: Math.round((risky ? 250 + rand() * 2200 : 3 + rand() * 90) * 100) / 100,
    city: risky && rand() < 0.7 ? pick(['Lagos', 'Singapore', 'Mumbai', 'Warsaw']) : home,
    home,
    newDevice: risky ? rand() < 0.75 : rand() < 0.05,
    hour: risky ? pick([1, 2, 3, 4, 23]) : 8 + Math.floor(rand() * 12),
    status: 'open', // open | approved | blocked
  };
}

export const seedTransactions = (n = 24) => Array.from({ length: n }, () => ({ ...makeTransaction(), time: Date.now() - rand() * 3 * 3600000 })).sort((a, b) => b.time - a.time);
