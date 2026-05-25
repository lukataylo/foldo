// A+W1 touch: gentle landing page that replaces the canvas at <600px viewport.
// The canvas is built for tablets+laptops — on phone the tool dock, EditPanel,
// ZoomControl and FrameMeta kebabs all collide. Better to redirect users to a
// place that *does* work on phone (the home grid + share viewer) than to ship
// a degraded canvas.

import { FoldoMark, MarketingStyles, INK, PAPER, SOFT_GREY, YELLOW } from '../marketing/shared';

export function PhoneNotSupportedBanner(): JSX.Element {
  return (
    <div
      data-testid="foldo-phone-not-supported"
      style={{
        position: 'fixed',
        inset: 0,
        background: PAPER,
        color: INK,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        overflow: 'auto',
      }}
    >
      <MarketingStyles />
      <div
        style={{
          maxWidth: 360,
          width: '100%',
          background: '#fff',
          border: `1.5px solid ${SOFT_GREY}`,
          borderRadius: 20,
          padding: '28px 22px',
          textAlign: 'center',
          boxShadow: '0 18px 36px -22px rgba(17,17,17,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <FoldoMark size={56} />
        </div>
        <h1
          className="display"
          style={{ fontSize: 26, lineHeight: 1.1, margin: '0 0 12px' }}
        >
          The canvas is happiest on a bigger screen.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: '#555', margin: '0 0 22px' }}>
          Foldo's review canvas is built for iPad and desktop. Open this URL on
          an iPad or laptop to get drawing tools, comments and the layer panel.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: '#777', margin: '0 0 22px' }}>
          To read a board on phone, ask a colleague for a <strong>share link</strong> —
          the read-only viewer works at any size.
        </p>
        <a
          href="/home"
          style={{
            display: 'inline-block',
            background: YELLOW,
            color: INK,
            fontWeight: 700,
            fontSize: 15,
            padding: '12px 22px',
            borderRadius: 999,
            textDecoration: 'none',
            border: `1.5px solid ${INK}`,
          }}
        >
          Go to your boards
        </a>
      </div>
    </div>
  );
}
