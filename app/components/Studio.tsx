import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { ClientOnly } from 'remix-utils/client-only';
import { AppHeader, type ShellData } from '~/components/PageShell';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { SIcon } from '~/components/chat/studio-icons';
import { clock, online, useOnline, usePause, useStatusPoll } from '~/components/chat/studio-state';
import { EventBar } from '~/components/header/EventBar';
import { Header } from '~/components/header/Header';
import { copyText } from '~/components/share/ShareDialog';
import { Icon } from '~/components/ui/icons';
import { chatId, projectGone, retrySaveNow, saveAsCopy, saveState, seedProjectStores, type ProjectLoaderData } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { quota } from '~/lib/stores/ui';
import { workbenchStore } from '~/lib/stores/workbench';

export interface StudioData extends ShellData {
  shared?: boolean;
  url?: string;
  paused?: { paused: boolean; message: string; since?: number | null };
  messages?: unknown[];
  sharedInfo?: { mine?: boolean };
}

const PAUSE_COPY = 'The organizers have paused new builds for a moment. Hang tight.';

/*
 * The build screen. Signed in at `/` before the first message it is the Home board (event bar + app header + <Home/>);
 * once a chat starts, and on /chat/:id and /p/:shareId, it is the studio (Build-* boards).
 * Every slot below stays in place whatever the state, so <Chat/> (and its stream) is never remounted.
 */
export function Studio() {
  const data = useLoaderData() as StudioData;

  if (typeof document !== 'undefined') {
    seedProjectStores(data as ProjectLoaderData);
  }

  const chat = useStore(chatStore);
  const pause = usePause(data.paused);

  useStatusPoll(Boolean(data.email), (left) => quota.set(left));

  const started = chat.started || (data.messages?.length ?? 0) > 0 || Boolean(data.shared);

  return (
    <div className="flex h-full w-full flex-col bg-paper text-[14px] leading-[1.5] text-ink">
      {started ? (
        <Header />
      ) : (
        <>
          <EventBar event={data.event} />
          <AppHeader data={data} active="build" />
        </>
      )}
      {data.shared ? <SharedBanner signedIn={Boolean(data.email)} url={data.url} mine={data.sharedInfo?.mine} /> : null}
      {pause?.paused ? <PausedStrip message={pause.message} since={pause.since} /> : null}
      {started ? <ClientOnly>{() => <OfflineStrip />}</ClientOnly> : null}
      {started ? <ClientOnly>{() => <GoneStrip />}</ClientOnly> : null}
      <ClientOnly fallback={<BaseChat chatStarted={started} />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}

// Build-Paused: yellow strip under the header; message and start time come from the admin settings
function PausedStrip({ message, since }: { message: string; since?: number | null }) {
  return (
    <div
      role="status"
      data-testid="foldo-paused-strip"
      className="flex min-h-[44px] flex-none items-center gap-[10px] border-b border-warning-border bg-warning-bg px-[22px] py-2 text-[14px]"
    >
      <Icon.Pause className="flex-none text-warning" />
      <span className="whitespace-nowrap font-semibold text-ink">Builds paused</span>
      <span className="min-w-0 text-ink2">{message || PAUSE_COPY}</span>
      {since ? (
        <span className="ml-auto whitespace-nowrap font-mono text-[12px] text-warning" suppressHydrationWarning>
          Since {clock(since)}
        </span>
      ) : null}
    </div>
  );
}

// Offline board: shown while the browser is offline or a save is waiting to retry; "Try now" retries at once
function OfflineStrip() {
  const isOnline = useOnline();
  const state = useStore(saveState);
  const gone = useStore(projectGone);

  useEffect(
    () =>
      online.listen((value) => {
        if (value) {
          retrySaveNow();
        }
      }),
    [],
  );

  if (gone || (isOnline && state !== 'retrying' && state !== 'failed')) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="foldo-offline-strip"
      className="flex min-h-[44px] flex-none items-center gap-[10px] border-b border-warning-border bg-warning-bg px-[22px] py-2 text-[14px] lg:pl-[452px]"
    >
      <SIcon.WifiOff className="text-warning" />
      <span className="whitespace-nowrap font-semibold text-ink">{state === 'failed' && isOnline ? 'Not saved' : 'Reconnecting…'}</span>
      <span className="min-w-0 truncate text-ink2">Your work is on screen and will save when we’re back.</span>
      <button
        type="button"
        className="ml-auto border-0 bg-transparent p-0 font-sans text-[13px] font-medium text-ink underline underline-offset-3"
        onClick={() => {
          if (!navigator.onLine) {
            toast.info('Still offline. Foldo will save as soon as the connection is back.');
          }

          retrySaveNow();
        }}
      >
        Try now
      </button>
    </div>
  );
}

// the open project was deleted elsewhere (another tab, another device): keep the work by saving it as a new project
function GoneStrip() {
  const gone = useStore(projectGone);
  const [busy, setBusy] = useState(false);

  if (!gone) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="foldo-gone-strip"
      className="flex min-h-[44px] flex-none items-center gap-[10px] border-b border-warning-border bg-warning-bg px-[22px] py-2 text-[14px]"
    >
      <Icon.Warning className="flex-none text-warning" />
      <span className="whitespace-nowrap font-semibold text-ink">This project was deleted.</span>
      <span className="min-w-0 truncate text-ink2">Your work is still on screen. Save a copy?</span>
      <button
        type="button"
        aria-busy={busy || undefined}
        disabled={busy}
        className="btn-dark btn-sm ml-auto"
        onClick={async () => {
          setBusy(true);
          await saveAsCopy();
          setBusy(false);
        }}
      >
        Save a copy
      </button>
    </div>
  );
}

// Shared-Viewer (signed out: Ink strip) and Shared-Remix (signed in: Wash strip); gone once the visitor has remixed it
function SharedBanner({ signedIn, url, mine }: { signedIn: boolean; url?: string; mine?: boolean }) {
  const remixed = useStore(chatId);

  if (remixed) {
    return null;
  }

  const copy = async () => {
    if (await copyText(url ?? location.href)) {
      toast.success('Link copied.');
    }
  };

  if (signedIn) {
    return (
      <div
        role="region"
        aria-label="Shared project"
        data-testid="foldo-share-banner"
        className="flex h-[44px] flex-none items-center justify-center gap-[14px] border-b border-rule bg-wash px-4 text-ink"
      >
        <SIcon.Eye size={18} />
        <span className="min-w-0 truncate text-[14px]">
          <strong className="font-semibold">You’re viewing a shared project.</strong>{' '}
          <span className="text-ink2">{mine ? 'This is your project’s share link.' : 'Send a message to remix it into your own copy.'}</span>
        </span>
        <button
          type="button"
          data-testid="foldo-share-banner-copy"
          onClick={copy}
          className="inline-flex h-[30px] flex-none items-center gap-[6px] rounded-[6px] border border-field bg-sheet px-[10px] text-[13px] font-semibold text-ink hover:bg-wash"
        >
          <SIcon.Link size={14} /> Copy link
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Shared project"
      data-testid="foldo-share-banner"
      className="flex h-[40px] flex-none items-center gap-2 bg-ink px-4 text-[13px] text-paper md:h-[48px] md:justify-center md:gap-[14px] md:text-[14px]"
    >
      <SIcon.Eye className="md:h-[18px] md:w-[18px]" />
      <span className="min-w-0 flex-1 truncate md:flex-none">
        <strong className="font-semibold">
          <span className="md:hidden">Shared project.</span>
          <span className="lt-md:hidden">You’re viewing a shared project.</span>
        </strong>{' '}
        <span className="text-rule">Sign up free to remix it.</span>
      </span>
      <ClientOnly>{() => <MobileRunning />}</ClientOnly>
      <button
        type="button"
        data-testid="foldo-share-banner-copy"
        onClick={copy}
        className="inline-flex h-[30px] flex-none items-center gap-[6px] rounded-[6px] border border-[rgba(251,248,241,.35)] bg-transparent px-[10px] text-[13px] font-semibold text-paper hover:bg-[rgba(251,248,241,.08)] lt-md:hidden"
      >
        <SIcon.Link size={14} /> Copy link
      </button>
      <a
        href="/login?mode=register"
        className="inline-flex h-[30px] flex-none items-center gap-[6px] rounded-[6px] border border-ink bg-highlighter px-3 text-[13px] font-semibold text-ink no-underline hover:bg-[#EFB619] lt-md:hidden"
      >
        Sign up to remix <Icon.ArrowRight size={14} />
      </a>
    </div>
  );
}

// phones: the shared strip carries the preview state (Shared-Mobile)
function MobileRunning() {
  const running = useStore(workbenchStore.previews).length > 0;

  return (
    <span className="inline-flex flex-none items-center gap-[6px] font-mono text-[12px] font-medium text-live-border md:hidden">
      <span className={running ? 'h-[6px] w-[6px] rounded-full bg-[#7CC49C]' : 'h-[6px] w-[6px] rounded-full bg-field'} />
      {running ? 'Running' : 'Starting'}
    </span>
  );
}
