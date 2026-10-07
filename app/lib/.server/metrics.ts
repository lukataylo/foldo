// In-memory request telemetry for the admin live view and the logs. Resets on restart (fine for a one-night event).
const stamps: number[] = [];
const errors = new Map<string, number>();
const served = new Map<string, number>();
let failovers = 0;

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

export function recordRequest(e: { user: string; primary: string; served?: string; ok: boolean; ms: number; failover: boolean }) {
  stamps.push(Date.now());

  if (stamps.length > 5000) {
    stamps.splice(0, stamps.length - 5000);
  }

  if (!e.ok) {
    bump(errors, e.primary);
  }

  if (e.served) {
    bump(served, e.served);
  }

  if (e.failover) {
    failovers++;
  }

  // one JSON line per request: easy to grep in Railway logs
  console.log(JSON.stringify({ evt: 'chat', ...e, t: new Date().toISOString() }));
}

export function recordProviderError(provider: string) {
  bump(errors, provider);
}

export const snapshot = () => ({
  requestsPerMinute: stamps.filter((t) => Date.now() - t < 60_000).length,
  errors: Object.fromEntries(errors),
  served: Object.fromEntries(served),
  failovers,
});
