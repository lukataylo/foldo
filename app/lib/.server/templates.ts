import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './db';

// Templates are bundled by scripts/build-templates.mjs into public/templates/*.json (generated at build time).
const DIR = join(process.cwd(), 'public', 'templates');

export interface TemplateMeta {
  id: string;
  title: string;
  track: string;
  pack: string;
  packHash: string;
  icon: string;
  summary: string;
  ideas: string[];
  guide: string;
  fileCount: number;
}

interface Index {
  templates: TemplateMeta[];
  packs: Record<string, { id: string; hash: string; dependencies: string[] }>;
}

let cached: Index | undefined;

export function templateIndex(): Index {
  if (!cached) {
    try {
      cached = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as Index;
    } catch {
      return { templates: [], packs: {} }; // not built yet (dev before `npm run templates`): app still works without templates
    }
  }

  return cached;
}

export const getTemplateMeta = (id: unknown) => templateIndex().templates.find((t) => t.id === id);

export function getTemplateFiles(id: string): Record<string, string> | undefined {
  try {
    return (JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8')) as { files: Record<string, string> }).files;
  } catch {
    return undefined;
  }
}

// ---------- prebuilt node_modules snapshots (built once in /admin, stored on the volume) ----------

export const snapshotDir = () => join(dataDir, 'snapshots');
export const snapshotFile = (pack: string, hash: string) => join(snapshotDir(), `${pack}-${hash}.snap.gz`);

// Snapshots shipped inside the repo/image (templates/snapshots) work with zero admin steps; one built in /admin (on the volume) wins.
const bundledSnapshot = (pack: string, hash: string) => join(process.cwd(), 'templates', 'snapshots', `${pack}-${hash}.snap.gz`);

export function findSnapshot(pack: string, hash: string): string | undefined {
  return [snapshotFile(pack, hash), bundledSnapshot(pack, hash)].find((f) => existsSync(f));
}

export function snapshotStatus() {
  const { packs } = templateIndex();

  return Object.fromEntries(
    Object.values(packs).map((p) => {
      const file = findSnapshot(p.id, p.hash);

      return [p.id, { id: p.id, hash: p.hash, bytes: file ? statSync(file).size : 0, // the build time is part of the URL: a rebuilt snapshot must not be served from browsers' immutable cache
        url: file ? `/snapshots/${p.id}-${p.hash}.snap?v=${Math.floor(statSync(file).mtimeMs / 1000)}` : null }];
    }),
  );
}

// ---------- what the model is told when a project starts from a template ----------

const STACK: Record<string, string> = {
  core: `Stack: React 18 + Vite + Tailwind CSS 3 (JavaScript/JSX only, no TypeScript). UI kit in src/components/ui (shadcn/ui style, import like: import { Button } from '@/components/ui/button'). Finance blocks in src/components/finance (AppShell, StatCard, PageHeader, DemoBanner, TrustNote, EmptyState, charts AreaTrend/BarCompare/Donut). Helpers in src/lib: cn(), money()/percent()/shortDate(), loan maths and luhn() in finance.js, seeded fake data in data.js. Icons: lucide-react. Toasts: sonner. Charts: recharts. Validation: zod. Motion: framer-motion. Payments SDKs installed but unused by default: @stripe/stripe-js and @stripe/react-stripe-js (test publishable keys only). Colours come from CSS variables in src/index.css.`,
  carbon: `Stack: React 18 + Vite + IBM Carbon Design System ('@carbon/react', dark g100 theme, precompiled CSS from '@carbon/styles'). No Tailwind in this project. Style with Carbon components, inline styles, Carbon CSS variables (var(--cds-...)) or src/app.css. Import Carbon icons one at a time, e.g. import Add from '@carbon/icons-react/es/add/16.js'.`,
};

export function templateGuide(id: string): string | undefined {
  const meta = getTemplateMeta(id);
  const files = getTemplateFiles(id);

  if (!meta || !files) {
    return undefined;
  }

  const deps = templateIndex().packs[meta.pack]?.dependencies ?? [];
  const paths = Object.keys(files).filter((p) => !/^(package\.json|index\.html|postcss|tailwind|vite)/.test(p) || p === 'index.html');

  return `

<starter_template>
This project was started from the "${meta.title}" template (${meta.track} track). It ALREADY EXISTS and its dev server is ALREADY RUNNING with hot reload. Build on it; do not start over.

${STACK[meta.pack] ?? ''}
Pre-installed packages (do not reinstall): ${deps.join(', ')}.

Existing files:
${paths.map((p) => `- ${p}`).join('\n')}

About this template: ${meta.guide}

Rules for this project:
- Output ONLY the files you create or change, each with its COMPLETE contents (never partial snippets).
- Do NOT output package.json unless you must add a dependency; if you do, include one shell action "npm install <package>" and nothing else for installs.
- Do NOT run "npm run dev" again. Do NOT run "npm install" for anything already listed above.
- Keep the app working after every change; prefer extending existing components over rewriting everything.
- This is a hackathon judged on: real-world impact, originality, execution and craft, and trust and responsibility. So: polished and accessible UI, mobile-friendly, clear empty/loading/error states, plain language for beginners, visible privacy and fairness notes where money or personal data appears, and an explicit "demo only" notice.
- Use fake, seeded data only. Never ask for real card numbers, passwords or API keys, and never hardcode secrets.
</starter_template>`;
}

export const TEMPLATE_REMINDER = `

FINAL REMINDER (highest priority): reply with a single <boltArtifact> containing one <boltAction type="file" filePath="..."> per file you create or change, with the complete file contents. The project already exists and is already running: do NOT include package.json unless adding a dependency, do NOT start the dev server, do NOT reinstall pre-installed packages. Never put project code in markdown code fences. Only answer in plain prose for pure questions.`;
