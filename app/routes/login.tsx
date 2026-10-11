import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { LoginPage } from '~/components/auth/LoginPage';
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

export const meta = ({ location }: { location: { search: string } }) => [
  { title: new URLSearchParams(location.search).get('mode') === 'register' ? 'Sign up · Foldo' : 'Sign in · Foldo' },
];

export async function loader({ request }: LoaderFunctionArgs) {
  return (await getUser(request))
    ? redirect('/')
    : json({ inviteRequired: inviteCode() !== '', signupsOpen: signupsOpen(), event: getEvent()?.name ?? '', endsAt: getEvent()?.endsAt ?? null });
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
    return json({ error: 'Enter a valid email address.', field: 'email' }, 400);
  }

  let user;

  if (intent === 'register') {
    if (throttled(`reg:${ip}`, 10, 3_600_000)) {
      return tooMany;
    }

    if (!signupsOpen()) {
      return json({ error: 'Sign-ups are closed right now.', field: 'closed' }, 403);
    }

    const code = inviteCode();

    if (code && String(form.get('invite') ?? '').trim().toLowerCase() !== code.toLowerCase()) {
      // same throttle bucket as bad logins so the code can't be guessed
      throttled(`reg:${ip}`, 10, 3_600_000);

      return json({ error: 'That invite code is not valid. Ask an organizer for the right one.', field: 'invite' }, 403);
    }

    const name = String(form.get('name') ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

    if (name.length < 2) {
      return json({ error: 'Add your name or team name (2+ characters).', field: 'name' }, 400);
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
      return json({ error: 'This account has been disabled. Ask an organizer.' }, 403);
    }

    if (!user) {
      return json({ error: 'Wrong email or password.', field: 'password' }, 401);
    }
  }

  return redirect('/', { headers: { 'Set-Cookie': await createSession(user.id) } });
}


export default LoginPage;
