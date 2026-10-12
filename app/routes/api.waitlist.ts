import { json, type ActionFunctionArgs } from '@remix-run/node';
import { clientIp, throttled } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';
import { normalizeEmail } from '~/lib/email';

/*
 * POST email=<address> (form or JSON): the Foldo Pro "Get notified" list on /pricing. No sign-in needed. Idempotent: a repeat
 * gets the same answer, so the reply never tells anyone whether an address is already on the list. The global Origin check
 * in server.mjs covers CSRF.
 */
export async function loader() {
  return json({ error: 'Use POST.' }, 405);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405);
  }

  // per network, plus a ceiling for everyone so a botnet can't fill the table
  if (throttled(`waitlist:${clientIp(request)}`, 5, 600_000) || throttled('waitlist:all', 500, 3_600_000)) {
    return json({ error: 'Too many tries. Please wait a few minutes and try again.' }, 429);
  }

  const raw = (request.headers.get('content-type') ?? '').includes('application/json')
    ? ((await request.json().catch(() => null)) as { email?: unknown } | null)?.email
    : (await request.formData().catch(() => null))?.get('email');
  const email = normalizeEmail(raw);

  if (!email) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }

  db.prepare('INSERT OR IGNORE INTO waitlist (email, created) VALUES (?, ?)').run(email, Date.now());

  return json({ ok: true, message: 'You’re on the list. We’ll email you once, when Pro is ready.' });
}
