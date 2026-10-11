/*
 * A template project's package.json belongs to its pack (React, the Vite React plugin, the UI kit...). When a reply
 * rewrites package.json with only the packages it thought of, `npm install` prunes the rest and the dev server dies on
 * load ("Cannot find module '@vitejs/plugin-react'" from vite.config.js). So in a template project the reply's
 * package.json is merged over the existing one: its scripts and versions win, but nothing the pack installed is dropped.
 *
 * Returns the text to write, or the reply's text unchanged when either side isn't a JSON object.
 */
const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

type Pkg = Record<string, unknown> & Partial<Record<(typeof FIELDS)[number], Record<string, string>>>;

const parse = (text: string): Pkg | undefined => {
  try {
    const value = JSON.parse(text);

    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Pkg) : undefined;
  } catch {
    return undefined;
  }
};

export function keepPackDependencies(existing: string, incoming: string): string {
  const before = parse(existing);
  const after = parse(incoming);

  if (!before || !after) {
    return incoming;
  }

  const merged: Pkg = { ...before, ...after };
  let added = false;

  for (const field of FIELDS) {
    const kept = { ...(before[field] ?? {}) };

    // a package the reply moved between dependencies and devDependencies is not duplicated
    for (const other of FIELDS) {
      for (const name of Object.keys(after[other] ?? {})) {
        delete kept[name];
      }
    }

    if (Object.keys(kept).length) {
      merged[field] = { ...kept, ...(after[field] ?? {}) };
      added = true;
    }
  }

  merged.scripts = { ...((before.scripts as object) ?? {}), ...((after.scripts as object) ?? {}) };

  return added || JSON.stringify(merged) !== JSON.stringify(after) ? `${JSON.stringify(merged, null, 2)}\n` : incoming;
}
