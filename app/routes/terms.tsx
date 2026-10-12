import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { DocPage } from '~/components/landing/DocPage';
import { CompanyName, ContactEmail, Country, EFFECTIVE, type LegalData } from '~/components/landing/legal';
import { getUser, shell } from '~/lib/.server/auth';
import { legalInfo } from '~/lib/.server/config';

export const meta = () => [{ title: 'Terms of service · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { templates: _templates, ...data } = shell((await getUser(request)) ?? undefined);

  return json({ ...data, legal: legalInfo() });
}

export default function Terms() {
  const data = useLoaderData<typeof loader>() as LegalData;
  const { legal } = data;

  return (
    <DocPage
      data={data}
      testId="foldo-terms"
      eyebrow="Terms of service"
      title="The deal, in plain words."
      summary="What you can expect from Foldo, and what Foldo expects from you. Short on purpose."
      updated={EFFECTIVE}
      dateLabel="Effective"
      art={{ src: '/art/terms.webp', alt: 'Foldo the paper dachshund pressing a big rubber stamp onto a paper scroll' }}
      sections={[
        {
          title: 'About these terms',
          body: (
            <p>
              These terms are an agreement between you and <CompanyName legal={legal} /> (“we”, “us”), who runs Foldo. By
              creating an account or using Foldo you accept them, and our{' '}
              <a href="/privacy" className="text-ink underline underline-offset-3">
                privacy policy
              </a>
              . If you use Foldo for an organization, you accept them for it too.
            </p>
          ),
        },
        {
          title: 'Your account',
          body: (
            <p>
              Give a real email address and keep your password to yourself. You’re responsible for what happens under your
              account. You must be at least 13, or old enough to agree to these terms where you live; younger people need a
              parent’s or school’s permission.
            </p>
          ),
        },
        {
          title: 'Acceptable use',
          body: (
            <>
              <p>Build boldly, but don’t use Foldo to:</p>
              <ul>
                <li>
                  Put <strong>real personal or financial data</strong> about anyone into prompts or projects. Use made-up names,
                  accounts and card numbers.
                </li>
                <li>
                  Make <strong>malware, phishing pages or scams</strong>, or apps that break the law. Security projects are
                  welcome when they defend people rather than target them.
                </li>
                <li>
                  <strong>Attack Foldo or other people:</strong> break in, get around limits, overload the service, or tamper with
                  other people’s projects, accounts or likes. If you find a security problem, tell us instead of testing it
                  further.
                </li>
                <li>
                  Share <strong>illegal or harmful content</strong>: harassment, hate, sexual content involving minors, or
                  material that infringes someone else’s rights.
                </li>
              </ul>
            </>
          ),
        },
        {
          title: 'Your content',
          body: (
            <>
              <p>
                You own your prompts and your projects. You give us a worldwide, non-exclusive, royalty-free licence to store,
                run and display them as needed to provide Foldo, and only for that.
              </p>
              <p>
                When you share a project, anyone with the link can open, run and remix it. When you list it in the gallery, you
                also let anyone using Foldo make their own copy and build on it. Stopping sharing turns your link off, but copies
                already made stay with the people who made them.
              </p>
            </>
          ),
        },
        {
          title: 'AI output',
          body: (
            <p>
              Foldo’s code is written by AI models. It can be wrong, insecure, or similar to code other people get. Check it
              before you rely on it, and don’t use it where a mistake could hurt someone. You decide how to use what Foldo
              makes, and that is your responsibility.
            </p>
          ),
        },
        {
          title: 'Beta, free, and as is',
          body: (
            <p>
              Foldo is in beta and free to use. Features, limits and models can change, and we may pause builds for maintenance.
              We provide Foldo “as is”, without warranties of any kind, as far as the law allows. Keep your own copy of anything
              important: Download zip in the studio saves a project’s files.
            </p>
          ),
        },
        {
          title: 'Limitation of liability',
          body: (
            <p>
              As far as the law allows, we aren’t liable for indirect or consequential losses, or for lost data, profits or
              opportunities. Our total liability to you is limited to what you paid us for Foldo in the 12 months before the
              claim. Nothing in these terms limits liability that the law doesn’t allow us to limit.
            </p>
          ),
        },
        {
          title: 'Suspension and ending',
          body: (
            <p>
              You can stop using Foldo and delete your account at any time in Settings. We may hide projects, turn off share
              links, or suspend or close accounts that break these terms, and we’ll tell you why when we can.
            </p>
          ),
        },
        {
          title: 'Events',
          body: (
            <p>
              If you join Foldo through an event, such as a hackathon, class or workshop, its organizers may set extra rules,
              like a code of conduct, and can manage accounts and projects for that event. These terms still apply.
            </p>
          ),
        },
        {
          title: 'Changes',
          body: (
            <p>
              We may update these terms. We’ll change the effective date above and, for significant changes, tell you in Foldo
              before they apply. If you keep using Foldo after that, the new terms apply.
            </p>
          ),
        },
        {
          title: 'Governing law',
          body: (
            <p>
              These terms are governed by the laws of <Country legal={legal} />, and its courts settle disputes. If you’re a
              consumer, you keep the protections of the country you live in.
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
