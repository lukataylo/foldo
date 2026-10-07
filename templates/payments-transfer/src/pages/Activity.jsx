import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, PageHeader } from '@/components/finance/blocks';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { STAGES } from '@/data';
import { money, timeAgo } from '@/lib/format';

// Each transfer advances one stage every 3s so the tracker is easy to demo.
function Tracker({ created }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const stage = Math.min(STAGES.length - 1, Math.floor((now - created) / 3000));
  return (
    <ol className="mt-4 space-y-3">
      {STAGES.map((s, i) => (
        <li key={s} className="flex items-center gap-3 text-sm">
          {i < stage || stage === STAGES.length - 1 ? <CheckCircle2 className="size-5 text-success" /> : i === stage ? <Loader2 className="size-5 animate-spin text-primary" /> : <Circle className="size-5 text-muted-foreground/40" />}
          <span className={i > stage ? 'text-muted-foreground' : 'font-medium'}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Activity({ transfers }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Track every transfer from start to delivery." />
      {transfers.length === 0 && <EmptyState title="No transfers yet" description="Send your first transfer and watch it move through each stage here." />}
      {transfers.map((t) => (
        <Card key={t.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t.to} <span className="ml-2 font-mono text-xs text-muted-foreground">{t.id}</span></CardTitle>
            <Badge>{timeAgo(t.created)}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {money(t.amount)} sent, fee {money(t.fee)}, {money(t.receives, t.currency, { maximumFractionDigits: 0 })} delivered
            </div>
            <Tracker created={t.created} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
