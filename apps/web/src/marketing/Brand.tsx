import SimplePage from './SimplePage';
import { INK, PAPER, PILLOW, SOFT_GREY, YELLOW } from './shared';

const SWATCHES = [
  { name: 'Foldo Black', hex: INK, label: 'Type, icons, primary CTA.' },
  { name: 'Paper White', hex: PAPER, label: 'Page background.' },
  { name: 'Review Yellow', hex: YELLOW, label: 'Highlights, active states.' },
  { name: 'Pillow Yellow', hex: PILLOW, label: 'Big illustrations, "$" plan card.' },
  { name: 'Soft Grey', hex: SOFT_GREY, label: 'Card borders, hairlines.' },
];

export default function Brand() {
  return (
    <SimplePage
      title="Brand"
      chip="🎨 Brand"
      intro="Press kit-ish. Logos, colours, and the typography we use. Take what you need."
    >
      <h2>Colours</h2>
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          margin: '18px 0 28px',
        }}
      >
        {SWATCHES.map((s) => (
          <div
            key={s.hex}
            style={{
              border: `1.5px solid ${SOFT_GREY}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <div style={{ background: s.hex, height: 90 }} />
            <div style={{ padding: '10px 12px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>{s.hex}</div>
              <div style={{ fontSize: 12, color: '#777', marginTop: 4, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <h2>Typography</h2>
      <ul>
        <li><strong>Display:</strong> <a href="https://fonts.google.com/specimen/Luckiest+Guy" target="_blank" rel="noreferrer">Luckiest Guy</a>. Used for headlines and the wordmark.</li>
        <li><strong>Body:</strong> Inter 400 / 500 / 600 / 700.</li>
        <li><strong>Mono:</strong> JetBrains Mono, used in code blocks and the canvas's commit shas.</li>
      </ul>

      <h2>Wordmark</h2>
      <p>
        The wordmark is the lowercase Luckiest-Guy <code>foldo</code> paired with the dachshund mark. Don't recolour the mark.
      </p>

      <h2>Voice</h2>
      <ul>
        <li>Short, playful, never cute for cute's sake.</li>
        <li>Dog metaphors are encouraged. Bone-tier puns are not.</li>
        <li>Be honest about what's simulated vs real. If the MCP isn't connected, say so.</li>
      </ul>

      <h2>Press</h2>
      <p>
        High-res assets, hero shots, and the brand-guide PDF: email <a href="mailto:press@foldo.dev">press@foldo.dev</a>.
      </p>
    </SimplePage>
  );
}
