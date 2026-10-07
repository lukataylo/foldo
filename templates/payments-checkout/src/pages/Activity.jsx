import { Banknote, Clock, TrendingUp } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/finance/blocks';
import { AreaTrend } from '@/components/finance/charts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money, shortDate } from '@/lib/format';

const STATUS = { succeeded: 'success', processing: 'warning', refunded: 'secondary', failed: 'destructive' };

export default function Activity({ payments, total }) {
  // group paid amounts per day for the chart
  const byDay = Object.values(
    [...payments].reverse().reduce((acc, p) => {
      const key = shortDate(p.date);
      acc[key] = acc[key] || { label: key, value: 0 };
      if (p.status === 'succeeded') acc[key].value += p.amount;
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Every payment, newest first." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total received" value={money(total)} delta={0.082} hint="vs last week" icon={Banknote} />
        <StatCard label="Payments" value={payments.length} icon={TrendingUp} />
        <StatCard label="Processing" value={payments.filter((p) => p.status === 'processing').length} icon={Clock} hint="usually clears in 1 day" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Revenue by day</CardTitle>
        </CardHeader>
        <CardContent>
          <AreaTrend data={byDay} format={(v) => money(v, 'GBP', { maximumFractionDigits: 0 })} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.customer}</TableCell>
                  <TableCell className="text-muted-foreground">{shortDate(p.date)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS[p.status]}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(p.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
