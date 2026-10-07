import { Avatar } from '@/components/ui/misc';
import { PageHeader } from '@/components/finance/blocks';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RECIPIENTS } from '@/data';

export default function Recipients() {
  return (
    <div className="space-y-6">
      <PageHeader title="Recipients" description="People you send money to. Account numbers are masked." />
      <div className="grid gap-4 sm:grid-cols-2">
        {RECIPIENTS.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex items-center gap-4 p-5">
              <Avatar name={r.name} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{r.account}</div>
              </div>
              <Badge variant="secondary">{r.currency}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
