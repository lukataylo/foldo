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
    return (
      <div role="status" data-testid="foldo-event-bar" className="shrink-0 bg-ink text-paper">
        <div className="container-marketing flex min-h-[40px] flex-wrap items-center justify-between gap-x-4 text-[13px]">
          <span className="inline-flex min-w-0 items-center gap-[10px]">
            <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-highlighter" />
            {event.name && <span className="font-mono text-[12px] tracking-[.04em]">{event.name}</span>}
            {event.announcement && <span className="min-w-0 truncate text-field">{event.announcement}</span>}
          </span>
          <span className="inline-flex items-center gap-4 font-mono text-[12px]">
            {event.endsAt && now !== null && now < event.endsAt && <span className="text-field">Closes {clock(event.endsAt)}</span>}
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
        {event.name && <span className="font-medium">{event.name}</span>}
        {event.name && countdown && (
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
        )}
        {countdown && <span className="font-mono text-[12px]">{countdown}</span>}
        {event.announcement && (
          <>
            <span aria-hidden="true" className="opacity-60">
              ·
            </span>
            <span className="min-w-0 truncate text-field">{event.announcement}</span>
          </>
        )}
      </div>
    </div>
  );
}
