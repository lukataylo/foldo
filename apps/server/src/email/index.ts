// Account-lifecycle email. One `sendEmail` interface, two transports:
//
//   • Dev (default): writes each message as a standalone .html file under
//     `.foldo-mail/` AND keeps the last ~20 in an in-memory ring buffer. The
//     dev-only `GET /api/dev/last-email` route reads that ring so E2E specs
//     can extract reset / verification links without real mail infrastructure.
//   • Prod: nodemailer SMTP, configured from env. Used automatically whenever
//     SMTP env vars are present.
//
// Never logs secrets — only a one-line summary (to / subject) per message.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Derived from `html` when omitted. */
  text?: string;
}

export interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  sentAt: string;
}

const FROM = process.env.FOLDO_MAIL_FROM ?? 'Foldo <no-reply@foldo.dev>';
const MAIL_DIR = join(process.cwd(), '.foldo-mail');
const RING_LIMIT = 20;

/** Most-recent-last ring buffer of dev-transport messages. */
const devRing: SentEmail[] = [];

function pushRing(msg: SentEmail): void {
  devRing.push(msg);
  while (devRing.length > RING_LIMIT) devRing.shift();
}

/** The most recent email sent to `address` (case-insensitive), or null. */
export function lastEmailTo(address: string): SentEmail | null {
  const want = address.trim().toLowerCase();
  for (let i = devRing.length - 1; i >= 0; i--) {
    if (devRing[i].to.toLowerCase() === want) return devRing[i];
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

interface MailTransport {
  send(input: Required<SendEmailInput> & { from: string }): Promise<void>;
}

/** Dev transport: persist to disk + ring buffer, log a one-liner. */
const devTransport: MailTransport = {
  async send(input) {
    const sentAt = new Date().toISOString();
    pushRing({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      sentAt,
    });
    try {
      await mkdir(MAIL_DIR, { recursive: true });
      const safeTo = input.to.replace(/[^a-zA-Z0-9._@-]/g, '_');
      const stamp = sentAt.replace(/[:.]/g, '-');
      const file = join(MAIL_DIR, `${stamp}__${safeTo}.html`);
      const doc = `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(input.subject)}</title>
<!-- to: ${escapeHtml(input.to)} | sent: ${sentAt} -->
${input.html}`;
      await writeFile(file, doc, 'utf8');
    } catch (err) {
      // Disk write is a dev convenience; the ring buffer is the source of
      // truth for the dev endpoint, so a failure here is non-fatal.
      console.warn('[email] dev transport could not write file:', String(err));
    }
    console.log(`[email] (dev) → ${input.to} · "${input.subject}"`);
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

let smtpTransporter: Transporter | null = null;

function smtpConfigured(): boolean {
  return Boolean(
    process.env.FOLDO_SMTP_URL ||
      (process.env.FOLDO_SMTP_HOST && process.env.FOLDO_SMTP_PORT),
  );
}

function getSmtpTransporter(): Transporter {
  if (smtpTransporter) return smtpTransporter;
  if (process.env.FOLDO_SMTP_URL) {
    smtpTransporter = nodemailer.createTransport(process.env.FOLDO_SMTP_URL);
  } else {
    const port = Number(process.env.FOLDO_SMTP_PORT);
    const user = process.env.FOLDO_SMTP_USER;
    const pass = process.env.FOLDO_SMTP_PASS;
    smtpTransporter = nodemailer.createTransport({
      host: process.env.FOLDO_SMTP_HOST,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }
  return smtpTransporter;
}

/** Prod transport: nodemailer SMTP. */
const smtpTransport: MailTransport = {
  async send(input) {
    await getSmtpTransporter().sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    console.log(`[email] (smtp) → ${input.to} · "${input.subject}"`);
  },
};

/**
 * Send an account-lifecycle email. Picks the SMTP transport when SMTP env
 * vars are configured, otherwise the dev (file + ring) transport.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const text = input.text ?? htmlToText(input.html);
  const transport = smtpConfigured() ? smtpTransport : devTransport;
  await transport.send({
    from: FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text,
  });
}

/** True when the dev (file/ring) transport is active. */
export function isDevMailTransport(): boolean {
  return !smtpConfigured();
}

// ---------- message templates ----------

const APP_URL = process.env.FOLDO_APP_URL ?? 'http://localhost:5173';

function layout(heading: string, bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111">
  <div style="font-size:22px;font-weight:800;margin-bottom:8px">Foldo</div>
  <h1 style="font-size:20px;margin:16px 0 12px">${escapeHtml(heading)}</h1>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #E6E3DE;margin:28px 0 16px">
  <p style="font-size:12px;color:#999">If you didn't expect this email you can safely ignore it.</p>
</div>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700;font-size:14px">${escapeHtml(label)}</a></p>
  <p style="font-size:12px;color:#888;word-break:break-all">Or paste this link: <br>${href}</p>`;
}

export function passwordResetEmail(token: string): {
  subject: string;
  html: string;
} {
  const link = `${APP_URL}/reset?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Reset your Foldo password',
    html: layout(
      'Reset your password',
      `<p style="font-size:14px;line-height:1.6;color:#444">Someone asked to reset the password for this Foldo account. Click below to choose a new one. This link expires in 1 hour and can be used once.</p>
      ${button(link, 'Choose a new password')}`,
    ),
  };
}

export function verifyEmailEmail(token: string): {
  subject: string;
  html: string;
} {
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Verify your Foldo email',
    html: layout(
      'Confirm your email',
      `<p style="font-size:14px;line-height:1.6;color:#444">Welcome to Foldo. Confirm this email address so we know it's really you. This link expires in 24 hours.</p>
      ${button(link, 'Verify email')}`,
    ),
  };
}
