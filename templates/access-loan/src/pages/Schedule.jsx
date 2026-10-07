import { EmptyState, PageHeader } from '@/components/finance/blocks';
import { BarCompare } from '@/components/finance/charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { APR } from '@/decision';
import { amortisation } from '@/lib/finance';
import { money } from '@/lib/format';

export default function Schedule({ application }) {
  if (!application) return <EmptyState title="Nothing to show yet" description="Complete the application to see your repayment plan." />;
  const rows = amortisation(application.amount, APR, application.months);
  const chart = rows.map((r) => ({ label: `M${r.month}`, principal: Math.round(r.principal), interest: Math.round(r.interest) }));
  return (
    <div className="space-y-6">
      <PageHeader title="Repayment plan" description="Each month, how much goes to the loan and how much is interest." />
      <Card>
        <CardHeader><CardTitle>Principal vs interest</CardTitle></CardHeader>
        <CardContent>
          <BarCompare data={chart} series={[{ key: 'principal', name: 'Loan' }, { key: 'interest', name: 'Interest' }]} format={(v) => money(v, 'GBP', { maximumFractionDigits: 0 })} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-2">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Month</TableHead><TableHead className="text-right">Payment</TableHead><TableHead className="text-right">Interest</TableHead><TableHead className="text-right">Balance left</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.month}>
                  <TableCell>{r.month}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.payment)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{money(r.interest)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
