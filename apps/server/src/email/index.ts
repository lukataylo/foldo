// Email transport. Interface + selector + default stub implementation.
//
// Production switches by env:
//   FOLDO_EMAIL_PROVIDER=stub    (default — writes to .foldo-email-outbox/)
//   FOLDO_EMAIL_PROVIDER=resend  + RESEND_API_KEY + FOLDO_EMAIL_FROM
//
// The stub is what dev + CI + Playwright use: every send writes a JSON file
// to `.foldo-email-outbox/<rand>.json` so tests can poll for it.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { jobLogger } from '../log.ts';

const log = jobLogger('email');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body. Stub serialises both. */
  html?: string;
  /** Tag for logs + Playwright filtering (e.g. 'password-reset'). */
  kind: string;
}

export interface EmailSender {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}

/**
 * Dev/CI implementation. Drops the email payload as JSON into
 * `FOLDO_EMAIL_OUTBOX_DIR` (default `.foldo-email-outbox/`) so Playwright
 * specs can read the outbound link instead of hitting a real SMTP server.
 */
class StubEmailSender implements EmailSender {
  readonly name = 'stub';
  private readonly dir: string;
  constructor() {
    this.dir = resolve(
      process.env.FOLDO_EMAIL_OUTBOX_DIR ??
        resolve(process.cwd(), '.foldo-email-outbox'),
    );
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    } catch (err) {
      log.warn({ err, dir: this.dir }, 'failed to create email outbox dir');
    }
  }

  async send(msg: EmailMessage): Promise<void> {
    const filename = `${Date.now()}-${msg.kind}-${randomBytes(4).toString('hex')}.json`;
    const path = resolve(this.dir, filename);
    const payload = JSON.stringify(
      { ts: new Date().toISOString(), ...msg },
      null,
      2,
    );
    try {
      writeFileSync(path, payload + '\n', 'utf8');
      log.info({ to: msg.to, kind: msg.kind, path }, 'stub email written');
    } catch (err) {
      log.error({ err, to: msg.to, kind: msg.kind }, 'stub email write failed');
      throw err;
    }
  }
}

/**
 * Resend (https://resend.com) implementation. Activated when
 * FOLDO_EMAIL_PROVIDER=resend. Requires RESEND_API_KEY + FOLDO_EMAIL_FROM.
 * The Resend HTTP API is simple enough that we hit it with fetch rather
 * than pull in their SDK.
 */
class ResendEmailSender implements EmailSender {
  readonly name = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(msg: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html ?? msg.text,
        tags: [{ name: 'kind', value: msg.kind }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.error({ status: res.status, kind: msg.kind, body }, 'resend send failed');
      throw new Error(`resend send failed (${res.status})`);
    }
    log.info({ to: msg.to, kind: msg.kind }, 'resend email sent');
  }
}

let cached: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (cached) return cached;
  const provider = (process.env.FOLDO_EMAIL_PROVIDER ?? 'stub').toLowerCase();
  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FOLDO_EMAIL_FROM;
    if (!apiKey || !from) {
      log.error(
        { provider },
        'FOLDO_EMAIL_PROVIDER=resend but RESEND_API_KEY / FOLDO_EMAIL_FROM not set; falling back to stub',
      );
    } else {
      cached = new ResendEmailSender(apiKey, from);
      return cached;
    }
  }
  cached = new StubEmailSender();
  return cached;
}

/** Test-only reset so a Vitest can swap to a controlled implementation. */
export function _resetEmailSenderForTests(): void {
  cached = null;
}
