/*
 * A template project's package.json starts as its pack's (React, the Vite React plugin, the UI kit...). When a reply
 * rewrites package.json with only the packages it thought of, `npm install` prunes the rest and the dev server dies on
 * load ("Cannot find module '@vitejs/plugin-react'" from vite.config.js).
 *
 * So the reply's package.json is checked against the pack's ORIGINAL package.json: any pack package or script the reply
 * left out is put back (at the pack's version), and so is the module `type`. Everything else is the reply's: it can change
 * versions, and it can remove packages it added earlier (a bad package must be removable, or npm fails forever).
 *
 * Returns the text to write; the reply's text unchanged when either side isn't a JSON object or nothing was missing.
 */
const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

type Deps = Record<string, string>;
type Pkg = Record<string, unknown>;

const parse = (text: string): Pkg | undefined => {
  try {
    const value = JSON.parse(text);

    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Pkg) : undefined;
  } catch {
    return undefined;
  }
};

const record = (value: unknown): Deps => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Deps) : {});

export function keepPackDependencies(pack: string, reply: string): string {
  const base = parse(pack);
  const next = parse(reply);

  if (!base || !next) {
    return reply;
  }

  const merged: Pkg = { ...next };
  const present = new Set(FIELDS.flatMap((field) => Object.keys(record(next[field]))));
  let changed = false;

  for (const field of FIELDS) {
    const missing = Object.entries(record(base[field])).filter(([name]) => !present.has(name));

    if (missing.length) {
      merged[field] = { ...record(next[field]), ...Object.fromEntries(missing) };
      changed = true;
    }
  }

  const scripts = record(next.scripts);
  const lostScripts = Object.entries(record(base.scripts)).filter(([name]) => !(name in scripts));

  if (lostScripts.length) {
    merged.scripts = { ...scripts, ...Object.fromEntries(lostScripts) };
    changed = true;
  }

  // the pack's configs are ES modules: dropping "type" breaks them, changing it on purpose is the reply's call
  if (base.type !== undefined && next.type === undefined) {
    merged.type = base.type;
    changed = true;
  }

  return changed ? `${JSON.stringify(merged, null, 2)}\n` : reply;
}
