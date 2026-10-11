import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import type { ShellData } from '~/components/PageShell';
import { DocPage } from '~/components/landing/DocPage';
import { getUser, shell } from '~/lib/.server/auth';

export const meta = () => [{ title: 'Privacy notice · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { templates: _templates, ...data } = shell((await getUser(request)) ?? undefined);

  return json(data);
}

// written from what the code stores and sends (lib/.server/db.ts, auth.ts, backup.ts, routes/api.chat.ts, settings.tsx)
export default function Privacy() {
  const data = useLoaderData<typeof loader>() as ShellData;
  const event = data.event?.name || 'the event';

  return (
    <DocPage
      data={data}
      testId="foldo-privacy"
      eyebrow="Privacy notice"
      title="What Foldo keeps, and why."
      summary="Foldo stores only what it needs to run your team's account and projects. No tracking, no ads."
      updated="11 October 2026"
      art={{ src: '/art/privacy.webp', alt: 'Foldo locking a padlock on a paper box' }}
      sections={[
        {
          title: 'What we store',
          body: (
            <ul>
              <li>
                <strong>Your account:</strong> team name, email address and a scrypt hash of your password. We never store the
                password itself.
              </li>
              <li>
                <strong>Your projects:</strong> each project's title and its chat, meaning your prompts and Foldo's replies,
                including the code it wrote.
              </li>
              <li>
                <strong>Sharing:</strong> the share link of a project you share, and whether you listed it in the gallery.
              </li>
              <li>
                <strong>Likes:</strong> which gallery projects your team liked.
              </li>
              <li>
                <strong>Usage:</strong> how many AI messages your team sent each day, so daily limits work.
              </li>
            </ul>
          ),
        },
        {
          title: 'Cookies and tracking',
          body: (
            <p>
              Foldo sets one cookie, <code className="font-mono text-[15px]">foldo_session</code>, to keep you signed in for up
              to 30 days. There are no analytics, ads or tracking scripts. Your network address is used only in memory to slow
              down repeated sign-in attempts and is not saved. Fonts load from Google Fonts, and the in-browser workspace that
              runs your app loads from StackBlitz.
            </p>
          ),
        },
        {
          title: 'AI providers',
          body: (
            <p>
              To build your app, your prompts and the project's chat, including its code, are sent to the AI providers the
              organizers have set up for {event}. Those providers process the text under their own terms. Don't put real
              personal or financial data in a prompt.
            </p>
          ),
        },
        {
          title: 'Projects and sharing',
          body: (
            <p>
              Projects stay private until you share them. Anyone with a share link can open the project, run it and remix
              their own copy. If you list it in the gallery, your team name, the project title and its like count are shown
              publicly. You can stop sharing at any time, which turns the link off.
            </p>
          ),
        },
        {
          title: 'What organizers can see',
          body: (
            <p>
              Organizers run the event from an admin console. They can see team names, email addresses and message counts,
              hide projects from the gallery, disable accounts and reset passwords. They can also download backups of the
              database, which contain everything listed above.
            </p>
          ),
        },
        {
          title: 'Backups',
          body: (
            <p>
              The server keeps automatic backups of the database on its own storage volume, by default a fresh copy every 10
              minutes with the last 6 hours kept. Anything you delete can stay in those backups until they roll over.
            </p>
          ),
        },
        {
          title: 'Deleting your data',
          body: (
            <p>
              Delete a single project from Your projects. To delete everything, open Settings and use Delete account in the
              Danger zone: it removes your account, your projects, their share links and your likes straight away. Daily
              message counts stay as plain numbers that no longer point to a name or email.
            </p>
          ),
        },
        {
          title: 'After the event',
          body: <p>The organizers of {event} decide how long the server and its data are kept after the event ends.</p>,
        },
        {
          title: 'Questions',
          body: <p>Ask an organizer at the help desk.</p>,
        },
      ]}
    />
  );
}
