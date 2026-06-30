import { INK, MarketingLayout, MarketingPicture, PILLOW, PromptCaret, YELLOW } from './shared';

const SUGGESTIONS = [
  { label: 'Landing page', href: '/' },
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Book a demo', href: '/demo' },
];

export default function NotFound() {
  return (
    <MarketingLayout title="404 · Foldo">
      <section
        style={{
          maxWidth: 980,
          margin: '0 auto',
          padding: '40px 32px 100px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            background: PILLOW,
            borderRadius: 28,
            padding: '56px 36px 0',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <span
            className="display"
            style={{
              fontSize: 180,
              lineHeight: 0.9,
              color: INK,
              display: 'block',
              letterSpacing: '0.04em',
            }}
          >
            404
          </span>
          <h1
            className="display"
            style={{
              fontSize: 44,
              lineHeight: 1.05,
              margin: '8px 0 14px',
              color: INK,
            }}
          >
            This page got folded<br />under the couch.
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: '#1a1a1a',
              maxWidth: 520,
              margin: '0 auto 28px',
            }}
          >
            Either the URL is wrong, the page was retired, or the dog ate it.
            Probably the dog. Try one of these instead.
          </p>
          <MarketingPicture
            src="/marketing/pillow.png"
            alt="Foldo asleep on a pillow"
            style={{
              maxWidth: 360,
              width: '100%',
              height: 'auto',
              margin: '0 auto',
              display: 'block',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: 32,
          }}
        >
          <a href="/" className="btn-primary">
            <PromptCaret /> Back to landing
          </a>
          {SUGGESTIONS.slice(1).map((s) => (
            <a key={s.label} href={s.href} className="btn-ghost">
              {s.label}
            </a>
          ))}
        </div>

        <p style={{ marginTop: 36, fontSize: 13, color: '#888' }}>
          Still can't find it? <a href="/demo" style={{ color: INK, textDecorationColor: YELLOW }}>Tell us where you were going</a> and we'll fix the trail.
        </p>
      </section>
    </MarketingLayout>
  );
}
