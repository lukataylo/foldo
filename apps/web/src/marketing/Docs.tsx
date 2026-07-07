import { type ReactNode } from 'react';
import { ArrowRight, INK, MarketingLayout, PILLOW, SOFT_GREY, YELLOW } from './shared';

interface DocPage {
  slug: string;
  group: string;
  title: string;
  blurb: string;
  Body: () => JSX.Element;
}

// --- doc bodies ----------------------------------------------------------

function IndexBody() {
  return (
    <>
      <h1>The Foldo manual.</h1>
      <p>
        Everything you need to set up Foldo, plug in an agent, and ship a
        reviewed merge before lunch. If the dog can do it, so can you.
      </p>
      <h2>Start here</h2>
      <ul>
        <li><a href="/docs/getting-started">Getting started</a> · install, seed, open your first board.</li>
        <li><a href="/docs/concepts">Concepts</a> · boards, frames, dispatches, and what a "fold" is.</li>
        <li><a href="/docs/mcp">MCP server</a> · wire Claude Code into your board.</li>
        <li><a href="/docs/self-host">Self-host</a> · deploy Foldo to your own infra.</li>
      </ul>
      <h2>The short version</h2>
      <p>
        Foldo is living documentation for agent-built software. You install
        the GitHub App, every merged PR becomes a narrated video walkthrough
        of what your product now does, and comments on a walkthrough dispatch
        change requests back to your coding agent.
      </p>
      <blockquote>
        Foldo is the surface. The agent is the coder. You're the director.
      </blockquote>
    </>
  );
}

function GettingStartedBody() {
  return (
    <>
      <h1>Getting started.</h1>
      <p>
        Five minutes from clone to canvas. If it takes longer, blame the dog.
      </p>

      <h2>1. Clone & install</h2>
      <pre><code>{`git clone https://github.com/lukataylo/foldo.git
cd foldo
npm install`}</code></pre>

      <h2>2. Start the dev stack</h2>
      <pre><code>{`npm run dev`}</code></pre>
      <p>This boots three services on three ports (local dev only. The
        hosted Foldo at foldo.dev is a single origin):</p>
      <ul>
        <li><code>http://localhost:5173</code> · the canvas (you'll spend your day here)</li>
        <li><code>http://localhost:4000</code> · the Fastify API + WebSocket gateway (Postgres-backed)</li>
        <li><code>http://localhost:5174</code> · the sample app rendered inside frames</li>
      </ul>
      <p>
        You'll need a running Postgres. Locally the simplest path is{' '}
        <code>brew install postgresql@16 && brew services start postgresql@16</code>{' '}
        then drop a one-line <code>.env</code> at the repo root:{' '}
        <code>DATABASE_URL=postgres://$USER@localhost:5432/foldo</code>.
      </p>

      <h2>3. Open the seeded board</h2>
      <p>
        Visit <a href="http://localhost:5173">localhost:5173</a> and you'll
        land on <code>board-acme-landing</code>, a seeded board with three
        branches and a handful of pinned comments. Click any orange pin to see
        a comment thread. Hit <em>Make this an edit</em> to turn it into a
        dispatch (which will run in the simulator unless you've connected an
        MCP, see the MCP guide).
      </p>

      <h2>4. Plug in an agent (optional)</h2>
      <p>To wire Foldo into Claude Code via MCP, see <a href="/docs/mcp">the MCP guide</a>.</p>

      <h2>What's next</h2>
      <p>
        Drop a pin. Send a dispatch. Watch a new frame appear with a connector
        line back to its parent. That's the loop. Everything else is icing.
      </p>
    </>
  );
}

function ConceptsBody() {
  return (
    <>
      <h1>Concepts.</h1>
      <p>
        Foldo has a small vocabulary on purpose. Learn five nouns and you'll
        understand the entire app.
      </p>

      <h2>Board</h2>
      <p>
        A single project. Usually one repo. Boards have branches, frames, and
        comments. URLs look like <code>/board/board-acme-landing</code>.
      </p>

      <h2>Branch</h2>
      <p>
        A horizontal row on the canvas. Maps 1:1 to a git branch. Has a colour,
        an author (human <em>or</em> agent), and a head SHA.
      </p>

      <h2>Frame</h2>
      <p>
        A single tile on the canvas. Frames come in two flavours:
      </p>
      <ul>
        <li><strong>App frames</strong> are live iframes of your running app at a specific commit, navigated to a specific reproducible state.</li>
        <li><strong>Markdown frames</strong> are PRDs, ADRs, READMEs, rendered alongside the code that implements them.</li>
      </ul>

      <h2>Comment</h2>
      <p>
        A pin on a frame. Has a position, an author, replies, and optionally a
        <code>target</code> (the element it's anchored to). Comments can be
        resolved, replied to, or <em>turned into edits</em>.
      </p>

      <h2>Dispatch</h2>
      <p>
        A structured prompt sent to an agent. Carries the branch, base commit,
        the file being edited, the element selector, the recipe to reach this
        UI state, and the reviewer's natural-language intent. The agent
        returns a new commit and a new frame.
      </p>

      <blockquote>
        Comments are how humans talk to the canvas. Dispatches are how the
        canvas talks to the agent.
      </blockquote>
    </>
  );
}

function McpBody() {
  return (
    <>
      <h1>MCP server.</h1>
      <p>
        Foldo ships a Model Context Protocol server that bridges your local
        Claude Code (or any MCP client) to a Foldo cloud board. Edits flow
        comment → dispatch → MCP tool call → real commit.
      </p>

      <h2>Install</h2>
      <p>
        The MCP server lives at <code>apps/mcp</code>. Build it once:
      </p>
      <pre><code>{`npm run build --workspace apps/mcp`}</code></pre>

      <h2>Wire it into Claude Code</h2>
      <p>
        Add the following to your Claude Code <code>settings.json</code>:
      </p>
      <pre><code>{`{
  "mcpServers": {
    "foldo": {
      "command": "node",
      "args": [
        "/absolute/path/to/foldo/apps/mcp/bin/foldo-mcp.mjs"
      ]
    }
  }
}`}</code></pre>

      <h2>What it exposes</h2>
      <p>The MCP server registers four tools that Claude Code can call:</p>
      <ul>
        <li><code>foldo_list_branches</code> · list every branch on the active board.</li>
        <li><code>foldo_freeze_current_state</code> · snapshot the current UI into a frame.</li>
        <li><code>foldo_replay_recipe</code> · re-run a recorded sequence of actions on the running app.</li>
        <li><code>foldo_apply_edit_prompt</code> · execute a Foldo dispatch as a real code edit + commit.</li>
      </ul>

      <h2>How dispatch routing works</h2>
      <p>
        When a reviewer hits <em>Send to Claude Code</em>, the cloud creates
        a <code>Dispatch</code> record. If a local MCP server is online for
        the board, the dispatch is forwarded over <code>/ws/mcp</code>; if
        not, the cloud simulates the lifecycle so the demo still works.
        Either way, the browser sees the same <code>dispatch.status</code>
        stream.
      </p>
    </>
  );
}

function ClaudeInstallBody() {
  return (
    <>
      <h1>Claude / agent install.</h1>
      <p>
        Foldo ships a small, public package called{' '}
        <a
          href="https://github.com/lukataylo/foldo-claude"
          target="_blank"
          rel="noreferrer"
        >
          <code>foldo-claude</code>
        </a>{' '}
        that hooks Claude (or any MCP-capable agent) into your Foldo account
        so it can drop new screens onto your boards. Four tools, two install
        paths.
      </p>

      <h2>1. Mint an API token</h2>
      <p>
        Go to <a href="/settings">/settings → API tokens</a>, give the token a
        label (something like <code>claude-laptop</code>), and copy the value
        that appears once. We won't show it again.
      </p>

      <h2>2a. Install as a Claude Code plugin</h2>
      <p>One command, in Claude Code:</p>
      <pre><code>{`/plugin install lukataylo/foldo-claude`}</code></pre>
      <p>Then set the token as an env var before launching Claude Code:</p>
      <pre><code>{`export FOLDO_TOKEN="<the value you just copied>"`}</code></pre>
      <p>
        The plugin bundles the MCP server and a skill that teaches Claude when
        to use each tool. You'll see the foldo_* tools appear in the picker
        once the plugin reloads.
      </p>

      <h2>2b. Or install as a stand-alone MCP server</h2>
      <p>
        Works with Cursor, Aider, custom agents, the Anthropic API directly,
        anything that speaks MCP:
      </p>
      <pre><code>{`claude mcp add foldo -- npx -y github:lukataylo/foldo-claude foldo-mcp`}</code></pre>
      <p>Or, in your MCP host's JSON config:</p>
      <pre><code>{`{
  "mcpServers": {
    "foldo": {
      "command": "npx",
      "args": ["-y", "github:lukataylo/foldo-claude", "foldo-mcp"],
      "env": {
        "FOLDO_API_URL": "https://api.foldo.dev",
        "FOLDO_TOKEN": "<your-token-here>"
      }
    }
  }
}`}</code></pre>

      <h2>3. The four tools</h2>
      <ul>
        <li>
          <code>foldo_list_boards</code> · enumerate the boards you can see.
          Call this first when the user says "my board".
        </li>
        <li>
          <code>foldo_create_board</code> · start a fresh board owned by you.
          Args: <code>name</code>, <code>repoSlug</code>, optional{' '}
          <code>devUrl</code>.
        </li>
        <li>
          <code>foldo_capture_url</code> · snapshot a public URL as a new app
          frame. Args: <code>boardId</code>, <code>url</code>, optional{' '}
          <code>title</code> and <code>viewport</code>. Iframes the URL; for
          auth-walled pages, supply filming credentials in the board's
          settings instead.
        </li>
        <li>
          <code>foldo_add_frame</code> · drop a free-form frame. Args:{' '}
          <code>boardId</code>, <code>content</code> with{' '}
          <code>kind: 'markdown' | 'sticky' | 'image'</code>. Use sticky for
          quick notes, markdown for PRDs, image for screenshots or attachments.
        </li>
      </ul>

      <h2>4. Talk to your agent</h2>
      <p>Some prompts that work today:</p>
      <ul>
        <li>"List my Foldo boards."</li>
        <li>
          "Add a sticky to my acme/landing board that says 'fix the pricing
          dropdown by Friday'."
        </li>
        <li>
          "Capture https://acme-landing-git-feat-cta.vercel.app/pricing to my
          acme/landing board."
        </li>
        <li>
          "Create a new board called <em>pixel/website</em> pointed at the
          pixel/website repo."
        </li>
      </ul>

      <h2>Auth & rotation</h2>
      <p>
        Tokens are long-lived but revocable. Treat them like passwords. If
        you suspect a token was leaked, revoke it from{' '}
        <a href="/settings">/settings → API tokens</a> and mint a fresh one.
        Revoking takes effect immediately; the next REST call from that token
        returns <code>401 UNAUTHORIZED</code>.
      </p>

      <h2>How it differs from the in-repo MCP</h2>
      <p>
        Foldo has <strong>two</strong> MCP servers and they do different jobs.
        The one you just installed (<code>foldo-claude</code>) is for pushing
        screens from anywhere. The one in <code>apps/mcp/</code> inside the
        main monorepo is for running Foldo against your own repo — it knows
        about git, runs Playwright, and powers the in-canvas{' '}
        <em>Send to Claude Code</em> button. See{' '}
        <a href="/docs/mcp">/docs/mcp</a> for that one.
      </p>
    </>
  );
}

function SelfHostBody() {
  return (
    <>
      <h1>Self-host.</h1>
      <p>
        Foldo is MIT-licensed. You can run it on your own infra. Recommended
        setup for an alpha: a single Railway service per app, a Postgres
        addon, and a Redis addon if you need horizontal scale.
      </p>

      <h2>The three runtime services</h2>
      <ul>
        <li><strong>apps/server</strong> · Fastify + Postgres. Exposes REST + two WebSocket endpoints.</li>
        <li><strong>apps/web</strong> · Vite-built static SPA. Serve via <code>vite preview</code> or any CDN.</li>
        <li><strong>apps/sample-app</strong> · optional demo app rendered inside frames. Replace with your own.</li>
      </ul>

      <h2>Required environment</h2>
      <pre><code>{`# server
PORT=4000
DATABASE_URL=postgres://USER@localhost:5432/foldo
FOLDO_WEB_ORIGIN=https://foldo.dev,https://sample.foldo.dev
FOLDO_PUBLIC_WEB_ORIGIN=https://foldo.dev
FOLDO_SAMPLE_APP_URL=https://sample.foldo.dev
# Optional · verify GitHub push webhooks
FOLDO_GITHUB_WEBHOOK_SECRET=…

# web (baked into the bundle at build time)
VITE_API_URL=https://api.foldo.dev
VITE_WS_URL=wss://api.foldo.dev
VITE_SAMPLE_URL=https://sample.foldo.dev

# sample-app (build-time)
VITE_PARENT_ORIGIN=https://foldo.dev`}</code></pre>

      <h2>Database</h2>
      <p>
        Foldo uses Postgres in production. The schema bootstraps itself on
        first boot. Every <code>CREATE TABLE</code> is wrapped in
        <code>IF NOT EXISTS</code>, so pointing at a fresh database is all you
        need. For multi-replica setups, just scale the server service
        horizontally; sessions and shares live in Postgres.
      </p>

      <h2>Deploy to Railway</h2>
      <p>
        Each app ships its own <code>railway.json</code> (e.g.{' '}
        <code>apps/server/railway.json</code>) wiring the service to its
        Dockerfile — point each Railway service&apos;s config-file path at
        the matching file. Provision a Postgres plugin and wire{' '}
        <code>${'${{Postgres.DATABASE_URL}}'}</code> into the server
        service. Custom domains (Cloudflare → CNAME → Railway) take a few
        minutes once added in the Railway dashboard.
      </p>
    </>
  );
}

// --- pages ---------------------------------------------------------------

const PAGES: DocPage[] = [
  {
    slug: '',
    group: 'INTRO',
    title: 'Welcome',
    blurb: 'Start here. The two-minute tour.',
    Body: IndexBody,
  },
  {
    slug: 'getting-started',
    group: 'INTRO',
    title: 'Getting started',
    blurb: 'Five minutes from clone to canvas.',
    Body: GettingStartedBody,
  },
  {
    slug: 'concepts',
    group: 'CORE',
    title: 'Concepts',
    blurb: 'Boards, frames, comments, dispatches.',
    Body: ConceptsBody,
  },
  {
    slug: 'mcp',
    group: 'CORE',
    title: 'MCP server',
    blurb: 'Wire Claude Code into your canvas.',
    Body: McpBody,
  },
  {
    slug: 'claude',
    group: 'CORE',
    title: 'Claude / agent install',
    blurb: 'Install foldo-claude so Claude can push screens for you.',
    Body: ClaudeInstallBody,
  },
  {
    slug: 'self-host',
    group: 'OPS',
    title: 'Self-host',
    blurb: 'Run Foldo on your own infra.',
    Body: SelfHostBody,
  },
];

// --- view ----------------------------------------------------------------

export default function Docs({ slug }: { slug: string }) {
  const page = PAGES.find((p) => p.slug === slug) ?? PAGES[0];
  return (
    <MarketingLayout
      title={page.slug ? `${page.title} · Foldo docs` : 'Foldo docs'}
      navCurrent="docs"
    >
      <div
        className="stack-mobile"
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: '24px 32px 40px',
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: 48,
          alignItems: 'start',
        }}
      >
        <DocsSidebar activeSlug={page.slug} />
        <DocsBody page={page} />
      </div>
    </MarketingLayout>
  );
}

function DocsSidebar({ activeSlug }: { activeSlug: string }) {
  const groups = Array.from(new Set(PAGES.map((p) => p.group)));
  return (
    <aside
      style={{
        position: 'sticky',
        top: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          border: `1.5px solid ${SOFT_GREY}`,
          borderRadius: 16,
          padding: '20px 14px',
        }}
      >
        <a
          href="/docs"
          style={{
            display: 'block',
            padding: '4px 12px 14px',
            textDecoration: 'none',
            color: INK,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Docs
        </a>
        {groups.map((g) => (
          <div key={g} style={{ marginTop: 4 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.16em',
                fontWeight: 700,
                color: '#888',
                padding: '12px 12px 6px',
              }}
            >
              {g}
            </div>
            {PAGES.filter((p) => p.group === g).map((p) => (
              <a
                key={p.slug || 'index'}
                className={`doc-link${p.slug === activeSlug ? ' active' : ''}`}
                href={p.slug ? `/docs/${p.slug}` : '/docs'}
              >
                {p.title}
              </a>
            ))}
          </div>
        ))}
        <div
          style={{
            marginTop: 16,
            padding: '14px',
            background: PILLOW,
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
            Found a typo?
          </div>
          <div style={{ fontSize: 12.5, color: '#1a1a1a', lineHeight: 1.55, marginBottom: 8 }}>
            The docs live in the repo. PRs welcome, bring snacks.
          </div>
          <a
            href="https://github.com/lukataylo/foldo"
            style={{ fontSize: 13, fontWeight: 700, color: INK, textDecoration: 'underline' }}
          >
            Edit on GitHub →
          </a>
        </div>
      </div>
    </aside>
  );
}

function DocsBody({ page }: { page: DocPage }) {
  const Body = page.Body;
  const idx = PAGES.findIndex((p) => p.slug === page.slug);
  const prev = idx > 0 ? PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < PAGES.length - 1 ? PAGES[idx + 1] : null;
  return (
    <article>
      <div
        style={{
          background: '#fff',
          border: `1.5px solid ${SOFT_GREY}`,
          borderRadius: 22,
          padding: '44px 56px',
        }}
        className="prose"
      >
        <Body />
      </div>

      <NavPager prev={prev} next={next} />
    </article>
  );
}

function NavPager({ prev, next }: { prev: DocPage | null; next: DocPage | null }) {
  return (
    <div
      className="stack-sm"
      style={{
        marginTop: 24,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 14,
      }}
    >
      {prev ? (
        <a
          href={prev.slug ? `/docs/${prev.slug}` : '/docs'}
          style={{
            background: '#fff',
            border: `1.5px solid ${SOFT_GREY}`,
            borderRadius: 14,
            padding: 18,
            textDecoration: 'none',
            color: INK,
          }}
        >
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4, letterSpacing: '0.12em' }}>← PREVIOUS</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{prev.title}</div>
        </a>
      ) : <div />}
      {next ? (
        <a
          href={next.slug ? `/docs/${next.slug}` : '/docs'}
          style={{
            background: '#fff',
            border: `1.5px solid ${SOFT_GREY}`,
            borderRadius: 14,
            padding: 18,
            textDecoration: 'none',
            color: INK,
            textAlign: 'right',
          }}
        >
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4, letterSpacing: '0.12em' }}>NEXT →</div>
          <div style={{ fontWeight: 700, fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {next.title} <ArrowRight />
          </div>
        </a>
      ) : <div />}
    </div>
  );
}

export { PAGES as DOC_PAGES };
