import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useRevalidator } from '@remix-run/react';
import { useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { PageShell } from '~/components/PageShell';
import { requireAdmin, shell } from '~/lib/.server/auth';
import { snapshotStatus, templateIndex } from '~/lib/.server/templates';

export const meta = () => [{ title: 'Template packs · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const { templates, packs } = templateIndex();

  return json({ ...shell(admin), packs: Object.values(packs).map((p) => ({ ...p, templates: templates.filter((t) => t.pack === p.id).map((t) => t.title), snapshot: snapshotStatus()[p.id] })) });
}

function Builder({ pack }: { pack: { id: string; hash: string } }) {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { revalidate } = useRevalidator();

  const run = async () => {
    setBusy(true);
    setLog(['Starting...']);

    try {
      const { buildSnapshot } = await import('~/lib/templates/snapshot.client');
      const spec = (await fetch('/templates/blank-' + (pack.id === 'carbon' ? 'carbon' : 'finance') + '.json').then((r) => r.json())) as { files: Record<string, string> };
      await buildSnapshot(pack, spec.files, (line) => line.length > 2 && setLog((l) => [...l.slice(-300), line]));
      revalidate();
    } catch (e) {
      setLog((l) => [...l, `FAILED: ${(e as Error).message}`]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <button data-testid={`foldo-build-${pack.id}`} className="btn-primary btn-md" disabled={busy} onClick={run}>
        {busy ? 'Building...' : 'Build snapshot'}
      </button>
      {log.length > 0 && (
        <pre data-testid={`foldo-build-log-${pack.id}`} className="mt-3 max-h-64 overflow-auto rounded-lg bg-bolt-elements-background-depth-1 p-3 text-xs text-bolt-elements-textSecondary">
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
}

export default function AdminTemplates() {
  const d = useLoaderData<typeof loader>() as any;

  return (
    <PageShell data={d} active="admin">
      <main className="space-y-6" data-testid="foldo-admin-templates">
        <div>
          <a href="/admin" className="text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
            ← Admin
          </a>
          <h1 className="mt-1 text-3xl font-bold">Template packs</h1>
          <p className="mt-1 max-w-2xl text-sm text-bolt-elements-textSecondary">
            Each pack is a shared set of npm packages. Build its snapshot once from a fast connection: teams then download one cached file instead of running npm install, which keeps venue Wi-Fi free.
            Rebuild only when a pack's dependencies change (the hash changes).
          </p>
        </div>
        {d.packs.map((p: any) => (
          <section key={p.id} className="surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold capitalize">{p.id} pack</h2>
                <p className="mt-1 text-sm text-bolt-elements-textSecondary">Used by: {p.templates.join(', ')}</p>
                <p className="mt-1 text-xs text-bolt-elements-textTertiary">{p.dependencies.length} packages · hash {p.hash}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.snapshot.url ? 'bg-[#e8f6ec] text-[#14532d]' : 'bg-[#fff4d6] text-[#7a5000]'}`}>
                {p.snapshot.url ? `Snapshot ready · ${(p.snapshot.bytes / 1e6).toFixed(1)} MB` : 'No snapshot yet (teams run npm install)'}
              </span>
            </div>
            <ClientOnly>{() => <Builder pack={p} />}</ClientOnly>
          </section>
        ))}
      </main>
    </PageShell>
  );
}
