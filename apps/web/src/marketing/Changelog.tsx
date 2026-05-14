import SimplePage from './SimplePage';

const ENTRIES = [
  {
    date: '2026-05-13',
    title: 'Inline PRD editor + author tints',
    items: [
      'Double-click a markdown frame to edit it in place. The gutter on each line shows who last touched it in their brand colour.',
      'New: share board links (`/share/<token>`), public read-only viewer.',
      'New: /home with Figma-style board grid, ⌘K command palette, account settings.',
      'Honesty pass: dispatches now say "simulated, no commit pushed" when no MCP is connected.',
      'Multi-tenancy: every boards endpoint is now scoped to membership.',
    ],
  },
  {
    date: '2026-05-12',
    title: 'Real auth + Railway',
    items: [
      'Real email + password (scrypt hashing), session tokens, change-password + revoke devices.',
      'Migrated from SQLite to Postgres.',
      'Three services live on Railway: server, web, sample-app.',
    ],
  },
  {
    date: '2026-05-10',
    title: 'Marketing site',
    items: [
      'Landing, docs, pricing, demo, signup, login, 404 shipped.',
      'Brand pass with Luckiest Guy + the pillow dachshund.',
    ],
  },
];

export default function Changelog() {
  return (
    <SimplePage
      title="Changelog"
      chip="📜 Changelog"
      intro="What we shipped, in newest-first order. Boring updates are deliberately left in."
    >
      {ENTRIES.map((e) => (
        <section key={e.date} style={{ marginBottom: 30 }}>
          <h2 style={{ marginBottom: 4 }}>{e.title}</h2>
          <div style={{ color: '#888', fontSize: 13, marginBottom: 10 }}>
            <code>{e.date}</code>
          </div>
          <ul>
            {e.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </section>
      ))}
    </SimplePage>
  );
}
