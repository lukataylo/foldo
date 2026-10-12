import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { DocPage } from '~/components/landing/DocPage';
import { CompanyName, ContactEmail, EFFECTIVE, type LegalData } from '~/components/landing/legal';
import { getUser, shell } from '~/lib/.server/auth';
import { legalInfo } from '~/lib/.server/config';

export const meta = () => [{ title: 'Privacy policy · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { templates: _templates, ...data } = shell((await getUser(request)) ?? undefined);

  return json({ ...data, legal: legalInfo() });
}

// written from what the code stores and sends (lib/.server/db.ts, auth.ts, backup.ts, routes/api.chat.ts, api.waitlist.ts, settings.tsx)
export default function Privacy() {
  const data = useLoaderData<typeof loader>() as LegalData;
  const { legal } = data;

  return (
    <DocPage
      data={data}
      testId="foldo-privacy"
      eyebrow="Privacy policy"
      title="What Foldo keeps, and why."
      summary="Foldo stores only what it needs to run your account and your projects. No tracking, no ads, and we never sell your data."
      updated={EFFECTIVE}
      dateLabel="Effective"
      art={{ src: '/art/privacy-policy.webp', alt: 'Foldo the paper dachshund resting on a stack of folders under a yellow paper umbrella' }}
      sections={[
        {
          title: 'Who we are',
          body: (
            <p>
              Foldo is a vibe-coding platform: you describe an app and it is built and run in your browser. It is operated by{' '}
              <CompanyName legal={legal} /> (“we”, “us”), who decides how your data is used. Questions about this policy go to{' '}
              <ContactEmail legal={legal} />.
            </p>
          ),
        },
        {
          title: 'What we collect',
          body: (
            <ul>
              <li>
                <strong>Your account:</strong> your name, email address and a scrypt hash of your password. We never store the
                password itself.
              </li>
              <li>
                <strong>Your projects:</strong> each project’s title and its chat, meaning your prompts and Foldo’s replies,
                including the code it wrote.
              </li>
              <li>
                <strong>Sharing:</strong> the share link of a project you share, whether you listed it in the gallery, and its
                gallery thumbnail.
              </li>
              <li>
                <strong>Likes:</strong> which gallery projects you liked.
              </li>
              <li>
                <strong>Usage counts:</strong> how many AI messages you sent each day, so daily limits work.
              </li>
              <li>
                <strong>Waitlist emails:</strong> if you ask to hear about Foldo Pro on the Pricing page, the address you gave and
                when.
              </li>
            </ul>
          ),
        },
        {
          title: 'Why we use it',
          body: (
            <p>
              To run your account and your projects (that is the service you asked for), to enforce fair daily limits and keep
              Foldo secure (our legitimate interest in a working, safe platform), and to send you one email when Pro is ready if
              you joined the waitlist (your consent, which you can withdraw at any time).
            </p>
          ),
        },
        {
          title: 'Cookies and tracking',
          body: (
            <p>
              Foldo sets one cookie, <code className="font-mono text-[15px]">foldo_session</code>, to keep you signed in for up
              to 30 days. There are no analytics, ads or tracking scripts. Your network address is used only in memory to slow
              down repeated attempts and is not saved with your account. Fonts load from Google Fonts, and the in-browser
              workspace that runs your app loads from StackBlitz, so those services see your network address.
            </p>
          ),
        },
        {
          title: 'AI providers',
          body: (
            <p>
              To build your app, your prompts and the project’s chat, including its code, are sent to the AI model providers we
              use. Listed projects are also sent once to draw their gallery thumbnail. Those providers process the text under
              their own terms and may be in other countries. Don’t put real personal or financial data in a prompt.
            </p>
          ),
        },
        {
          title: 'Share links and the gallery',
          body: (
            <p>
              Projects stay private until you share them. A share link is public: anyone who has it can open the project, read
              its prompts and code, run it and remix their own copy. If you list a project in the gallery, your name, the
              project title, its thumbnail and its like count are shown publicly. Stopping sharing turns the link off; copies
              other people already remixed are theirs.
            </p>
          ),
        },
        {
          id: 'events',
          title: 'If you join an event',
          body: (
            <>
              <p>
                Hackathons, classrooms and workshops can run on Foldo. While one is running, its organizers use Foldo’s admin
                console. They can see account names, email addresses and message counts, change daily limits, pause builds,
                hide projects from the gallery, disable accounts and reset passwords.
              </p>
              <p>
                Organizers can also download backups of the database, which contain everything listed above, including project
                chats. They can’t see your password. An event may have its own code of conduct.
              </p>
            </>
          ),
        },
        {
          title: 'Who else handles it',
          body: (
            <p>
              Only the services that run Foldo for us: our hosting provider, the AI providers above, and StackBlitz and Google
              Fonts in your browser. We don’t sell your data or share it with advertisers. We disclose data to authorities only
              when the law requires it.
            </p>
          ),
        },
        {
          title: 'How long we keep it',
          body: (
            <p>
              Your account and projects stay until you delete them. The server keeps rolling backups of the database, by default
              a fresh copy every 10 minutes with the last 6 hours kept, so deleted data can stay in a backup until it rolls over.
              Waitlist emails are kept until Pro launches and we have emailed you, or until you ask us to remove yours.
            </p>
          ),
        },
        {
          title: 'Deleting your data',
          body: (
            <p>
              Delete a single project from Your projects. To delete everything, open Settings and use Delete account in the
              Danger zone: it removes your account, your projects, their share links and your likes straight away. Daily message
              counts stay as plain numbers that no longer point to a name or email. To leave the waitlist, email us.
            </p>
          ),
        },
        {
          title: 'Your rights',
          body: (
            <>
              <p>Depending on where you live, you have the right to:</p>
              <ul>
                <li>
                  <strong>Access</strong> the data we hold about you, and get a copy.
                </li>
                <li>
                  <strong>Correct</strong> it. You can change your name in Settings.
                </li>
                <li>
                  <strong>Delete</strong> it, with Delete account in Settings.
                </li>
                <li>
                  <strong>Take it with you:</strong> Download zip in the studio saves a project’s files.
                </li>
                <li>
                  <strong>Object</strong> to or restrict how we use it.
                </li>
                <li>
                  <strong>Complain</strong> to your data protection regulator.
                </li>
              </ul>
              <p>
                For anything you can’t do yourself in Foldo, email <ContactEmail legal={legal} />.
              </p>
            </>
          ),
        },
        {
          title: 'Children',
          body: (
            <p>
              Foldo is not meant for children under 13, or under the age of digital consent where you live, without a parent’s
              or school’s permission. If you think a child has given us data without it, contact us and we’ll delete it.
            </p>
          ),
        },
        {
          title: 'Changes to this policy',
          body: (
            <p>
              We’ll update this page when what we collect or how we use it changes, and change the effective date above. For
              significant changes we’ll also tell you in Foldo before they apply.
            </p>
          ),
        },
        {
          title: 'Contact',
          body: (
            <p>
              <CompanyName legal={legal} />, <ContactEmail legal={legal} />.
            </p>
          ),
        },
      ]}
    />
  );
}
