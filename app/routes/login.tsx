import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from '@remix-run/react';
import { useState } from 'react';
import { Logo } from '~/components/brand/Logo';
import { getEvent, inviteCode, signupsOpen } from '~/lib/.server/config';
import {
  clientIp,
  createSession,
  destroySession,
  getUser,
  register,
  throttled,
  verifyLogin,
} from '~/lib/.server/auth';

export const meta = () => [{ title: 'Sign in · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  return (await getUser(request))
    ? redirect('/')
    : json({ inviteRequired: inviteCode() !== '', signupsOpen: signupsOpen(), event: getEvent()?.name ?? '' });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get('intent');

  if (intent === 'logout') {
    return redirect('/', { headers: { 'Set-Cookie': await destroySession(request) } });
  }

  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const ip = clientIp(request);
  const tooMany = json({ error: 'Too many attempts. Please wait a few minutes and try again.' }, 429);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200 || password.length > 200) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }

  let user;

  if (intent === 'register') {
    if (throttled(`reg:${ip}`, 10, 3_600_000)) {
      return tooMany;
    }

    if (!signupsOpen()) {
      return json({ error: 'Sign-ups are closed right now.' }, 403);
    }

    const code = inviteCode();

    if (code && String(form.get('invite') ?? '').trim().toLowerCase() !== code.toLowerCase()) {
      // same throttle bucket as bad logins so the code can't be guessed
      throttled(`reg:${ip}`, 10, 3_600_000);

      return json({ error: 'That invite code is not valid. Ask an organizer for the right one.' }, 403);
    }

    const name = String(form.get('name') ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

    if (name.length < 2) {
      return json({ error: 'Add your name or team name (2+ characters).' }, 400);
    }

    if (password.length < 8) {
      return json({ error: 'Use at least 8 characters for your password.' }, 400);
    }

    user = await register(name, email, password);

    if (user === 'exists') {
      return json({ error: 'That email already has an account. Try signing in.' }, 400);
    }
  } else {
    if (throttled(`login:${ip}`, 30, 600_000) || throttled(`login:${email}`, 10, 600_000)) {
      return tooMany;
    }

    user = await verifyLogin(email, password);

    if (user === 'disabled') {
      return json({ error: 'This account has been disabled. Ask an organizer.' }, 403);
    }

    if (!user) {
      return json({ error: 'Wrong email or password.' }, 401);
    }
  }

  return redirect('/', { headers: { 'Set-Cookie': await createSession(user.id) } });
}

export default function Login() {
  const error = useActionData<typeof action>()?.error;
  const { inviteRequired, signupsOpen: open, event } = useLoaderData<typeof loader>() as any;
  const [params] = useSearchParams();
  const busy = useNavigation().state === 'submitting';
  const signup = params.get('mode') === 'register';
  const [show, setShow] = useState(false);
  const field =
    'w-full rounded-xl border border-[#E6E3DE] bg-white px-3.5 py-2.5 text-[15px] text-[#111] outline-none placeholder:text-[#aaa] focus:border-[#111]';

  return (
    <div className="flex min-h-full flex-col bg-[#FDF7EF] text-[#111]">
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-5">
        <Logo size={36} className="text-[#111]" />
        <a className="text-sm text-[#555]" href={signup ? '/login' : '/login?mode=register'}>
          {signup ? 'Have an account?' : 'New here?'}{' '}
          <span className="font-bold text-[#111]">{signup ? 'Sign in →' : 'Sign up →'}</span>
        </a>
      </header>

      <main className="mx-auto grid w-full max-w-[1100px] flex-1 items-center gap-10 px-6 pb-16 md:grid-cols-2">
        <Form
          method="post"
          className="rounded-3xl border border-[#E6E3DE] bg-white p-9 shadow-[0_30px_60px_-40px_rgba(17,17,17,0.25)]"
          data-testid="foldo-auth-form"
        >
          <h1 className="font-display text-4xl">{signup ? 'Make something.' : 'Welcome back.'}</h1>
          <p className="mb-6 mt-1 text-[#666]">
            {signup
              ? event
                ? `Join ${event} and start building.`
                : 'Create a free account to start building.'
              : 'Sign in to pick up where you left off.'}
          </p>

          {signup && !open && (
            <p className="mb-4 rounded-lg bg-[#fff4d6] px-3 py-2 text-sm text-[#7a5000]">Sign-ups are closed right now.</p>
          )}
          {signup && (
            <>
              <label className="mb-1 block text-sm font-semibold" htmlFor="name">
                Name or team
              </label>
              <input id="name" className={`${field} mb-4`} name="name" placeholder="Team Dachshund" autoComplete="nickname" maxLength={40} required />
            </>
          )}
          <label className="mb-1 block text-sm font-semibold" htmlFor="email">
            Email
          </label>
          <input id="email" className={field} name="email" type="email" placeholder="you@example.com" autoComplete="email" autoFocus={!signup} required />

          <label className="mb-1 mt-4 block text-sm font-semibold" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              className={`${field} pr-16`}
              name="password"
              type={show ? 'text' : 'password'}
              placeholder={signup ? 'At least 8 characters' : 'Your password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              required
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#777] hover:text-[#111]"
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>

          {signup && inviteRequired && (
            <>
              <label className="mb-1 mt-4 block text-sm font-semibold" htmlFor="invite">
                Invite code
              </label>
              <input id="invite" className={field} name="invite" placeholder="From your organizer" autoComplete="off" required />
            </>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-[#fdecec] px-3 py-2 text-sm text-[#b42318]">
              {error}
            </p>
          )}

          <button
            name="intent"
            value={signup ? 'register' : 'login'}
            disabled={busy || (signup && !open)}
            className="mt-6 w-full rounded-xl bg-[#111] px-4 py-3 text-[15px] font-semibold text-white hover:bg-black disabled:opacity-60"
          >
            {busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
          </button>
        </Form>

        <img
          src="/art/sleepy.webp"
          alt=""
          width={800}
          height={1000}
          className="hidden max-h-[520px] w-full rounded-[28px] object-cover md:block"
        />
      </main>
    </div>
  );
}
