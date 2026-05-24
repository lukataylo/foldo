import { CheckCircle, INK, MarketingLayout, MarketingPicture, PILLOW, PromptCaret, SOFT_GREY, YELLOW } from './shared';

interface Tier {
  name: string;
  tagline: string;
  price: string;
  cadence: string;
  cta: string;
  ctaHref: string;
  featured?: boolean;
  features: string[];
}

const TIERS: Tier[] = [
  {
    name: 'Solo Pup',
    tagline: 'For the lone dev who lets the agent write the first draft.',
    price: '$0',
    cadence: 'forever',
    cta: 'Start free',
    ctaHref: '/signup',
    features: [
      'Unlimited personal boards',
      '1 reviewer (you, with snacks)',
      'Live preview frames',
      'Comments, pins, and replies',
      'Chrome extension capture',
      'Community Discord',
    ],
  },
  {
    name: 'The Pack',
    tagline: 'For teams who ship together and disagree politely about colours.',
    price: '$24',
    cadence: 'per editor / month',
    cta: 'Start the pack',
    ctaHref: '/signup?plan=pack',
    featured: true,
    features: [
      'Everything in Solo Pup',
      'Unlimited reviewers (read-only)',
      'Live multiplayer cursors + follow-me',
      'Edit dispatches via MCP',
      'GitHub PR + webhook sync',
      'Slack + Linear integrations',
      'Branded board sharing',
    ],
  },
  {
    name: 'Top Dog',
    tagline: 'For orgs whose security team has opinions and an SSO checklist.',
    price: "Let's talk",
    cadence: 'per seat / month',
    cta: 'Book a demo',
    ctaHref: '/demo',
    features: [
      'Everything in The Pack',
      'SAML SSO + SCIM',
      'Self-hosted option (MIT)',
      'Audit log + data residency',
      'Custom MCP runners',
      'Priority support',
      'A real human on call',
    ],
  },
];

const FAQ = [
  {
    q: 'Do I have to use Claude Code?',
    a: 'Nope. Any MCP-capable agent works. Cursor, Aider, your own homemade runner. Foldo is the surface, not the coder.',
  },
  {
    q: 'What counts as an "editor"?',
    a: 'Anyone who creates comments, sends dispatches, or accepts merges. Read-only reviewers (PMs, designers staring at things) are always free.',
  },
  {
    q: 'Can I self-host?',
    a: 'Yes. The entire stack is MIT-licensed. Clone the repo, run npm install, deploy to your platform of choice. See /docs/self-host.',
  },
  {
    q: 'Is my code being sent to a third party?',
    a: 'Only to the agent you point Foldo at, which is your call. We see frame metadata, comments, and dispatch logs. Source diffs stay in your repo.',
  },
  {
    q: 'Can I cancel?',
    a: "Anytime. We won't make you talk to a goodbye specialist. The dog will be sad. That's the only consequence.",
  },
];

export default function Pricing() {
  return (
    <MarketingLayout title="Pricing · Foldo" navCurrent="pricing">
      <section
        style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 32px 0', textAlign: 'center' }}
      >
        <span className="chip">
          <span style={{ fontSize: 14 }}>$</span> Pricing
        </span>
        <h1
          className="display h-display"
          style={{ fontSize: 64, lineHeight: 1.04, margin: '20px 0 14px', color: INK }}
        >
          Plans that scale<br />
          with your <span style={{ color: YELLOW }}>pack.</span>
        </h1>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: '#3b3b3b',
            maxWidth: 580,
            margin: '0 auto 36px',
          }}
        >
          Free for solo devs. Honest pricing for teams. No seat hoarding,
          no surprise fees, no breath-taking renewals.
        </p>
      </section>

      <section
        style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px 40px' }}
      >
        <div
          className="stack-sm"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 22,
            alignItems: 'stretch',
          }}
        >
          {TIERS.map((t) => (
            <div key={t.name} className={`price-card${t.featured ? ' featured' : ''}`}>
              {t.featured && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <span
                    className="chip"
                    style={{
                      background: YELLOW,
                      color: INK,
                      fontSize: 10.5,
                    }}
                  >
                    Most popular
                  </span>
                </div>
              )}
              <div
                className="display price-name"
                style={{ fontSize: 28 }}
              >
                {t.name}
              </div>
              <p
                className="price-note"
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  margin: '6px 0 22px',
                  minHeight: 44,
                  color: t.featured ? '#ddd' : '#666',
                }}
              >
                {t.tagline}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <span
                  className="display price-amount"
                  style={{ fontSize: 48 }}
                >
                  {t.price}
                </span>
                <span className="price-note" style={{ fontSize: 13, color: t.featured ? '#ccc' : '#666' }}>
                  / {t.cadence}
                </span>
              </div>
              <a
                href={t.ctaHref}
                className={t.featured ? 'btn-yellow' : 'btn-primary'}
                style={{ marginTop: 18, justifyContent: 'center', width: '100%' }}
              >
                {t.featured ? <PromptCaret /> : null} {t.cta}
              </a>
              <hr style={{ margin: '24px 0', border: 'none', borderTop: `1px solid ${t.featured ? '#333' : SOFT_GREY}` }} />
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="price-feature"
                    style={{ display: 'flex', gap: 10, fontSize: 14, color: t.featured ? '#ddd' : '#333' }}
                  >
                    <span style={{ marginTop: 1, flex: 'none' }}>
                      <CheckCircle color={t.featured ? '#fff' : YELLOW} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Compare strip */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 32px 24px' }}>
        <div
          style={{
            background: '#fff',
            border: `1.5px solid ${SOFT_GREY}`,
            borderRadius: 22,
            padding: '32px 36px',
            display: 'flex',
            alignItems: 'center',
            gap: 32,
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <MarketingPicture
              src="/marketing/step-4-verify.png"
              alt="Foldo verifying"
              style={{ width: 110, height: 'auto', flex: 'none' }}
            />
            <div>
              <div className="display" style={{ fontSize: 26, lineHeight: 1.05, marginBottom: 4 }}>
                Reviewers are always free.
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#555', margin: 0, maxWidth: 520 }}>
                PMs, designers, founders, your aunt. Anyone can leave comments
                without taking up an editor seat. We count editors, not eyeballs.
              </p>
            </div>
          </div>
          <a href="/signup" className="btn-primary">
            <PromptCaret /> Try free
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 880, margin: '0 auto', padding: '64px 32px 40px' }}>
        <div className="section-label" style={{ marginBottom: 22 }}>
          QUESTIONS WE GET A LOT
        </div>
        <h2
          className="display"
          style={{
            fontSize: 44,
            lineHeight: 1.05,
            margin: '0 0 32px',
            textAlign: 'center',
          }}
        >
          The fine print, in plain English.
        </h2>
        <div style={{ display: 'grid', gap: 14 }}>
          {FAQ.map((f) => (
            <details
              key={f.q}
              style={{
                background: '#fff',
                border: `1.5px solid ${SOFT_GREY}`,
                borderRadius: 14,
                padding: '18px 22px',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 16,
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {f.q}
                <span style={{ color: PILLOW, fontSize: 22, lineHeight: 1 }}>+</span>
              </summary>
              <p style={{ marginTop: 12, marginBottom: 0, fontSize: 15, lineHeight: 1.6, color: '#444' }}>
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
