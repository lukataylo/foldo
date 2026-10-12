import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { LoginPage } from '~/components/auth/LoginPage';
import { activeEvent, eventMode, inviteCode, signupsOpen } from '~/lib/.server/config';
import { cleanName, teamNameError } from '~/lib/.server/names';
import {
  clientIp,
  createSession,
  destroySession,
  getUser,
  register,
  safeNext,
  throttled,
  verifyLogin,
} from '~/lib/.server/auth';

export const meta = ({ location }: { location: { search: string } }) => [
  { title: new URLSearchParams(location.search).get('mode') === 'register' ? 'Sign up · Foldo' : 'Sign in · Foldo' },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const next = safeNext(new URL(request.url).searchParams.get('next'));

  return (await getUser(request))
    ? redirect(next)
    : json({
        inviteRequired: inviteCode() !== '',
        signupsOpen: signupsOpen(),
        event: activeEvent()?.name ?? '',
        endsAt: activeEvent()?.endsAt ?? null,
        eventMode: eventMode(),
        next: next === '/' ? '' : next,
      });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData().catch(() => null);

  if (!form) {
    return json({ error: 'Something went wrong. Please try again.' }, 400);
  }
  const intent = form.get('intent');

  if (intent === 'logout') {
    return redirect('/', { headers: { 'Set-Cookie': await destroySession(request) } });
  }

  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const ip = clientIp(request);
  const tooMany = json({ error: 'Too many attempts. Please wait a few minutes and try again.' }, 429);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return json({ error: 'Enter a valid email address.', field: 'email' }, 400);
  }

  if (password.length > 200) {
    return json({ error: 'Use a password of 200 characters or fewer.', field: 'password' }, 400);
  }

  let user;

  if (intent === 'register') {
    // one bucket for every sign-up attempt, so invite codes can't be guessed either
    if (throttled(`reg:${ip}`, 10, 3_600_000)) {
      return json({ error: 'Too many sign-up attempts from this network. Please try again in an hour.' }, 429);
    }

    if (!signupsOpen()) {
      return json({ error: 'Sign-ups are closed right now.', field: 'closed' }, 403);
    }

    const code = inviteCode();

    if (code && String(form.get('invite') ?? '').trim().toLowerCase() !== code.toLowerCase()) {
      const help = eventMode() ? 'Ask an organizer for the right one.' : 'Check it and try again.';

      return json({ error: `That invite code is not valid. ${help}`, field: 'invite' }, 403);
    }

    const name = cleanName(form.get('name'), 40);

    if ([...name].length < 2) {
      return json({ error: eventMode() ? 'Add your name or team name (2+ characters).' : 'Add your name (2+ characters).', field: 'name' }, 400);
    }

    const nameError = teamNameError(name);

    if (nameError) {
      return json({ error: nameError, field: 'name' }, 400);
    }

    if (password.length < 8) {
      return json({ error: 'Use at least 8 characters for your password.', field: 'password' }, 400);
    }

    user = await register(name, email, password);

    if (user === 'exists') {
      return json({ error: 'That email already has an account. Try signing in.', field: 'email' }, 400);
    }
  } else {
    if (throttled(`login:${ip}`, 30, 600_000) || throttled(`login:${email}`, 10, 600_000)) {
      return tooMany;
    }

    user = await verifyLogin(email, password);

    if (user === 'disabled') {
      return json({ error: eventMode() ? 'This account has been disabled. Ask an organizer.' : 'This account has been disabled.' }, 403);
    }

    if (!user) {
      return json({ error: 'Wrong email or password.', field: 'password' }, 401);
    }
  }

  return redirect(safeNext(form.get('next')), { headers: { 'Set-Cookie': await createSession(user.id) } });
}

export default LoginPage;
