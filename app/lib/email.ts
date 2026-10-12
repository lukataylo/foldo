/*
 * Email checks shared by the browser and the server (waitlist). Deliberately plain: one @, a conservative local part,
 * a dotted domain with a 2+ letter ending, and no empty labels. Returns the trimmed, lower-cased address, or undefined.
 */
// the local part is limited to the characters real addresses use: no ? & = # / %, so a stored address can't add headers
// to a mailto: link (contact email) or hold a spreadsheet formula (the waitlist CSV also defuses a leading + or -)
const SHAPE = /^[a-z0-9._+'-]+@([a-z0-9-]+\.)+[a-z]{2,}$/;

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
