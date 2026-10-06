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

// Thin organizer strip: event name, live countdown, announcement. Hidden when no event is configured.
export function EventBar({ event, paper }: { event?: EventInfo | null; paper?: boolean }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());

    const t = setInterval(() => setNow(Date.now()), 30_000);

    return () => clearInterval(t);
  }, []);

  if (!event) {
    return null;
  }

  return (
    <div
      data-testid="foldo-event-bar"
      className={`flex h-8 shrink-0 items-center justify-center gap-3 border-b px-4 text-xs ${paper ? 'border-[#E6E3DE] bg-[#F6EEDF] text-[#555]' : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2'}`}
    >
      {event.name && (
        <span className={`flex items-center gap-1.5 font-semibold ${paper ? 'text-[#111]' : 'text-bolt-elements-textPrimary'}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--foldo-yellow)]" />
          {event.name}
        </span>
      )}
      {event.endsAt && now !== null && (
        <span className={`font-medium tabular-nums ${paper ? 'text-[#7A5000]' : 'text-bolt-elements-item-contentAccent'}`}>{left(event.endsAt - now)}</span>
      )}
      {event.announcement && <span className={`min-w-0 truncate ${paper ? 'text-[#555]' : 'text-bolt-elements-textSecondary'}`}>{event.announcement}</span>}
    </div>
  );
}
