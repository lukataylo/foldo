/*
 * Email checks shared by the browser and the server (waitlist). Deliberately plain: one @, no spaces or angle brackets,
 * a dotted domain with a 2+ letter ending, and no empty labels. Returns the trimmed, lower-cased address, or undefined.
 */
const SHAPE = /^[^\s@<>()[\]\\,;:"]+@([a-z0-9-]+\.)+[a-z]{2,}$/;

export function normalizeEmail(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const email = raw.trim().toLowerCase();

  if (email.length > 254 || !SHAPE.test(email)) {
    return undefined;
  }

  const [local, domain] = email.split('@');

  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return undefined;
  }

  if (domain.split('.').some((label) => !label || label.startsWith('-') || label.endsWith('-'))) {
    return undefined;
  }

  return email;
}
