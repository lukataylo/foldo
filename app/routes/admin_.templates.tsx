import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useRevalidator } from '@remix-run/react';
import { useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { AdminShell, cardClass, h2Class } from '~/components/admin/AdminShell';
import { Icon } from '~/components/ui/icons';
import { requireAdmin, shell } from '~/lib/.server/auth';
import { snapshotStatus, templateIndex } from '~/lib/.server/templates';

export const meta = () => [{ title: 'Template packs · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const { templates, packs } = templateIndex();

  return json({
    ...shell(admin),
    now: Date.now(),
    packs: Object.values(packs).map((p) => ({ ...p, templates: templates.filter((t) => t.pack === p.id).map((t) => t.title), snapshot: snapshotStatus()[p.id] })),
  });
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
    <>
      <div>
        <button data-testid={`foldo-build-${pack.id}`} className="btn-secondary btn-md" aria-busy={busy} disabled={busy} onClick={run}>
          {busy && <Icon.Spinner />}
          {busy ? 'Building…' : 'Build snapshot'}
        </button>
      </div>
      {log.length > 0 && (
        <pre
          data-testid={`foldo-build-log-${pack.id}`}
          className="m-0 max-h-64 overflow-auto rounded-[10px] border border-solid border-rule2 bg-codebg px-[14px] py-3 font-mono text-[12px] leading-[1.6] text-ink2"
        >
          {log.join('\n')}
        </pre>
      )}
    </>
  );
}

export default function AdminTemplates() {
  const d = useLoaderData<typeof loader>() as any;

  return (
    <AdminShell data={d} now={d.now} page="templates">
      <div data-testid="foldo-admin-templates" className="contents">
        <section aria-labelledby="t-head" className={`${cardClass} gap-2`}>
          <h1 id="t-head" className={h2Class}>
            Template packs
          </h1>
          <p className="m-0 max-w-[680px] text-[13px] text-ink2 [text-wrap:pretty]">
            Each pack is a shared set of npm packages. Build its snapshot once from a fast connection: teams then download one cached file instead of running npm
            install, which keeps the venue Wi-Fi free. Rebuild only when a pack's dependencies change (the hash changes).
          </p>
        </section>
        {d.packs.map((p: any) => (
          <section key={p.id} aria-labelledby={`t-${p.id}`} className={`${cardClass} gap-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id={`t-${p.id}`} className={h2Class}>
                {p.id} pack
              </h2>
              {p.snapshot.url ? (
                <span className="pill-live">
                  <span className="pill-dot" />
                  Snapshot ready · {(p.snapshot.bytes / 1e6).toFixed(1)} MB
                </span>
              ) : (
                <span className="pill-warning">
                  <span className="pill-dot" />
                  No snapshot yet · teams run npm install
                </span>
              )}
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-[6px] border-y border-rule2 py-3 text-[13px]">
              <dt className="text-pencil">Used by</dt>
              <dd className="m-0 text-ink2">{p.templates.join(', ') || '—'}</dd>
              <dt className="text-pencil">Packages</dt>
              <dd className="m-0 text-ink2">{p.dependencies.length}</dd>
              <dt className="text-pencil">Hash</dt>
              <dd className="m-0 font-mono text-[12px] text-ink2">{p.hash}</dd>
            </dl>
            <ClientOnly>{() => <Builder pack={p} />}</ClientOnly>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
