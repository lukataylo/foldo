import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'react-toastify';
import { renderSVG } from 'uqr';
import { Dialog, DialogRoot } from '~/components/ui/Dialog';
import { Icon } from '~/components/ui/icons';
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

    // 403 + hidden: the organizers took it out of the gallery; the server explains (the link still works)
    const body = (await res.json().catch(() => ({}))) as { error?: string; hidden?: boolean };

    toast.error(
      res.status === 401
        ? 'Please sign in again to keep sharing. Your work is saved.'
        : body.hidden && body.error
          ? body.error
          : 'Something went wrong on our side. Try again in a moment.',
    );
  } catch {
    toast.error("Couldn't update sharing. Check your connection and try again.");
  }

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

type Step = 'create' | 'live' | 'stop';
type Busy = 'create' | 'list' | 'stop' | null;

const FOCUS: Record<Step, string> = { create: 'foldo-share-create', live: 'foldo-share-copy', stop: 'foldo-share-stop-cancel' };

export function ShareDialog({ open, onOpenChange, projectId, title, state, onChange }: ShareDialogProps) {
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const closeClicked = useRef(false);
  const step: Step = !state.shareId ? 'create' : confirmStop ? 'stop' : 'live';

  /*
   * Callers open this from a plain button or a menu item (not a Radix Trigger), so Radix has nothing to return focus to.
   * Remember what had focus when the dialog opened and put it back on close.
   */
  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    const opener = document.activeElement as HTMLElement | null;
    setConfirmStop(false);

    return () => {
      setTimeout(() => {
        const lost = !document.activeElement || document.activeElement === document.body;

        if (lost && opener?.isConnected) {
          opener.focus();
        }
      }, 0);
    };
  }, [open]);

  // Esc, backdrop and Close all come through here: never close mid-revoke, and Esc on the confirm step goes back to Live
  const handleOpenChange = (next: boolean) => {
    const viaClose = closeClicked.current;
    closeClicked.current = false;

    if (next) {
      onOpenChange(true);
    } else if (busy === 'stop') {
      return;
    } else if (step === 'stop' && !viaClose) {
      setConfirmStop(false);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      {open && (
        <Dialog className="!max-h-[calc(100vh-32px)] !max-w-[520px] !rounded-[16px] overflow-y-auto" hideClose>
          <ShareBody
            projectId={projectId}
            title={title}
            state={state}
            onChange={onChange}
            step={step}
            setConfirmStop={setConfirmStop}
            busy={busy}
            setBusy={setBusy}
            onCloseClick={() => (closeClicked.current = true)}
          />
        </Dialog>
      )}
    </DialogRoot>
  );
}

function CloseButton({ className, disabled, onClick }: { className: string; disabled?: boolean; onClick: () => void }) {
  return (
    <RadixDialog.Close asChild>
      <button
        type="button"
        aria-label="Close"
        disabled={disabled}
        onClick={onClick}
        className={classNames('btn-icon h-9 w-9 rounded-[8px]', className)}
      >
        <Icon.Close size={18} />
      </button>
    </RadixDialog.Close>
  );
}

interface ShareBodyProps extends Omit<ShareDialogProps, 'open' | 'onOpenChange'> {
  step: Step;
  setConfirmStop: (on: boolean) => void;
  busy: Busy;
  setBusy: (busy: Busy) => void;
  onCloseClick: () => void;
}

function ShareBody({ projectId, title, state, onChange, step, setConfirmStop, busy, setBusy, onCloseClick }: ShareBodyProps) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const prevStep = useRef<Step | null>(null);
  const name = title?.trim() || 'Untitled project';
  const url = state.shareId ? shareUrl(state.shareId) : '';
  const shortUrl = url.replace(/^https?:\/\//, '');

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timer = setTimeout(() => setCopied(false), 2000);

    return () => clearTimeout(timer);
  }, [copied]);

  /*
   * Focus each step's main control: on open (this effect runs before Radix's FocusScope, which then leaves focus alone),
   * when one step replaces another, and back on the action button after a failed request. Wait for busy to clear:
   * a disabled button can't take focus, and the store update can render before setBusy(null).
   */
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    if (prevStep.current !== step) {
      prevStep.current = step;
      pendingFocus.current = FOCUS[step];
    }

    if (!pendingFocus.current || busy) {
      return;
    }

    root.current?.querySelector<HTMLElement>(`[data-testid="${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  }, [step, busy]);

  const run = async (kind: NonNullable<Busy>, share: boolean, listed?: boolean) => {
    setBusy(kind);

    const next = await updateShare(projectId, share, listed);

    if (!next) {
      pendingFocus.current = { create: 'foldo-share-create', list: 'foldo-share-gallery', stop: 'foldo-share-stop-confirm' }[kind];
    }

    setBusy(null);

    if (next) {
      onChange(next);
    }

    return next;
  };

  const copied$ = () => {
    setCopied(true);
    toast.success('Link copied.', { toastId: 'share-copied' });
  };

  const create = async () => {
    const next = await run('create', true);

    if (!next?.shareId) {
      return;
    }

    // Safari and Firefox drop the user gesture across the fetch, so the auto-copy may be refused; that's not an error
    if (await copyText(shareUrl(next.shareId), { quiet: true })) {
      copied$();
    } else {
      toast.success('Link created. Copy it below.');
    }
  };

  const copy = async () => {
    if (await copyText(url)) {
      copied$();
    }
  };

  const stop = async () => {
    const next = await run('stop', false);

    if (next) {
      setConfirmStop(false);
      setShowQr(false);
      setCopied(false);
      toast.success('Sharing is off. The old link no longer works.');
    }
  };

  const dialogTitle = (
    <RadixDialog.Title className="m-0 font-serif text-[30px] font-normal leading-[1.1] text-ink [text-wrap:balance]">
      Share project
    </RadixDialog.Title>
  );
  const heading = (
    <>
      {dialogTitle}
      <RadixDialog.Description className="m-0 truncate text-[14px] text-pencil">{name}</RadixDialog.Description>
    </>
  );
  const onBanner = 'absolute right-3 top-3 border border-solid border-rule bg-sheet text-ink hover:bg-wash';

  if (step === 'stop') {
    return (
      <div ref={root} data-testid="foldo-share-dialog" data-step="stop">
        <header className="flex items-start justify-between gap-4 border-b border-rule2 px-6 pb-[18px] pt-[22px]">
          <div className="flex min-w-0 flex-col gap-[2px]">
            {dialogTitle}
            <span className="truncate text-[14px] text-pencil">{name}</span>
          </div>
          <CloseButton className="flex-none" disabled={busy === 'stop'} onClick={onCloseClick} />
        </header>

        <div className="flex flex-col items-center gap-[18px] px-6 pb-7 pt-6 text-center">
          <img
            src="/art/stop-sharing-cut.webp"
            alt="Foldo the paper dachshund gently pulling the shutter down on a little shop stall"
            width={720}
            height={634}
            className="block h-auto w-[260px]"
          />
          <div className="flex max-w-[380px] flex-col gap-1.5">
            <h3 className="m-0 font-serif text-[28px] font-normal leading-[1.1] text-ink [text-wrap:balance]">
              Turn off the public link?
            </h3>
            <RadixDialog.Description className="m-0 text-[15px] text-ink2 [text-wrap:pretty]">
              Anyone with the current link will lose access.
            </RadixDialog.Description>
            <p className="m-0 text-[13px] text-pencil [text-wrap:pretty]">
              {state.listed ? 'It also comes out of the gallery. ' : ''}Your project and its chat stay as they are.
            </p>
          </div>
          <div className="inline-flex h-[34px] max-w-full items-center gap-2 rounded-[8px] border border-rule bg-paper px-3">
            <LinkIcon size={15} className="shrink-0 text-pencil" />
            <span className="truncate font-mono text-[13px] text-ink2">{shortUrl}</span>
          </div>
        </div>

        <footer className="flex min-h-[62px] items-center justify-end gap-2 border-t border-rule2 bg-paper px-6 py-3">
          <button
            type="button"
            data-testid="foldo-share-stop-cancel"
            disabled={busy !== null}
            className="btn-ghost h-[38px] rounded-[8px] px-[14px] text-[14px]"
            onClick={() => setConfirmStop(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="foldo-share-stop-confirm"
            disabled={busy !== null}
            aria-busy={busy === 'stop'}
            onClick={stop}
            className="btn-destructive h-[38px] gap-1.5 rounded-[8px] px-4 text-[14px]"
          >
            {busy === 'stop' ? <Icon.Spinner size={15} /> : <LinkOffIcon size={15} />}
            Turn off link
          </button>
        </footer>
      </div>
    );
  }

  if (step === 'create') {
    return (
      <div ref={root} data-testid="foldo-share-dialog" data-step="create">
        <img
          src="/art/share-create-wide.webp"
          alt="Foldo the paper dachshund in a postal cap, sealing a blank envelope with its nose"
          width={1560}
          height={600}
          className="block aspect-[13/5] h-auto w-full"
        />
        <CloseButton className={onBanner} onClick={onCloseClick} />
        <header className="flex flex-col gap-[2px] px-6 pb-1 pt-[22px]">{heading}</header>

        <div className="px-6 pt-5">
          <ul className="m-0 flex list-none flex-col gap-[14px] rounded-[12px] border border-rule bg-paper p-4">
            <Benefit icon={<PlayIcon />}>Anyone with the link can open and run your app, no account needed.</Benefit>
            <Benefit icon={<ForkIcon />}>
              Signed-in viewers can remix it into their own copy. Your original is never changed.
            </Benefit>
            <Benefit icon={<LinkOffIcon size={20} />}>Turn it off any time and the link stops working.</Benefit>
          </ul>
        </div>

        <div className="flex flex-col gap-2.5 px-6 pb-6 pt-5">
          <button
            type="button"
            data-testid="foldo-share-create"
            disabled={busy !== null}
            aria-busy={busy === 'create'}
            onClick={create}
            className="btn-primary btn-lg min-h-[48px] w-full"
          >
            {busy === 'create' ? <Icon.Spinner size={18} /> : <LinkIcon size={18} />}
            Create public link
          </button>
          <span className="text-center text-[13px] text-pencil">We copy the link for you as soon as it exists.</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={root} data-testid="foldo-share-dialog" data-step="live">
      <img
        src="/art/share-live-wide.webp"
        alt="Foldo the paper dachshund as a mail carrier with a satchel of paper planes, one plane already flying"
        width={1560}
        height={600}
        className="block aspect-[13/5] h-auto w-full"
      />
      <CloseButton className={onBanner} onClick={onCloseClick} />
      <header className="flex flex-col gap-[2px] px-6 pt-5">{heading}</header>

      <div className="flex flex-col gap-[18px] px-6 pb-5 pt-[18px]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="foldo-share-url" className="eyebrow">
              Public link
            </label>
            <span className="pill-live">
              <span className="pill-dot" />
              Live
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-field bg-paper py-[5px] pl-3 pr-[5px] [&:has(input:focus-visible)]:border-ink">
            <GlobeIcon size={16} className="hidden shrink-0 text-pencil sm:block" />
            <input
              id="foldo-share-url"
              readOnly
              data-testid="foldo-share-url"
              value={shortUrl}
              onFocus={(e) => e.currentTarget.select()}
              onCopy={(e) => {
                // the field hides the scheme to fit the token; a manual copy still gets the full link
                e.preventDefault();
                e.clipboardData.setData('text/plain', url);
              }}
              className="h-[34px] min-w-0 flex-1 border-0 bg-transparent font-mono text-[12px] text-ink outline-none sm:text-[13px]"
            />
            <button
              type="button"
              data-testid="foldo-share-copy"
              onClick={copy}
              className={classNames(
                'h-[36px] w-full min-w-[104px] gap-1.5 rounded-[8px] px-[14px] text-[14px] sm:w-auto',
                copied ? 'btn border-live bg-live font-semibold text-white' : 'btn-primary',
              )}
            >
              {copied ? <Icon.Check size={15} /> : <Icon.Copy size={15} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? 'Link copied to clipboard' : ''}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="eyebrow">Send to</span>
          <ShareTargets url={url} name={name} qr={showQr} onQr={() => setShowQr(!showQr)} />
          {showQr && <QrPanel url={url} shortUrl={shortUrl} name={name} />}
        </div>

        <div className="flex items-center gap-3 rounded-[12px] border border-rule p-3">
          <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-[8px] bg-wash text-ink2">
            <TrophyIcon size={18} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span id="foldo-share-gallery-label" className="text-[14px] font-semibold text-ink">
              Show in the gallery
            </span>
            <span className="text-[13px] text-pencil">Other teams can discover, run and like it.</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.listed}
            aria-labelledby="foldo-share-gallery-label"
            aria-busy={busy === 'list'}
            data-testid="foldo-share-gallery"
            disabled={busy !== null}
            onClick={async () => {
              const on = !state.listed;

              if (await run('list', true, on)) {
                toast.success(on ? 'Listed in the gallery.' : 'Taken out of the gallery. The link still works.');
              }
            }}
            className="switch"
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      <footer className="flex min-h-[58px] items-center justify-between gap-4 border-t border-rule2 bg-paper px-6 py-3">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-pencil">
          <LockIcon size={15} />
          Viewers can’t edit your original.
        </span>
        <button
          type="button"
          data-testid="foldo-share-stop"
          className="btn-danger btn-sm rounded-[8px]"
          disabled={busy !== null}
          onClick={() => setConfirmStop(true)}
        >
          <LinkOffIcon size={15} />
          Stop sharing
        </button>
      </footer>
    </div>
  );
}

function Benefit({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[14px] text-ink2 [text-wrap:pretty]">
      <span className="mt-[1px] flex-none text-ink">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

const TILE =
  'flex h-16 flex-col items-center justify-center gap-1 rounded-[8px] border border-solid bg-sheet font-sans text-[12px] font-medium text-ink no-underline outline-none cursor-pointer transition-[background-color,border-color,box-shadow] duration-120 hover:bg-wash focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]';

function ShareTargets({ url, name, qr, onQr }: { url: string; name: string; qr: boolean; onQr: () => void }) {
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => setCanNativeShare(typeof navigator.share === 'function'), []);

  const text = `Check out "${name}", built on Foldo`;
  const e = encodeURIComponent;
  const targets = [
    { label: 'X', aria: 'Share on X', icon: <XIcon size={18} />, href: `https://x.com/intent/post?text=${e(text)}&url=${e(url)}` },
    {
      label: 'LinkedIn',
      aria: 'Share on LinkedIn',
      icon: <LinkedInIcon size={18} />,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`,
    },
    { label: 'WhatsApp', aria: 'Share on WhatsApp', icon: <ChatBubbleIcon size={18} />, href: `https://wa.me/?text=${e(`${text}: ${url}`)}` },
    {
      label: 'Email',
      aria: 'Share by email',
      icon: <MailIcon size={18} />,
      href: `mailto:?subject=${e(name)}&body=${e(`${text}:\n\n${url}`)}`,
    },
  ];

  return (
    <div className={classNames('grid grid-cols-3 gap-2', canNativeShare ? 'sm:grid-cols-6' : 'sm:grid-cols-5')}>
      {targets.map((t) => (
        <a
          key={t.label}
          href={t.href}
          target={t.href.startsWith('mailto:') ? undefined : '_blank'}
          rel="noopener noreferrer"
          aria-label={t.aria}
          className={classNames(TILE, 'border-rule')}
        >
          {t.icon}
          {t.label}
        </a>
      ))}
      <button
        type="button"
        aria-pressed={qr}
        aria-label="Show QR code"
        onClick={onQr}
        className={classNames(TILE, qr ? 'border-ink !bg-wash font-semibold' : 'border-rule')}
        data-testid="foldo-share-qr"
      >
        <QrIcon size={18} />
        QR code
      </button>
      {canNativeShare && (
        <button
          type="button"
          aria-label="More sharing options"
          className={classNames(TILE, 'border-rule')}
          onClick={() => navigator.share({ title: name, text, url }).catch(() => undefined)}
        >
          <ShareOutIcon size={18} />
          More
        </button>
      )}
    </div>
  );
}

function QrPanel({ url, shortUrl, name }: { url: string; shortUrl: string; name: string }) {
  // Ink on white regardless of theme: phone cameras read dark-on-light codes most reliably. The white tile is the quiet zone.
  const svg = useMemo(() => renderSVG(url, { border: 0, whiteColor: '#FFFFFF', blackColor: '#16140F' }), [url]);

  const download = () => {
    const file = renderSVG(url, { border: 2, whiteColor: '#FFFFFF', blackColor: '#16140F' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }));
    a.download = `${name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'foldo-project'}-qr.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="mt-1 flex items-center gap-[18px] rounded-[12px] border border-rule bg-paper p-[14px]" data-testid="foldo-share-qr-panel">
      <div className="flex-none rounded-[8px] border border-rule bg-white p-2">
        <div
          role="img"
          aria-label={`QR code for ${shortUrl}`}
          className="h-[104px] w-[104px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-serif text-[21px] leading-[1.15] text-ink">Scan to open on a phone</span>
        <p className="m-0 text-[13px] text-ink2 [text-wrap:pretty]">
          Put it on a slide or your demo screen so judges and teammates can try it instantly.
        </p>
        <button type="button" onClick={download} className="btn-secondary btn-sm mt-1.5 self-start rounded-[8px]">
          <DownloadIcon size={15} />
          Download
        </button>
      </div>
    </div>
  );
}

/* Share-only icons, paths from the Share boards (24 grid, stroke 1.5, round caps) */
function svgIcon(children: ReactNode) {
  return function ShareIcon({ size = 20, className }: { size?: number; className?: string }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={classNames('shrink-0', className)}
      >
        {children}
      </svg>
    );
  };
}

const PlayIcon = svgIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5v7l5.5-3.5L10 8.5z" />
  </>,
);
const ForkIcon = svgIcon(
  <>
    <circle cx="6" cy="5" r="2" />
    <circle cx="18" cy="5" r="2" />
    <circle cx="12" cy="19" r="2" />
    <path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5" />
  </>,
);
const LinkOffIcon = svgIcon(<path d="M9.5 14.5l-1.8 1.8a3.2 3.2 0 0 1-4.5-4.5L5 10M14.5 9.5l1.8-1.8a3.2 3.2 0 0 1 4.5 4.5L19 14M4 4l16 16" />);
const LinkIcon = svgIcon(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />);
const GlobeIcon = svgIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
  </>,
);
const XIcon = svgIcon(<path d="M5 4l14 16M19 4L5 20" />);
const LinkedInIcon = svgIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M8 10v7M8 7v.01M12 17v-7M12 13a2.5 2.5 0 0 1 5 0v4" />
  </>,
);
const ChatBubbleIcon = svgIcon(<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20z" />);
const MailIcon = svgIcon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </>,
);
const QrIcon = svgIcon(
  <>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2M20 14v.01M18 18h2v2M14 20h.01" />
  </>,
);
const ShareOutIcon = svgIcon(<path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />);
const DownloadIcon = svgIcon(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
const TrophyIcon = svgIcon(<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6M10 17h4v3h-4z" />);
const LockIcon = svgIcon(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);
