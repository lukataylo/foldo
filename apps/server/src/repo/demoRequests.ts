// Demo-request rows are public form submissions — no `user_id` link, just an
// email. The only consumer today is the GDPR data-export endpoint, which
// matches on the email a user has on file at delete time.

import { query, exec } from '../db.ts';

export interface DemoRequest {
  id: string;
  name: string;
  email: string;
  company: string | null;
  teamSize: string | null;
  agents: string | null;
  message: string | null;
  createdAt: string;
}

interface DemoRequestRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
  team_size: string | null;
  agents: string | null;
  message: string | null;
  created_at: string;
}

function rowToDemoRequest(r: DemoRequestRow): DemoRequest {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    company: r.company,
    teamSize: r.team_size,
    agents: r.agents,
    message: r.message,
    createdAt: r.created_at,
  };
}

/**
 * Every demo-request whose lowercase email matches `email`. Case-insensitive
 * because the public form normalises on input but historical rows from
 * before the lowercase-on-write change may differ in casing.
 */
export async function listDemoRequestsForEmail(
  email: string,
): Promise<DemoRequest[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  const rows = await query<DemoRequestRow>(
    `SELECT * FROM demo_requests
      WHERE lower(email) = $1
      ORDER BY created_at`,
    [normalized],
  );
  return rows.map(rowToDemoRequest);
}

/** Test helper — wipes the table. Only meant to run against test DBs. */
export async function _clearDemoRequestsForTests(): Promise<void> {
  await exec(`DELETE FROM demo_requests`);
}
