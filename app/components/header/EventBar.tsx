import { useEffect, useState } from 'react';

export interface EventInfo {
  name: string;
  endsAt: number | null;
  announcement: string;
}

function left(ms: number) {
  const m = Math.floor(ms / 60_000);

  if (m <= 0) {
    return 'ended';
  }

  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);

  return d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m % 60}m left` : `${m}m left`;
}

const clock = (t: number) => new Date(t).toTimeString().slice(0, 5);

/*
 * Ink strip with the event name and a live countdown. Hidden when no event is configured.
 * app: 36 high, centred (Home, Projects, Settings). marketing: 40 high, 1344 container, announcement + closing time (Landing, Gallery).
 */
export function EventBar({ event, variant = 'app' }: { event?: EventInfo | null; variant?: 'app' | 'marketing' }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());

    const t = setInterval(() => setNow(Date.now()), 30_000);

    return () => clearInterval(t);
  }, []);

  if (!event) {
    return null;
  }

  const countdown = event.endsAt && now !== null ? left(event.endsAt - now) : '';

  if (variant === 'marketing') {
    // status line from the boards; on wide screens an organizer announcement follows it
    const ended = event.endsAt !== null && now !== null && now >= event.endsAt;
    const status = ended ? 'Building has closed' : 'Building is open';

    return (
      <div role="status" data-testid="foldo-event-bar" className="shrink-0 bg-ink text-paper">
        <div className="container-marketing flex min-h-[36px] flex-nowrap items-center justify-between gap-x-3 text-[12px] md:min-h-[40px] md:gap-x-4 md:text-[13px]">
          <span className="inline-flex min-w-0 items-center gap-2 md:gap-[10px]">
            <span aria-hidden="true" className="h-[6px] w-[6px] shrink-0 rounded-full bg-highlighter md:h-[7px] md:w-[7px]" />
            {event.name && <span className="max-w-[55%] shrink-0 truncate font-mono text-[12px] md:max-w-none md:tracking-[.04em]">{event.name}</span>}
            <span className="min-w-0 truncate text-field md:hidden">{status}</span>
            <span className="hidden min-w-0 truncate text-field md:inline">Finance hackathon. {status}.{event.announcement && ` · ${event.announcement}`}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-4 font-mono text-[12px]">
            {event.endsAt && now !== null && now < event.endsAt && <span className="hidden text-field md:inline">Closes {clock(event.endsAt)}</span>}
            {countdown && <span>{countdown}</span>}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div role="status" data-testid="foldo-event-bar" className="shrink-0 bg-ink text-paper">
      <div className="container-app flex h-[36px] items-center justify-center gap-[10px] text-[13px]">
        <span aria-hidden="true" className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#7CC49B]" />
        {event.name && <span className="min-w-0 truncate font-medium">{event.name}</span>}
        {event.name && countdown && (
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
        )}
        {countdown && <span className="shrink-0 whitespace-nowrap font-mono text-[12px]">{countdown}</span>}
        {/* phones keep one row: name and countdown only */}
        {event.announcement && (
          <>
            <span aria-hidden="true" className="hidden opacity-60 md:inline">
              ·
            </span>
            <span className="hidden min-w-0 truncate text-field md:inline">{event.announcement}</span>
          </>
        )}
      </div>
    </div>
  );
}
