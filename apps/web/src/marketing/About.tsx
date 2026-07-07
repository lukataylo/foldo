import SimplePage from './SimplePage';

export default function About() {
  return (
    <SimplePage
      title="About Foldo"
      chip="🐕 About"
      intro="Foldo started as a Friday afternoon hack: a small dachshund, a big canvas, and the conviction that PR review is broken when half your team writes the code."
    >
      <h2>Why</h2>
      <p>
        Most review tools were designed when humans wrote the first draft. Now agents do. We needed a surface that lets the rest of the team (PMs, designers, founders) actually <em>see</em> what the agent changed, comment on it like a Figma frame, and dispatch a follow-up without copying prompts back into a terminal.
      </p>

      <h2>The team</h2>
      <p>
        Built by a small team in London and Tbilisi. Open to contribution. The canvas, the MCP runner, and the marketing site all live in one MIT-licensed monorepo.
      </p>

      <h2>Beliefs</h2>
      <ul>
        <li>Viewers and commenters are always free. We bill per product, not per seat.</li>
        <li>Boring UI is the right UI. The animation belongs in the code, not the chrome.</li>
        <li>Self-hostable from day one.</li>
        <li>The dog stays.</li>
      </ul>

      <h2>Stack</h2>
      <p>
        TypeScript everywhere · Fastify + Postgres on the back · Vite + React on the front · MCP for agent integration · Railway + Cloudflare for hosting · Luckiest Guy for the headline type.
      </p>

      <h2>Hiring</h2>
      <p>
        We're not hiring yet. We are looking for design partners: teams of 3 to 20 engineers who already have agents pushing branches and need a better review surface. <a href="/demo">Say hi</a>.
      </p>
    </SimplePage>
  );
}
