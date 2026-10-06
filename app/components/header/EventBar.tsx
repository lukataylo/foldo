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
export function EventBar({ event }: { event?: EventInfo | null }) {
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
      className="flex flex-wrap items-center justify-center gap-x-3 bg-[#111] px-4 py-1.5 text-xs text-white"
    >
      {event.name && <span className="font-bold text-[var(--foldo-yellow)]">{event.name}</span>}
      {event.endsAt && now !== null && <span className="rounded-full bg-white/10 px-2 py-0.5">{left(event.endsAt - now)}</span>}
      {event.announcement && <span className="text-white/80">{event.announcement}</span>}
    </div>
  );
}
