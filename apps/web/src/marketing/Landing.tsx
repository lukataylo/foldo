import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  INK,
  MarketingLayout,
  MarketingPicture,
  PILLOW,
  PromptCaret,
  SOFT_GREY,
  YELLOW,
} from './shared';

const STEPS = [
  {
    n: 1,
    title: 'Install the GitHub App',
    body: 'One click on your repo. Nothing else to install — no SDK, no CI step, no agent config.',
    img: '/marketing/step-1-capture.png',
  },
  {
    n: 2,
    title: 'Point at your preview',
    body: 'Give Foldo the URL of your deployed preview. That’s where the walkthroughs get filmed.',
    img: '/marketing/step-2-review.png',
  },
  {
    n: 3,
    title: 'Merge a PR',
    body: 'The director re-films only what the diff touched, narrates it, and lands the new walkthrough beside the last one.',
    img: '/marketing/step-3-edit.png',
  },
  {
    n: 4,
    title: 'Comment to change it',
    body: 'A comment on a walkthrough frame becomes a change request dispatched straight to your coding agent.',
    img: '/marketing/step-4-verify.png',
  },
];

/**
 * The 60-second demo video. The mp4 + poster are produced by the walkthrough
 * pipeline itself and dropped into apps/web/public/demo/ — until they exist
 * (or if they fail to load), we show a styled "demo is rendering" card that
 * links to the live public board instead of a broken player.
 */
function DemoVideo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        data-testid="foldo-marketing-demo-video-fallback"
        style={{
          background: '#fff',
          border: `1.5px solid ${SOFT_GREY}`,
          borderRadius: 22,
          padding: '56px 32px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 14 }}>🎬</div>
        <div className="display" style={{ fontSize: 28, marginBottom: 8 }}>
          The demo is rendering.
        </div>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: '#555',
            maxWidth: 420,
            margin: '0 auto 20px',
          }}
        >
          This video is produced by the same pipeline it demonstrates — a
          fresh cut lands here after every merge. In the meantime, the live
          board is better anyway.
        </p>
        <a href="/s/demo" className="btn-primary">
          Explore the live demo board <ArrowRight />
        </a>
      </div>
    );
  }
  return (
    <video
      data-testid="foldo-marketing-demo-video"
      controls
      preload="metadata"
      poster="/demo/foldo-demo-poster.png"
      src="/demo/foldo-demo.mp4"
      onError={() => setFailed(true)}
      style={{
        width: '100%',
        display: 'block',
        borderRadius: 22,
        border: `1.5px solid ${SOFT_GREY}`,
        background: INK,
        aspectRatio: '16 / 9',
      }}
    />
  );
}

export default function Landing() {
  return (
    <MarketingLayout
      title="Foldo · Documentation that updates itself when your agents ship"
      navCurrent={null}
    >
      {/* ============== HERO ============== */}
      <section
        style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 32px 24px' }}
      >
        <div
          className="stack-mobile"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.05fr 1fr',
            gap: 48,
            alignItems: 'center',
          }}
        >
          <div>
            <span className="chip">
              <span style={{ fontSize: 14 }}>✦</span> Living documentation
            </span>
            <h1
              className="display h-display"
              style={{
                fontSize: 64,
                lineHeight: 1.04,
                margin: '24px 0 20px',
                color: INK,
              }}
            >
              Documentation that{' '}
              <span style={{ color: YELLOW }}>updates itself</span> when your
              agents ship
            </h1>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.55,
                color: '#3b3b3b',
                maxWidth: 480,
                margin: '0 0 32px',
              }}
            >
              Your team merges agent-written PRs every week. Foldo turns every
              merge into an up-to-date narrated video walkthrough of what your
              product now does — no repo access needed, no changelog to decode.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <a href="/signup" className="btn-primary">
                <PromptCaret /> Start your 14-day free trial
              </a>
              <a href="/s/demo" className="btn-ghost">
                Explore a live board — no signup
              </a>
            </div>
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                color: '#555',
                fontSize: 14,
              }}
            >
              <CheckCircle />
              <span>
                <span style={{ fontWeight: 600, color: INK }}>
                  £79/month per product
                </span>
                <span style={{ margin: '0 8px', opacity: 0.4 }}>•</span>
                14-day free trial ·{' '}
                <a
                  href="/pricing"
                  style={{
                    color: INK,
                    textDecorationColor: YELLOW,
                    textDecorationThickness: 2,
                    textUnderlineOffset: 3,
                  }}
                >
                  see pricing
                </a>
              </span>
            </div>
          </div>
          <div>
            <MarketingPicture
              src="/marketing/hero.png"
              alt="Foldo origami dog directing a product walkthrough"
              eager
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        </div>
      </section>

      {/* ============== 60-SECOND DEMO ============== */}
      <section
        id="product"
        style={{ maxWidth: 980, margin: '0 auto', padding: '48px 32px 24px' }}
      >
        <div className="section-label" style={{ marginBottom: 10 }}>
          SEE IT IN 60 SECONDS
        </div>
        <h2
          className="display"
          style={{
            fontSize: 40,
            lineHeight: 1.05,
            margin: '0 0 24px',
            textAlign: 'center',
          }}
        >
          A merge becomes a walkthrough.
        </h2>
        <DemoVideo />
        <p
          style={{
            textAlign: 'center',
            fontSize: 14,
            color: '#666',
            margin: '14px 0 0',
          }}
        >
          Prefer to poke around yourself?{' '}
          <a
            href="/s/demo"
            style={{
              color: INK,
              fontWeight: 600,
              textDecorationColor: YELLOW,
              textDecorationThickness: 2,
              textUnderlineOffset: 3,
            }}
          >
            Explore a live board — no signup
          </a>
          .
        </p>
      </section>

      {/* ============== HOW IT WORKS ============== */}
      <section id="how" style={{ background: '#FBF8F4', padding: '64px 0', marginTop: 40 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px' }}>
          <div className="section-label" style={{ marginBottom: 36 }}>
            HOW IT WORKS
          </div>
          <div
            className="stack-sm step-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 28,
              alignItems: 'start',
            }}
          >
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <MarketingPicture
                  src={s.img}
                  alt={`Step ${s.n}: ${s.title}`}
                  style={{
                    width: '100%',
                    aspectRatio: '4 / 5',
                    objectFit: 'cover',
                    borderRadius: 18,
                  }}
                />
                <div
                  style={{
                    marginTop: 14,
                    display: 'flex',
                    gap: 10,
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    className="display"
                    style={{ fontSize: 22, color: YELLOW }}
                  >
                    {s.n}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{s.title}</span>
                </div>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: '#555',
                    margin: '6px 0 0',
                  }}
                >
                  {s.body}
                </p>
                {i < STEPS.length - 1 && (
                  <div
                    className="hide-mobile step-arrow"
                    style={{
                      position: 'absolute',
                      top: '38%',
                      right: -22,
                      width: 24,
                      color: '#11111155',
                    }}
                  >
                    <ArrowRight />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============== BYTE-IDENTICAL HONESTY ============== */}
      <section
        style={{ maxWidth: 980, margin: '0 auto', padding: '64px 32px 24px' }}
      >
        <div
          className="card"
          style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}
        >
          <span style={{ flex: 'none', marginTop: 4 }}>
            <CheckCircle />
          </span>
          <div>
            <div className="display" style={{ fontSize: 26, marginBottom: 8 }}>
              Byte-identical honesty.
            </div>
            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.6,
                color: '#333',
                margin: 0,
              }}
            >
              Steps the diff didn’t touch aren’t re-recorded — they’re reused{' '}
              <strong>byte-for-byte</strong>, with the{' '}
              <code className="mono" style={{ fontSize: 13.5 }}>
                sha256
              </code>{' '}
              of every take shown in the manifest. When a walkthrough says
              “nothing else changed”, your stakeholders can verify it, not
              take it on faith.
            </p>
          </div>
        </div>
      </section>

      {/* ============== BIG CTA ============== */}
      <section
        style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 32px 60px' }}
      >
        <div
          className="stack-mobile pillow-cta"
          style={{
            background: PILLOW,
            borderRadius: 24,
            padding: '56px 40px 56px 112px',
            display: 'grid',
            gridTemplateColumns: '1.7fr 1fr',
            gap: 24,
            alignItems: 'center',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div style={{ position: 'relative', zIndex: 2 }}>
            <h2
              className="display h-display"
              style={{
                fontSize: 52,
                lineHeight: 1.02,
                margin: '0 0 18px',
                color: INK,
              }}
            >
              Stop asking<br />“what shipped this week?”
            </h2>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.5,
                color: '#1a1a1a',
                maxWidth: 460,
                margin: '0 0 28px',
              }}
            >
              £79/month per product, 14-day free trial. Watch what changed
              instead of reading a changelog — and comment to send the fix
              back to your agent.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 22,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <a href="/signup" className="btn-primary">
                <PromptCaret /> Start free trial
              </a>
              <a
                href="/pricing"
                style={{
                  color: INK,
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: 'underline',
                  textDecorationThickness: 1.5,
                  textUnderlineOffset: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                See pricing <ArrowRight />
              </a>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <MarketingPicture
              src="/marketing/pillow.png"
              alt="Foldo resting on a pillow"
              style={{
                width: '118%',
                height: 'auto',
                display: 'block',
                marginRight: '-18%',
                marginLeft: '-6%',
              }}
            />
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
