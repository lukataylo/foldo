import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { useActionData, useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'react-toastify';
import { PageShell, type ShellData } from '~/components/PageShell';
import { Icon } from '~/components/ui/icons';
import {
  destroySession,
  endOtherSessions,
  endSessions,
  requireUser,
  setPassword,
  shell,
  throttled,
  verifyPasswordFor,
} from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';
import { cleanName, teamNameError } from '~/lib/.server/names';
import { classNames } from '~/utils/classNames';

export const meta = () => [{ title: 'Settings · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  return json(shell(await requireUser(request)));
}

type Form = 'profile' | 'password' | 'delete';
type Field = 'name' | 'current' | 'next';

// `form` tells the no-JS page render which card the result belongs to (with JS each card has its own fetcher)
type Result = { form?: Form; ok?: string; error?: string; field?: Field };

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const f = await request.formData();
  const s = (k: string) => String(f.get(k) ?? '');
  const intent = s('intent') as Form;
  const fail = (field: Field, error: string, status = 400) => json<Result>({ form: intent, error, field }, status);

  if (intent === 'profile') {
    const name = cleanName(s('name'), 40);
    const error = teamNameError(name, user.id);

    if (error) {
      return fail('name', error);
    }

    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);

    return json<Result>({ form: intent, ok: 'Saved.' });
  }

  // password-protected actions share a throttle so a stolen session can't be used to guess the password
  if (throttled(`pw:${user.id}`, 10, 600_000)) {
    return fail('current', 'Too many attempts. Wait a few minutes, then try again.', 429);
  }

  if (!(await verifyPasswordFor(user.id, s('current')))) {
    return fail('current', "That password doesn't match. Check it and try again.");
  }

  if (intent === 'password') {
    if (s('next').length < 8 || s('next').length > 200) {
      return fail('next', 'Use at least 8 characters for the new password.');
    }

    await setPassword(user.id, s('next'));

    await endOtherSessions(request, user.id);

    return json<Result>({ form: intent, ok: 'Password updated.' });
  }

  if (intent === 'delete') {
    db.prepare('DELETE FROM likes WHERE user_id = ? OR project_id IN (SELECT id FROM projects WHERE user_id = ?)').run(user.id, user.id);
    db.prepare('DELETE FROM projects WHERE user_id = ?').run(user.id);
    endSessions(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    return redirect('/', { headers: { 'Set-Cookie': await destroySession(request) } });
  }

  return json<Result>({ error: 'Something went wrong. Reload the page and try again.' }, 400);
}

// icons not in the shared set (paths from the Settings board)
const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </svg>
);

const LockIcon = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

const TriangleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: <UserIcon />, danger: false },
  { id: 'password', label: 'Password', icon: <LockIcon />, danger: false },
  { id: 'danger', label: 'Danger zone', icon: <TriangleIcon />, danger: true },
];

/*
 * One fetcher per form: its own busy state, inline field error, and a toast on success. Without JavaScript the form
 * posts the whole page, so the result comes back as action data instead (and success shows inline: no toasts).
 */
function useSettingsForm(form: Form) {
  const fetcher = useFetcher<Result>();
  const page = useActionData<Result>();
  const busy = fetcher.state !== 'idle';
  const fromPage = !fetcher.data && page?.form === form ? page : undefined;
  const result = busy ? undefined : (fetcher.data ?? fromPage);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (result?.ok && result === fetcher.data) {
      toast.success(result.ok);
    }
  }, [result]);

  const errorFor = (field: Field) => (result?.field === field ? result.error : undefined);
  const inlineOk = fromPage?.ok;

  return { fetcher, busy, result, errorFor, formRef, inlineOk };
}

function InlineOk({ children }: { children?: string }) {
  return children ? (
    <span role="status" className="mr-auto inline-flex items-center gap-[6px] self-center text-[14px] text-live">
      <Icon.Check />
      {children}
    </span>
  ) : null;
}

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) {
    return null;
  }

  return (
    <span id={id} className="input-error" role="alert">
      <Icon.Alert className="mt-[2px] shrink-0" />
      {children}
    </span>
  );
}

function Card({ id, title, intro, eyebrow, danger, children }: { id: string; title: string; intro: ReactNode; eyebrow?: string; danger?: boolean; children: ReactNode }) {
  return (
    <div
      className={classNames('scroll-mt-6 rounded-[12px] border bg-sheet', danger ? 'border-error-border' : 'border-rule')}
      id={id}
      data-testid={`foldo-settings-section-${id}`}
    >
      <div className={classNames('flex flex-col px-6 pb-1 pt-[22px]', danger ? 'gap-[6px]' : 'gap-1')}>
        {eyebrow && <span className="font-mono text-[12px] font-medium uppercase leading-[normal] tracking-[.08em] text-error">{eyebrow}</span>}
        <h2 id={`${id}-title`} className="m-0 font-serif text-[28px] font-normal leading-[1.1]">
          {title}
        </h2>
        {intro}
      </div>
      {children}
    </div>
  );
}

const FOOTER = 'flex justify-end border-t border-rule2 px-6 py-[14px]';

function Busy({ busy, children, label }: { busy: boolean; children: ReactNode; label: string }) {
  return busy ? (
    <>
      <Icon.Spinner />
      {label}
    </>
  ) : (
    <>{children}</>
  );
}

function ProfileForm({ name, email }: { name?: string; email?: string }) {
  const { fetcher, busy, errorFor, inlineOk } = useSettingsForm('profile');
  const error = errorFor('name');

  return (
    <fetcher.Form method="post" noValidate aria-labelledby="profile-title">
      <input type="hidden" name="intent" value="profile" />
      <Card id="profile" title="Profile" intro={<p className="m-0 text-[14px] text-pencil">How your team shows up across Foldo.</p>}>
        <div className="grid gap-5 px-6 pb-[22px] pt-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="name" className="input-label">
              Name or team
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={name}
              maxLength={40}
              autoComplete="organization"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'name-error' : 'name-help'}
              className="input"
            />
            {error ? <FieldError id="name-error">{error}</FieldError> : <span id="name-help" className="input-help">Up to 40 characters.</span>}
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="email" className="input-label">
              Email
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                value={email ?? ''}
                readOnly
                aria-describedby="email-help"
                className="input border-rule bg-wash pr-10 text-ink2 focus:border-rule focus:shadow-none"
              />
              <LockIcon className="pointer-events-none absolute right-[14px] top-[15px] text-pencil" />
            </div>
            <span id="email-help" className="input-help">
              Your sign-in. Ask an organizer if it needs to change.
            </span>
          </div>
        </div>
        <div className={FOOTER}>
          <InlineOk>{inlineOk}</InlineOk>
          <button type="submit" className="btn-primary btn-md" aria-busy={busy || undefined} data-testid="foldo-settings-save">
            <Busy busy={busy} label="Saving">
              Save
            </Busy>
          </button>
        </div>
      </Card>
    </fetcher.Form>
  );
}

// password managers want the account name next to a password field
const Username = ({ email }: { email?: string }) => (
  <input type="text" name="username" autoComplete="username" value={email ?? ''} readOnly hidden />
);

function PasswordForm({ email }: { email?: string }) {
  const { fetcher, busy, result, errorFor, formRef, inlineOk } = useSettingsForm('password');
  const [show, setShow] = useState(false);
  const current = errorFor('current');
  const next = errorFor('next');

  // a changed password shouldn't linger in the fields
  useEffect(() => {
    if (result?.ok) {
      formRef.current?.reset();
      setShow(false);
    }
  }, [result]);

  return (
    <fetcher.Form method="post" noValidate ref={formRef} aria-labelledby="password-title">
      <input type="hidden" name="intent" value="password" />
      <Username email={email} />
      <Card
        id="password"
        title="Change password"
        intro={<p className="m-0 text-[14px] text-pencil">Enter your current password to set a new one.</p>}
      >
        <div className="grid gap-5 px-6 pb-[18px] pt-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="pw-current" className="input-label">
              Current password
            </label>
            <input
              id="pw-current"
              name="current"
              type="password"
              autoComplete="current-password"
              aria-invalid={current ? true : undefined}
              aria-describedby={current ? 'pw-current-error' : undefined}
              className="input"
            />
            <FieldError id="pw-current-error">{current}</FieldError>
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="pw-new" className="input-label">
              New password
            </label>
            <div className="relative">
              <input
                id="pw-new"
                name="next"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                aria-invalid={next ? true : undefined}
                aria-describedby={next ? 'pw-new-error' : 'pw-help'}
                className="input pr-[72px]"
              />
              <button
                type="button"
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show}
                onClick={() => setShow((v) => !v)}
                className="absolute right-[6px] top-[6px] h-[34px] cursor-pointer rounded-[6px] border-0 bg-transparent px-[10px] font-sans text-[13px] font-medium text-ink2 underline underline-offset-[3px] outline-none hover:text-ink focus-visible:shadow-[0_0_0_2px_#16140F]"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            {next ? <FieldError id="pw-new-error">{next}</FieldError> : <span id="pw-help" className="input-help">At least 8 characters</span>}
          </div>
        </div>
        <div className="mx-6 mb-[18px] flex items-center gap-[10px] rounded-[10px] border border-info-border bg-info-bg px-3 py-[10px] text-[14px] text-info">
          <Icon.Info className="flex-none" />
          <span className="text-ink">Changing your password signs out every other session.</span>
        </div>
        <div className={FOOTER}>
          <InlineOk>{inlineOk}</InlineOk>
          <button type="submit" className="btn-secondary btn-md" aria-busy={busy || undefined} data-testid="foldo-settings-password">
            <Busy busy={busy} label="Updating">
              Update password
            </Busy>
          </button>
        </div>
      </Card>
    </fetcher.Form>
  );
}

function DeleteForm({ email }: { email?: string }) {
  const { fetcher, busy, errorFor } = useSettingsForm('delete');
  const error = errorFor('current');

  return (
    <fetcher.Form method="post" noValidate aria-labelledby="danger-title">
      <input type="hidden" name="intent" value="delete" />
      <Username email={email} />
      <Card
        id="danger"
        danger
        eyebrow="Danger zone"
        title="Delete account"
        intro={
          <p className="m-0 max-w-[600px] text-[14px] text-ink2 [text-wrap:pretty]">
            Permanently deletes your account, all of your projects and their share links. Anyone opening a shared link will
            see a not-found page. This can't be undone.
          </p>
        }
      >
        <div className="flex flex-wrap items-end gap-3 px-6 pb-[22px] pt-4">
          <div className="flex min-w-[260px] max-w-[360px] flex-1 flex-col gap-[6px]">
            <label htmlFor="del-current" className="input-label">
              Current password
            </label>
            <input
              id="del-current"
              name="current"
              type="password"
              autoComplete="current-password"
              placeholder="Confirm with your password"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'del-error' : undefined}
              className="input"
            />
          </div>
          <button type="submit" className="btn-destructive btn-lg h-[46px]" aria-busy={busy || undefined} data-testid="foldo-settings-delete">
            <Busy busy={busy} label="Deleting">
              <Icon.Trash size={18} />
              Delete my account
            </Busy>
          </button>
          {error && (
            <div className="w-full">
              <FieldError id="del-error">{error}</FieldError>
            </div>
          )}
        </div>
      </Card>
    </fetcher.Form>
  );
}

function SectionNav() {
  const [active, setActive] = useState('profile');
  const clickedAt = useRef(0);

  /*
   * Follow the scroll: the last section whose top has passed a third of the viewport, or the last section once the
   * page can't scroll further. Right after a click the clicked section stays highlighted (the jump itself scrolls, and a
   * short last section can never reach the top).
   */
  useEffect(() => {
    const scroller = document.getElementById('profile')?.closest('.overflow-y-auto');

    if (!scroller) {
      return undefined;
    }

    const onScroll = () => {
      if (Date.now() - clickedAt.current < 600) {
        return;
      }

      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight / 3;
      const passed = SECTIONS.filter((s) => (document.getElementById(s.id)?.getBoundingClientRect().top ?? Infinity) <= line);

      setActive(atBottom && scroller.scrollTop > 0 ? SECTIONS[SECTIONS.length - 1].id : (passed.at(-1) ?? SECTIONS[0]).id);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });

    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav aria-label="Settings sections" className="sticky top-6 flex flex-col gap-[2px] border-t border-ink pt-3 max-md:static">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={active === s.id ? 'true' : undefined}
          onClick={() => {
            clickedAt.current = Date.now();
            setActive(s.id);
          }}
          className={classNames(
            'flex min-h-[40px] items-center gap-[10px] rounded-[6px] px-3 text-[14px] no-underline outline-none focus-visible:shadow-[0_0_0_2px_#16140F]',
            active === s.id ? 'bg-wash font-semibold' : 'font-medium hover:bg-wash',
            s.danger ? 'text-error' : active === s.id ? 'text-ink' : 'text-ink2',
          )}
        >
          {s.icon}
          {s.label}
        </a>
      ))}
    </nav>
  );
}

export default function Settings() {
  const d = useLoaderData<typeof loader>() as ShellData;

  return (
    <PageShell data={d} active="settings" mainClassName="pt-11 pb-[72px]">
      <div className="flex flex-col gap-7" data-testid="foldo-settings">
        <div className="flex flex-col gap-[6px]">
          <h1 className="m-0 font-serif text-[56px] font-normal leading-none tracking-[-.015em]">Settings</h1>
          <p className="m-0 text-[15px] text-pencil">
            Signed in as <span className="font-mono text-[13px] text-ink2">{d.email}</span>
          </p>
        </div>
        <div className="grid items-start gap-12 [grid-template-columns:220px_minmax(0,760px)] max-md:grid-cols-1 max-md:gap-6">
          <SectionNav />
          <div className="flex flex-col gap-5">
            <ProfileForm name={d.name} email={d.email} />
            <PasswordForm email={d.email} />
            <DeleteForm email={d.email} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
