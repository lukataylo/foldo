import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { PageShell } from '~/components/PageShell';
import {
  destroySession,
  endSessions,
  requireUser,
  setPassword,
  shell,
  throttled,
  verifyPasswordFor,
} from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';

export const meta = () => [{ title: 'Settings · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  return json(shell(await requireUser(request)));
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const f = await request.formData();
  const s = (k: string) => String(f.get(k) ?? '');
  const intent = s('intent');

  if (intent === 'profile') {
    const name = s('name').replace(/\s+/g, ' ').trim().slice(0, 40);

    if (name.length < 2) {
      return json({ error: 'Name must be at least 2 characters.' }, 400);
    }

    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);

    return json({ ok: 'Saved.' });
  }

  // password-protected actions share a throttle so a stolen session can't be used to guess the password
  if (throttled(`pw:${user.id}`, 10, 600_000)) {
    return json({ error: 'Too many attempts. Wait a few minutes.' }, 429);
  }

  if (!(await verifyPasswordFor(user.id, s('current')))) {
    return json({ error: 'Current password is wrong.' }, 400);
  }

  if (intent === 'password') {
    if (s('next').length < 8 || s('next').length > 200) {
      return json({ error: 'Use at least 8 characters for the new password.' }, 400);
    }

    await setPassword(user.id, s('next'));
    endSessions(user.id);

    return redirect('/login', { headers: { 'Set-Cookie': await destroySession(request) } });
  }

  if (intent === 'delete') {
    db.prepare('DELETE FROM likes WHERE user_id = ? OR project_id IN (SELECT id FROM projects WHERE user_id = ?)').run(user.id, user.id);
    db.prepare('DELETE FROM projects WHERE user_id = ?').run(user.id);
    endSessions(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    return redirect('/', { headers: { 'Set-Cookie': await destroySession(request) } });
  }

  return json({ error: 'Unknown action' }, 400);
}

const card = 'rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6';
const input =
  'w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-borderColorActive';

export default function Settings() {
  const d = useLoaderData<typeof loader>() as any;
  const r = useActionData<typeof action>() as { ok?: string; error?: string } | undefined;

  return (
    <PageShell data={d} active="settings" narrow>
      <main className="space-y-6" data-testid="foldo-settings">
        <h1 className="text-3xl font-bold">Settings</h1>
        {(r?.ok || r?.error) && (
          <div role="status" className={`rounded-xl px-4 py-3 text-sm ${r.error ? 'bg-[#fdecec] text-[#b42318]' : 'bg-[#e8f6ec] text-[#14532d]'}`}>
            {r.error ?? r.ok}
          </div>
        )}

        <Form method="post" className={`${card} space-y-3`}>
          <h2 className="font-bold">Profile</h2>
          <label className="block text-sm">
            Name or team
            <input className={`${input} mt-1`} name="name" defaultValue={d.name} maxLength={40} required />
          </label>
          <div className="text-sm text-bolt-elements-textTertiary">Signed in as {d.email}</div>
          <button name="intent" value="profile" className="rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-semibold text-bolt-elements-button-primary-text">
            Save
          </button>
        </Form>

        <Form method="post" className={`${card} space-y-3`}>
          <h2 className="font-bold">Change password</h2>
          <input className={input} name="current" type="password" placeholder="Current password" autoComplete="current-password" required />
          <input className={input} name="next" type="password" placeholder="New password (8+ characters)" autoComplete="new-password" required />
          <button name="intent" value="password" className="rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-semibold text-bolt-elements-button-primary-text">
            Update password
          </button>
          <p className="text-xs text-bolt-elements-textTertiary">You'll be signed out everywhere afterwards.</p>
        </Form>

        <Form method="post" className={`${card} space-y-3 border-[#b42318]/40`}>
          <h2 className="font-bold text-bolt-elements-icon-error">Delete account</h2>
          <p className="text-sm text-bolt-elements-textSecondary">Permanently deletes your projects and share links. This can't be undone.</p>
          <input className={input} name="current" type="password" placeholder="Confirm with your password" autoComplete="current-password" required />
          <button name="intent" value="delete" className="rounded-lg bg-[#b42318] px-4 py-2 text-sm font-semibold text-white hover:bg-[#912018]">
            Delete my account
          </button>
        </Form>
      </main>
    </PageShell>
  );
}
