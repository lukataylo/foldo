import { INK, MarketingLayout, PILLOW, PromptCaret, SOFT_GREY, YELLOW } from './shared';

const STEPS = [
  {
    n: 1,
    title: 'Install the extension',
    body: "Grab the Foldo button from the Chrome Web Store, or load the dist/ folder unpacked from the repo while we wait for the listing to clear review.",
  },
  {
    n: 2,
    title: 'Open the deploy you want to review',
    body: 'Any URL works: a Vercel preview, your staging environment, an internal admin page that lives behind SSO, or just localhost:3000.',
  },
  {
    n: 3,
    title: 'Click "Freeze to Foldo"',
    body: 'The extension takes a snapshot of the current page, including styles, screen size, and the active route, and ships it to whichever Foldo board you choose.',
  },
  {
    n: 4,
    title: 'Comment, dispatch, ship',
    body: 'The frozen frame lands as an app frame on the canvas. Pin comments to elements, fire dispatches at your agent, repeat until you ship.',
  },
];

export default function Extension() {
  return (
    <MarketingLayout title="Chrome extension · Foldo">
      {/* Hero */}
      <section
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '40px 32px 24px',
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: 56,
          alignItems: 'center',
        }}
        className="stack-mobile"
      >
        <div>
          <span className="chip">Chrome extension</span>
          <h1
            className="display h-display"
            style={{
              fontSize: 64,
              lineHeight: 1.04,
              margin: '20px 0 16px',
              color: INK,
            }}
          >
            Freeze any deploy.<br />
            <span style={{ color: YELLOW }}>One click.</span>
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: '#3b3b3b',
              maxWidth: 520,
              margin: '0 0 24px',
            }}
          >
            The Foldo browser extension turns whatever you're looking at into a
            review frame on your canvas. Works on Vercel previews, staging
            sites, SSO-walled admin tools, and yes, plain old localhost.
          </p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <a
              href="https://chrome.google.com/webstore"
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              <PromptCaret /> Get it for Chrome
            </a>
            <a
              href="https://github.com/lukataylo/foldo/tree/main/apps/extension"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              Load unpacked →
            </a>
          </div>
          <p style={{ marginTop: 14, fontSize: 12.5, color: '#888' }}>
            Manifest V3 · works in Chrome, Edge, Arc, Brave · open source (MIT)
          </p>
        </div>
        <div
          style={{
            background: PILLOW,
            borderRadius: 24,
            padding: '40px 32px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow:
              '0 1px 0 rgba(0,0,0,0.04), 0 30px 60px -40px rgba(17,17,17,0.25)',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              border: `1.5px solid ${SOFT_GREY}`,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 13,
              color: INK,
              marginBottom: 16,
            }}
          >
            <Puzzle />
            <span style={{ fontWeight: 700 }}>Foldo · Freeze this page</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>⌘⇧F</span>
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              fontSize: 14,
              color: INK,
              display: 'grid',
              gap: 8,
            }}
          >
            <li>↻ snapshot of the live DOM</li>
            <li>↻ viewport size + scroll position</li>
            <li>↻ the active route and any query params</li>
            <li>↻ which board to send it to</li>
          </ul>
          <p style={{ marginTop: 16, fontSize: 12, color: '#444' }}>
            (Edit dispatches still loop through your local MCP, the extension
            handles capture only.)
          </p>
        </div>
      </section>

      {/* Steps */}
      <section
        id="how"
        style={{ background: '#FBF8F4', padding: '56px 0 64px', marginTop: 24 }}
      >
        <div
          className="stack-sm"
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '0 32px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 22,
          }}
        >
          {STEPS.map((s) => (
            <div key={s.n}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: YELLOW,
                  color: INK,
                  fontWeight: 800,
                  fontSize: 13,
                  marginBottom: 10,
                }}
              >
                {s.n}
              </span>
              <div className="display" style={{ fontSize: 22, marginBottom: 6 }}>
                {s.title}
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: '#3b3b3b', margin: 0 }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section
        style={{ maxWidth: 880, margin: '0 auto', padding: '64px 32px 80px' }}
      >
        <div className="section-label" style={{ marginBottom: 16 }}>
          QUESTIONS
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <details
            style={{
              background: '#fff',
              border: `1.5px solid ${SOFT_GREY}`,
              borderRadius: 14,
              padding: '18px 22px',
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>
              Does it work on SSO-protected pages?
            </summary>
            <p style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.6, color: '#444' }}>
              Yes. Because the extension runs in your browser tab, it inherits
              whatever cookies + sessions you're already logged in with. Foldo
              never sees your credentials, only the rendered HTML snapshot you
              choose to freeze.
            </p>
          </details>
          <details
            style={{
              background: '#fff',
              border: `1.5px solid ${SOFT_GREY}`,
              borderRadius: 14,
              padding: '18px 22px',
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>
              Why not just paste a URL into Foldo?
            </summary>
            <p style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.6, color: '#444' }}>
              You can. Foldo iframes the URL inside a canvas frame. The
              extension matters for two things: pages that block iframing
              (most modern SaaS) and pages behind auth that need your browser's
              session to render.
            </p>
          </details>
          <details
            style={{
              background: '#fff',
              border: `1.5px solid ${SOFT_GREY}`,
              borderRadius: 14,
              padding: '18px 22px',
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>
              Is the extension open source?
            </summary>
            <p style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.6, color: '#444' }}>
              All of Foldo is MIT licensed. The extension source lives in{' '}
              <code>apps/extension/</code> in the main repo. Inspect, fork, or
              build your own.
            </p>
          </details>
        </div>
      </section>
    </MarketingLayout>
  );
}

function Puzzle() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M3 3h4a1 1 0 0 0 2 0h4v4a1 1 0 0 1 0 2v4H9a1 1 0 0 0-2 0H3V9a1 1 0 0 1 0-2z" />
    </svg>
  );
}
