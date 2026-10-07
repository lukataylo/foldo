import { atom } from 'nanostores';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';

export interface TemplateCard {
  id: string;
  title: string;
  track: string;
  pack: string;
  icon: string;
  summary: string;
  ideas: string[];
}

// shown to the user while a template is being set up ("Loading packages (18 MB)...")
export const templateStatus = atom<string | undefined>(undefined);
export const activeTemplate = atom<string | undefined>(undefined);

export const templateIcon = (icon?: string) => `/art/tpl-${icon || 'paper'}.webp`;

// generated artwork (webp) when it exists, the hand-drawn SVG otherwise. The ref catches images that already failed to
// load before React attached onError (server-rendered pages).
export const iconProps = (icon?: string) => {
  const fallback = (el: HTMLImageElement) => {
    if (!el.dataset.fallback) {
      el.dataset.fallback = '1';
      el.src = `/art/tpl-${icon || 'paper'}.svg`;
    }
  };

  return {
    src: templateIcon(icon),
    ref: (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalWidth === 0) {
        fallback(el);
      }
    },
    onError: (e: { currentTarget: HTMLImageElement }) => fallback(e.currentTarget),
  };
};

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;

async function writeFiles(files: Record<string, string>) {
  const wc = await webcontainer;
  const dirs = new Set(Object.keys(files).map((p) => p.split('/').slice(0, -1).join('/')).filter(Boolean));

  for (const dir of [...dirs].sort()) {
    await wc.fs.mkdir(dir, { recursive: true });
  }

  await Promise.all(Object.entries(files).map(([path, content]) => wc.fs.writeFile(path, content)));
}

/**
 * Puts a template into the WebContainer and starts its dev server.
 * With a prebuilt packages snapshot this is one download and no `npm install`; without one it falls back to a normal install.
 */
export async function applyTemplate(id: string, title = 'template') {
  const wc = await webcontainer;
  templateStatus.set('Fetching template...');

  const [{ snapshots }, spec] = await Promise.all([
    fetch('/api/templates').then((r) => r.json() as Promise<{ snapshots: Record<string, { url: string | null; bytes: number }> }>),
    fetch(`/templates/${id}.json`).then((r) => {
      if (!r.ok) {
        throw new Error('Template not found');
      }

      return r.json() as Promise<{ pack: string; files: Record<string, string> }>;
    }),
  ]);

  const snapshot = snapshots[spec.pack];
  let hasPackages = false;

  if (snapshot?.url) {
    templateStatus.set(`Loading packages (${mb(snapshot.bytes)}, cached after the first time)...`);

    try {
      const res = await fetch(snapshot.url);

      if (res.ok) {
        // the snapshot already contains the node_modules folder (mountPoint is ignored for snapshots)
        await wc.mount(await res.arrayBuffer());

        // snapshots drop file permissions; give the .bin entries (vite, tailwind...) their exec bit back
        const chmod = await wc.spawn('jsh', ['-c', 'chmod +x node_modules/.bin/*']);
        await chmod.exit;
        hasPackages = true;
      }
    } catch {
      // fall through to a normal install
    }
  }

  templateStatus.set('Writing files...');
  await writeFiles(spec.files);

  // visible steps in the workbench, like any other build
  const messageId = `tpl-setup-${id}`;
  workbenchStore.showWorkbench.set(true);
  workbenchStore.addArtifact({ messageId, id: 'template', title: `Template: ${title}` });

  const step = (actionId: string, content: string) => ({ artifactId: 'template', messageId, actionId, action: { type: 'shell' as const, content } });

  if (!hasPackages) {
    templateStatus.set('Installing packages (first time on this device, can take a minute)...');
    const install = step('install', 'npm install --no-audit --no-fund');
    await workbenchStore.addAction(install);
    workbenchStore.runAction(install);
  }

  const dev = step('dev', 'npm run dev');
  await workbenchStore.addAction(dev);
  workbenchStore.runAction(dev);

  templateStatus.set(undefined);
}

const prefetched = new Set<string>();

/** Warm the browser cache for a pack's snapshot a little while after page load, spread randomly so teams don't all download at once. */
export function prefetchSnapshots(packs: string[]) {
  const delay = 5_000 + Math.random() * 120_000;

  setTimeout(async () => {
    try {
      const { snapshots } = (await fetch('/api/templates').then((r) => r.json())) as { snapshots: Record<string, { url: string | null }> };

      for (const pack of packs) {
        const url = snapshots[pack]?.url;

        if (url && !prefetched.has(url)) {
          prefetched.add(url);
          await fetch(url, { priority: 'low' } as RequestInit).then((r) => r.arrayBuffer());
        }
      }
    } catch {
      // best effort
    }
  }, delay);
}
