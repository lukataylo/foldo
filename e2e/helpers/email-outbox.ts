// Reads outbound emails written by the StubEmailSender in dev/CI. Lives
// alongside factory.ts so password-reset / email-verification specs can
// poll for their expected outbound message without a real SMTP roundtrip.

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

// Server cwd is apps/server when launched via `npm run dev`, so its
// outbox lives there relative to the repo root.
const OUTBOX_DIR =
  process.env.FOLDO_EMAIL_OUTBOX_DIR ??
  resolve(process.cwd(), 'apps/server/.foldo-email-outbox');

export interface OutboundEmail {
  ts: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: string;
  /** Absolute filesystem path so the test can delete it after asserting. */
  _path: string;
}

/**
 * Poll the outbox for an email matching `filter`. Defaults to 10s timeout
 * (login + email round-trip should be sub-second locally). Returns the
 * matching message — if multiple match, the newest wins.
 */
export async function waitForEmail(
  filter: { kind: string; to?: string },
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<OutboundEmail> {
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  const poll = opts.pollMs ?? 100;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const entries = await fs.readdir(OUTBOX_DIR).catch(() => [] as string[]);
      const matches: OutboundEmail[] = [];
      for (const name of entries) {
        if (!name.endsWith('.json')) continue;
        const path = resolve(OUTBOX_DIR, name);
        try {
          const raw = await fs.readFile(path, 'utf8');
          const msg = JSON.parse(raw) as Omit<OutboundEmail, '_path'>;
          if (msg.kind !== filter.kind) continue;
          if (filter.to && msg.to !== filter.to) continue;
          matches.push({ ...msg, _path: path });
        } catch (err) {
          lastErr = err;
        }
      }
      if (matches.length > 0) {
        matches.sort((a, b) => (a.ts < b.ts ? 1 : -1));
        return matches[0]!;
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, poll));
  }
  throw new Error(
    `waitForEmail(${filter.kind}${filter.to ? ' → ' + filter.to : ''}) timed out after ${
      opts.timeoutMs ?? 10_000
    }ms${lastErr ? `: ${(lastErr as Error).message}` : ''}`,
  );
}

/**
 * Extract the first URL pointing at `pathPrefix` from a message's body.
 * E.g. `extractLink(msg, '/reset?')` → the reset URL.
 */
export function extractLink(msg: OutboundEmail, pathPrefix: string): string {
  const body = `${msg.text}\n${msg.html ?? ''}`;
  const re = new RegExp(`https?://[^\\s"'<>]*${escapeRegex(pathPrefix)}[^\\s"'<>]*`, 'i');
  const m = re.exec(body);
  if (!m) throw new Error(`No link with prefix "${pathPrefix}" in email ${msg._path}`);
  return m[0];
}

/** Remove the email file once asserted — keeps the outbox tidy between specs. */
export async function deleteEmail(msg: OutboundEmail): Promise<void> {
  await fs.unlink(msg._path).catch(() => undefined);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
