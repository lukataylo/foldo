import { ClipboardList } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/finance/blocks';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { timeAgo } from '@/lib/format';

export default function Reports({ reports }) {
  return (
    <div className="space-y-6">
      <PageHeader title="My reports" description="Saved on this device only." />
      {reports.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No reports yet" description="When you save a suspicious message it appears here." />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <p className="text-sm text-muted-foreground">{r.text}</p>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={r.level === 'high' ? 'destructive' : 'warning'}>{r.score}/100</Badge>
                  <span className="text-xs text-muted-foreground">{timeAgo(r.date)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
