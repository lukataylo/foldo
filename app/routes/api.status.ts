import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { remainingQuota, requireApiUser } from '~/lib/.server/auth';
import { pauseState } from '~/lib/.server/config';

// GET: what an open studio needs to stay current without a reload (the organizer pause and the team's messages left)
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireApiUser(request);
  const { paused, message, since } = pauseState();

  return json({ paused, message, since, remaining: remainingQuota(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
