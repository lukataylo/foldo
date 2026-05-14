import {
  ArrowRight,
  Avatar,
  CheckCircle,
  INK,
  MarketingLayout,
  PILLOW,
  PromptCaret,
  Star,
  YELLOW,
} from './shared';

interface Testimonial {
  quote: string;
  underline?: string;
  name: string;
  role: string;
  initial: string;
  color: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'Foldo makes code reviews actually readable.',
    underline: 'readable',
    name: 'Theo',
    role: 'Staff Engineer',
    initial: 'T',
    color: '#5db0ff',
  },
  {
    quote: 'Fewer lost branches. More shipped features.',
    underline: 'shipped',
    name: 'Jenny',
    role: 'Tech Lead',
    initial: 'J',
    color: '#b08cff',
  },
  {
    quote: 'Finally, PMs can comment without living in the terminal.',
    underline: 'comment',
    name: 'Arjun',
    role: 'Full Stack Dev',
    initial: 'A',
    color: '#ff7849',
  },
];

const STEPS = [
  {
    n: 1,
    title: 'Capture',
    body: 'Connect your repo. Foldo fetches the AI’s output, diffs, and docs. No copy-paste, no Loom.',
    img: '/marketing/step-1-capture.png',
  },
  {
    n: 2,
    title: 'Review',
    body: 'See changes in context. Pin feedback to the exact pixel, yes, even the button colour.',
    img: '/marketing/step-2-review.png',
  },
  {
    n: 3,
    title: 'Edit',
    body: 'Turn comments into prompts. The agent ships a new commit while you sip your coffee.',
    img: '/marketing/step-3-edit.png',
  },
  {
    n: 4,
    title: 'Verify',
    body: 'Replay the recipe, run checks, ship with confidence. Tail wagging optional.',
    img: '/marketing/step-4-verify.png',
  },
];

function underlineWord(text: string, word?: string) {
  if (!word) return text;
  const i = text.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) return text;
  const before = text.slice(0, i);
  const hit = text.slice(i, i + word.length);
  const after = text.slice(i + word.length);
  return (
    <>
      {before}
      <span className="underline-yellow">{hit}</span>
      {after}
    </>
  );
}

export default function Landing() {
  return (
    <MarketingLayout
      title="Foldo · Review AI-built code without losing the plot"
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
              <span style={{ fontSize: 14 }}>✦</span> AI code review, visually
            </span>
            <h1
              className="display h-display"
              style={{
                fontSize: 76,
                lineHeight: 1.02,
                margin: '24px 0 20px',
                color: INK,
              }}
            >
              Review<br />
              AI-built code{' '}
              <span style={{ color: YELLOW }}>without losing</span><br />
              the plot.
            </h1>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.55,
                color: '#3b3b3b',
                maxWidth: 460,
                margin: '0 0 32px',
              }}
            >
              Foldo is a visual review canvas for AI-generated code, docs, and
              app states. See changes, leave feedback, and ship with
              confidence.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <a href="/signup" className="btn-primary">
                <PromptCaret /> Try with your repo
              </a>
              <a href="/demo" className="btn-ghost">
                Book demo
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
                <span style={{ fontWeight: 600, color: INK }}>Open source</span>
                <span style={{ margin: '0 8px', opacity: 0.4 }}>•</span>
                MIT License
              </span>
            </div>
          </div>
          <div>
            <img
              src="/marketing/hero.png"
              alt="Foldo origami dog reviewing AI output"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        </div>
      </section>

      {/* ============== TESTIMONIALS ============== */}
      <section
        id="product"
        style={{ maxWidth: 1240, margin: '0 auto', padding: '60px 32px 24px' }}
      >
        <div className="section-label" style={{ marginBottom: 36 }}>
          LOVED BY DEVELOPERS
        </div>
        <div
          className="stack-mobile"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
          }}
        >
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="card">
              <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} />
                ))}
              </div>
              <p style={{ fontSize: 17, lineHeight: 1.45, margin: '0 0 28px' }}>
                “{underlineWord(t.quote, t.underline)}”
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar initial={t.initial} color={t.color} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: '#666' }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============== HOW IT WORKS ============== */}
      <section
        id="how"
        style={{ background: '#FBF8F4', padding: '64px 0' }}
      >
        <div
          className="stack-sm"
          style={{
            maxWidth: 1240,
            margin: '0 auto',
            padding: '0 32px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 28,
            alignItems: 'center',
          }}
        >
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}
            >
              <img
                src={s.img}
                alt={`${s.title} step`}
                style={{
                  width: '100%',
                  aspectRatio: '4 / 5',
                  objectFit: 'cover',
                  borderRadius: 18,
                }}
              />
              {i < STEPS.length - 1 && (
                <div
                  className="hide-mobile"
                  style={{
                    position: 'absolute',
                    top: '48%',
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
      </section>

      {/* ============== USER TESTS ============== */}
      <section
        id="user-tests"
        style={{ maxWidth: 1240, margin: '0 auto', padding: '64px 32px 24px' }}
      >
        <div className="section-label" style={{ marginBottom: 36 }}>
          NEW · USER TESTS
        </div>
        <div
          className="stack-mobile"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.05fr',
            gap: 48,
            alignItems: 'center',
          }}
        >
          <div>
            <span className="chip">
              <span style={{ fontSize: 14 }}>✦</span> Shipped May 14
            </span>
            <h2
              className="display h-display"
              style={{
                fontSize: 52,
                lineHeight: 1.04,
                margin: '20px 0 18px',
                color: INK,
              }}
            >
              Now let{' '}
              <span style={{ color: YELLOW }}>real users</span>
              <br />
              onto the canvas.
            </h2>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.55,
                color: '#3b3b3b',
                maxWidth: 480,
                margin: '0 0 24px',
              }}
            >
              Every reviewer is a proxy for the real user. User Tests closes the
              last loop: <strong>build → real users try it → evidence → fix</strong>.
              Publish a <code className="mono" style={{ fontSize: 14 }}>foldo.dev/t/:token</code>{' '}
              link and unmoderated screen + voice sessions stream straight back
              onto your board.
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 28px',
                display: 'grid',
                gap: 12,
              }}
            >
              {[
                'Testers record screen + voice against your tasks — three delivery modes auto-detected.',
                'Results land as frames: scrubbable recording, per-task pass/skip stats, transcript, AI synthesis.',
                'Each synthesised issue has a “Make this an edit” button — feedback to a Claude Code commit, in one surface.',
              ].map((line) => (
                <li
                  key={line}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    fontSize: 15,
                    lineHeight: 1.5,
                    color: '#2a2a2a',
                  }}
                >
                  <span style={{ flex: 'none', marginTop: 1 }}>
                    <CheckCircle />
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <a href="/signup" className="btn-primary">
              <PromptCaret /> Run your first test
            </a>
          </div>
          <div className="card">
            <img
              src="/marketing/step-2-review.png"
              alt="A User Test session replaying on a Foldo board"
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                objectFit: 'cover',
                borderRadius: 14,
              }}
            />
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: '#666',
                margin: '16px 0 0',
              }}
            >
              Recording, per-task outcomes, questionnaire answers, transcript,
              and an AI synthesis — all streaming in live as frames you can
              comment on.
            </p>
          </div>
        </div>
      </section>

      {/* ============== BIG CTA ============== */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 32px 60px' }}>
        <div
          className="stack-mobile"
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
              From branch chaos<br />to shipping confidence.
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
              One place to review, align, and ship AI-built work with your
              whole team. Tail wagging not included. That part’s on you.
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
                <PromptCaret /> Try with your repo
              </a>
              <a
                href="/demo"
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
                Book a demo <ArrowRight />
              </a>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <img
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
