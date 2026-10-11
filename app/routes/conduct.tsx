import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import type { ShellData } from '~/components/PageShell';
import { DocPage } from '~/components/landing/DocPage';
import { getUser, shell } from '~/lib/.server/auth';

export const meta = () => [{ title: 'Code of conduct · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { templates: _templates, ...data } = shell((await getUser(request)) ?? undefined);

  return json(data);
}

export default function Conduct() {
  const data = useLoaderData<typeof loader>() as ShellData;
  const event = data.event?.name;

  return (
    <DocPage
      data={data}
      testId="foldo-conduct"
      eyebrow="Code of conduct"
      title="Play fair, build boldly."
      summary={`A few simple rules so everyone at ${event || 'the event'} has a good night.`}
      updated="11 October 2026"
      art={{ src: '/art/conduct.webp', alt: 'Foldo as a referee with a whistle and a pennant' }}
      sections={[
        {
          title: 'Be kind',
          body: (
            <p>
              Treat every team, mentor, judge and organizer with respect. Help people who are stuck, credit ideas you borrow,
              and keep feedback about the work, not the person.
            </p>
          ),
        },
        {
          title: 'No harassment',
          body: (
            <p>
              No harassment, intimidation or discrimination of any kind, in person or in what you build and share. That
              includes offensive project names, images and gallery entries.
            </p>
          ),
        },
        {
          title: 'Build things that are legal and safe',
          body: (
            <p>
              No malware, phishing pages that could fool real people, scams, or apps that break the law. Fraud and security
              projects are welcome, as long as they defend people rather than target them.
            </p>
          ),
        },
        {
          title: 'Keep real data out of demos',
          body: (
            <p>
              This is a finance hackathon, so use made-up names, accounts, card numbers and balances. Never paste real
              personal or financial details into a prompt or a project. Prompts are sent to AI providers, and shared projects
              can be opened by anyone with the link.
            </p>
          ),
        },
        {
          title: "Don't attack the platform or other teams",
          body: (
            <p>
              Don't try to break into Foldo, get around message limits, or tamper with other teams' projects, accounts or
              likes. If you find a security problem, tell an organizer instead of testing it further.
            </p>
          ),
        },
        {
          title: 'What organizers can do',
          body: (
            <p>
              Organizers can hide projects from the gallery, turn off share links and disable accounts that break these
              rules, and may ask a team to leave the event.
            </p>
          ),
        },
        {
          title: 'Reporting a problem',
          body: (
            <p>
              If something makes you uncomfortable, or you see a project that breaks these rules, talk to an organizer at the
              help desk. Reports are handled quietly.
            </p>
          ),
        },
      ]}
    />
  );
}
