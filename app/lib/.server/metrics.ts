// In-memory request telemetry for the admin live view and the logs. Resets on restart (fine for a one-night event).
const stamps: number[] = [];
const errorStamps: number[] = [];
const errors = new Map<string, number>();
const served = new Map<string, number>();
let failovers = 0;

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

const keep = (a: number[]) => a.length > 5000 && a.splice(0, a.length - 5000);


export function recordRequest(e: { user: string; primary: string; served?: string; ok: boolean; ms: number; failover: boolean }) {
  stamps.push(Date.now());
  keep(stamps);

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
  errorStamps.push(Date.now());
  keep(errorStamps);
}

const since = (a: number[], ms: number) => a.filter((t) => Date.now() - t < ms).length;

export const snapshot = () => ({
  requestsPerMinute: since(stamps, 60_000),
  // provider errors per chat request over the last 15 minutes (a failover counts the failed attempt)
  errorRate15m: since(stamps, 900_000) ? Math.min(1, since(errorStamps, 900_000) / since(stamps, 900_000)) : 0,
  errors: Object.fromEntries(errors),
  served: Object.fromEntries(served),
  failovers,
});
