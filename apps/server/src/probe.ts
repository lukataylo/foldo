/**
 * Best-effort check of whether a URL can be embedded in an iframe by Foldo.
 * Inspects the `X-Frame-Options` header and the CSP `frame-ancestors`
 * directive. Returns `null` when we genuinely can't tell , the target was
 * unreachable, timed out, or the fetch errored (common for localhost-only
 * apps, which is exactly the signal the `dom_snapshot` mode wants).
 */
export async function probeFrameable(url: string): Promise<boolean | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'FoldoBot/1.0 (+frameability-probe)' },
    });

    const xfo = (res.headers.get('x-frame-options') ?? '').toLowerCase();
    if (xfo.includes('deny') || xfo.includes('sameorigin')) return false;

    const csp = (res.headers.get('content-security-policy') ?? '').toLowerCase();
    const fa = /frame-ancestors([^;]*)/.exec(csp);
    if (fa) {
      const value = fa[1].trim();
      // `'none'`, or a self-only list with no wildcard / explicit origin,
      // means a cross-origin Foldo iframe would be blocked.
      if (value.includes("'none'")) return false;
      if (!value.includes('*') && !value.includes('http')) return false;
    }
    return true;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
