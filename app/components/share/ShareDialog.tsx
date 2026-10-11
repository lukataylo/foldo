import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { renderSVG } from 'uqr';
import { Dialog, DialogRoot } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';

export interface ShareState {
  shareId: string | null;
  listed: boolean;
}

// POST /api/projects: share=true keeps an existing link stable, share=false revokes it (and unlists)
export async function updateShare(id: string, share: boolean, listed?: boolean): Promise<ShareState | undefined> {
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, share, listed }),
    });

    if (res.ok) {
      return (await res.json()) as ShareState;
    }
  } catch {
    // network error: fall through to the toast
  }

  toast.error("Couldn't update sharing. Check your connection and try again.");

  return undefined;
}

export const shareUrl = (shareId: string) => `${location.origin}/p/${shareId}`;

export async function copyText(text: string, { quiet = false } = {}) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard needs a secure context and focus; the link field stays selectable as a fallback
    if (!quiet) {
      toast.error("Couldn't reach the clipboard. Select the link and copy it manually.");
    }

    return false;
  }
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  title?: string;
  state: ShareState;
  onChange: (state: ShareState) => void;
}

export function ShareDialog({ open, onOpenChange, projectId, title, state, onChange }: ShareDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      {open && (
        <Dialog className="!max-w-[480px] !rounded-2xl" onBackdrop={close} onClose={close}>
          <ShareBody projectId={projectId} title={title} state={state} onChange={onChange} />
        </Dialog>
      )}
    </DialogRoot>
  );
}

function ShareBody({ projectId, title, state, onChange }: Omit<ShareDialogProps, 'open' | 'onOpenChange'>) {
  const [busy, setBusy] = useState<'create' | 'list' | 'stop' | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const name = title?.trim() || 'Untitled project';
  const url = state.shareId ? shareUrl(state.shareId) : '';

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timer = setTimeout(() => setCopied(false), 2000);

    return () => clearTimeout(timer);
  }, [copied]);

  const run = async (kind: NonNullable<typeof busy>, share: boolean, listed?: boolean) => {
    setBusy(kind);

    const next = await updateShare(projectId, share, listed);

    setBusy(null);

    if (next) {
      onChange(next);
    }

    return next;
  };

  const create = async () => {
    const next = await run('create', true);

    if (!next?.shareId) {
      return;
    }

    // Safari and Firefox drop the user gesture across the fetch, so the auto-copy may be refused; that's not an error
    if (await copyText(shareUrl(next.shareId), { quiet: true })) {
      setCopied(true);
    } else {
      toast.success('Link created. Copy it below.');
    }
  };

  const copy = async () => {
    if (await copyText(url)) {
      setCopied(true);
    }
  };

  const stop = async () => {
    const next = await run('stop', false);

    if (next) {
      setConfirmStop(false);
      setShowQr(false);
      toast.success('Sharing is off. The old link no longer works.');
    }
  };

  return (
    <div data-testid="foldo-share-dialog">
      <header className="flex items-start gap-3.5 px-6 pb-5 pr-12 pt-6">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--foldo-yellow)] text-[#111] shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]">
          <span className="i-ph:share-network-bold text-xl" />
        </div>
        <div className="min-w-0">
          <RadixDialog.Title className="text-lg font-semibold leading-6 text-bolt-elements-textPrimary">
            Share project
          </RadixDialog.Title>
          <RadixDialog.Description className="mt-0.5 truncate text-sm text-bolt-elements-textSecondary">
            {name}
          </RadixDialog.Description>
        </div>
      </header>

      {state.shareId ? (
        <>
          <section className="px-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">
                Public link
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#12b76a]/15 px-2 py-0.5 text-xs font-medium text-[#067647]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#12b76a] opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#12b76a]" />
                </span>
                Live
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1.5 pl-3 transition-theme focus-within:border-bolt-elements-borderColorActive">
              <span className="i-ph:globe-hemisphere-west shrink-0 text-base text-bolt-elements-textTertiary" />
              <input
                readOnly
                aria-label="Share link"
                data-testid="foldo-share-url"
                value={url.replace(/^https?:\/\//, '')}
                onFocus={(e) => e.currentTarget.select()}
                onCopy={(e) => {
                  // the field hides the scheme to fit the token; a manual copy still gets the full link
                  e.preventDefault();
                  e.clipboardData.setData('text/plain', url);
                }}
                className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-bolt-elements-textPrimary outline-none"
              />
              <button
                data-testid="foldo-share-copy"
                onClick={copy}
                className={classNames('btn-primary btn-sm min-w-[96px]', { '!bg-[#12b76a] !text-white': copied })}
              >
                <span className={copied ? 'i-ph:check-bold' : 'i-ph:copy'} />
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <span className="sr-only" aria-live="polite">
              {copied ? 'Link copied to clipboard' : ''}
            </span>
          </section>

          <section className="px-6 pt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">Send to</div>
            <ShareTargets url={url} name={name} qr={showQr} onQr={() => setShowQr(!showQr)} />
            {showQr && <QrPanel url={url} name={name} />}
          </section>

          <section className="mx-6 mt-5 flex items-center gap-3 rounded-xl border border-bolt-elements-borderColor p-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
              <span className="i-ph:trophy text-lg" />
            </div>
            <div className="min-w-0 flex-1">
              <div id="share-gallery-label" className="text-sm font-medium text-bolt-elements-textPrimary">
                Show in the gallery
              </div>
              <div className="text-xs text-bolt-elements-textTertiary">Other teams can discover, run and like it.</div>
            </div>
            <Switch
              labelledBy="share-gallery-label"
              checked={state.listed}
              disabled={busy !== null}
              onChange={async (on) => {
                if ((await run('list', true, on)) && on) {
                  toast.success('Listed in the gallery.');
                }
              }}
            />
          </section>

          <footer className="mt-6 flex min-h-[56px] items-center gap-3 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-6 py-3">
            {confirmStop ? (
              <>
                <span className="flex-1 text-sm text-bolt-elements-textSecondary">
                  Anyone with the current link will lose access.
                </span>
                <button className="btn-ghost btn-sm" onClick={() => setConfirmStop(false)}>
                  Cancel
                </button>
                <button
                  data-testid="foldo-share-stop-confirm"
                  disabled={busy !== null}
                  onClick={stop}
                  className="btn btn-sm bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text hover:bg-bolt-elements-button-danger-backgroundHover"
                >
                  {busy === 'stop' && <span className="i-svg-spinners:90-ring-with-bg" />}
                  Turn off link
                </button>
              </>
            ) : (
              <>
                <span className="flex flex-1 items-center gap-1.5 text-xs text-bolt-elements-textTertiary">
                  <span className="i-ph:lock-simple shrink-0 text-sm" />
                  Viewers can't edit your original.
                </span>
                <button
                  data-testid="foldo-share-stop"
                  className="btn-ghost btn-sm hover:!text-bolt-elements-button-danger-text"
                  onClick={() => setConfirmStop(true)}
                >
                  <span className="i-ph:link-break" /> Stop sharing
                </button>
              </>
            )}
          </footer>
        </>
      ) : (
        <>
          <section className="px-6">
            <ul className="space-y-3 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <Benefit icon="i-ph:play-circle">Anyone with the link can open and run your app, no account needed.</Benefit>
              <Benefit icon="i-ph:git-fork">Signed-in viewers can remix it into their own copy. Your original is never changed.</Benefit>
              <Benefit icon="i-ph:link-break">Turn it off any time and the link stops working.</Benefit>
            </ul>
          </section>
          <footer className="px-6 pb-6 pt-5">
            <button
              data-testid="foldo-share-create"
              disabled={busy !== null}
              onClick={create}
              className="btn-primary btn-lg w-full"
            >
              {busy === 'create' ? <span className="i-svg-spinners:90-ring-with-bg" /> : <span className="i-ph:link-simple-bold" />}
              Create public link
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

function Benefit({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm text-bolt-elements-textSecondary">
      <span className={classNames(icon, 'mt-0.5 shrink-0 text-base text-bolt-elements-textPrimary')} />
      <span>{children}</span>
    </li>
  );
}

function ShareTargets({ url, name, qr, onQr }: { url: string; name: string; qr: boolean; onQr: () => void }) {
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => setCanNativeShare(typeof navigator.share === 'function'), []);

  const text = `Check out "${name}", built on Foldo`;
  const e = encodeURIComponent;
  const targets = [
    { label: 'X', icon: 'i-ph:x-logo', href: `https://x.com/intent/post?text=${e(text)}&url=${e(url)}` },
    { label: 'LinkedIn', icon: 'i-ph:linkedin-logo', href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}` },
    { label: 'WhatsApp', icon: 'i-ph:whatsapp-logo', href: `https://wa.me/?text=${e(`${text}: ${url}`)}` },
    { label: 'Email', icon: 'i-ph:envelope-simple', href: `mailto:?subject=${e(name)}&body=${e(`${text}:\n\n${url}`)}` },
  ];

  const tile =
    'group flex flex-col items-center gap-1.5 rounded-xl py-2 text-xs text-bolt-elements-textSecondary outline-none transition-theme hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-textPrimary focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive';
  const bubble =
    'grid h-10 w-10 place-items-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-lg text-bolt-elements-textPrimary transition-theme group-hover:border-[var(--foldo-yellow)]';

  return (
    <div className={classNames('grid gap-1', canNativeShare ? 'grid-cols-6' : 'grid-cols-5')}>
      {targets.map((t) => (
        <a
          key={t.label}
          href={t.href}
          target={t.href.startsWith('mailto:') ? undefined : '_blank'}
          rel="noopener noreferrer"
          aria-label={`Share on ${t.label}`}
          className={tile}
        >
          <span className={bubble}>
            <span className={t.icon} />
          </span>
          {t.label}
        </a>
      ))}
      <button aria-pressed={qr} aria-label="Show QR code" onClick={onQr} className={tile} data-testid="foldo-share-qr">
        <span className={classNames(bubble, { '!border-[var(--foldo-yellow)] !bg-[var(--foldo-yellow)] !text-[#111]': qr })}>
          <span className="i-ph:qr-code" />
        </span>
        QR code
      </button>
      {canNativeShare && (
        <button
          aria-label="More sharing options"
          className={tile}
          onClick={() => navigator.share({ title: name, text, url }).catch(() => undefined)}
        >
          <span className={bubble}>
            <span className="i-ph:export" />
          </span>
          More
        </button>
      )}
    </div>
  );
}

function QrPanel({ url, name }: { url: string; name: string }) {
  // black on white regardless of theme: phone cameras read dark-on-light codes most reliably
  const svg = useMemo(() => renderSVG(url, { border: 2, whiteColor: '#ffffff', blackColor: '#111111' }), [url]);

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `${name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'foldo-project'}-qr.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="mt-3 flex items-center gap-5 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <div
        role="img"
        aria-label={`QR code for ${url}`}
        className="h-[132px] w-[132px] shrink-0 overflow-hidden rounded-lg bg-white p-1 shadow-sm [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-bolt-elements-textPrimary">Scan to open on a phone</div>
        <p className="mt-1 text-xs leading-relaxed text-bolt-elements-textTertiary">
          Put it on a slide or your demo screen so judges and teammates can try it instantly.
        </p>
        <button onClick={download} className="btn-secondary btn-sm mt-3">
          <span className="i-ph:download-simple" /> Download
        </button>
      </div>
    </div>
  );
}

function Switch({
  checked,
  disabled,
  labelledBy,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  labelledBy: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      data-testid="foldo-share-gallery"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={classNames(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:opacity-60',
        checked ? 'bg-[var(--foldo-yellow)]' : 'bg-bolt-elements-background-depth-3',
      )}
    >
      <span
        className={classNames(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-150',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
