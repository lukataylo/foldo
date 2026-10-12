import { requireAdmin } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';

// GET: the Pro waitlist as CSV (admins only; anyone else gets the same 404 as /admin)
export async function loader({ request }: { request: Request }) {
  await requireAdmin(request);

  const rows = db.prepare('SELECT email, created FROM waitlist ORDER BY created').all() as { email: string; created: number }[];
  // emails are validated on the way in (no quotes, commas or newlines), but quote anyway; a leading =+-@ is defused for spreadsheets
  const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const csv = ['email,joined_utc', ...rows.map((r) => `${cell(r.email)},${new Date(r.created).toISOString()}`)].join('\r\n');

  return new Response(`${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="foldo-waitlist.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
