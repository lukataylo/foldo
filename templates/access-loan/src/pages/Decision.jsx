import { CheckCircle2, XCircle } from 'lucide-react';
import { EmptyState, PageHeader, StatCard } from '@/components/finance/blocks';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { APR } from '@/decision';
import { money } from '@/lib/format';

export default function Decision({ application, result, goApply, goSchedule }) {
  if (!application) return <EmptyState title="No application yet" description="Fill in the short form first." action={<Button onClick={goApply}>Start application</Button>} />;
  const { approved, reasons, payment, total, cost, suggestion } = result;
  return (
    <div className="space-y-6">
      <PageHeader title={approved ? `Good news, ${application.name}` : `Thanks, ${application.name}. Not this time`} description="Here is exactly how we got to this answer." />
      <Alert variant={approved ? 'success' : 'warning'} title={approved ? 'You are pre-approved' : 'We cannot offer this amount right now'}>
        {approved ? `You could borrow ${money(application.amount)} over ${application.months} months.` : suggestion ? `A smaller loan of ${money(suggestion)} would fit your budget. You can change the amount and try again.` : 'Your bills leave very little room for repayments right now. Free debt advice can help, and you can reapply any time.'}
      </Alert>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Monthly payment" value={money(payment)} hint={`for ${application.months} months`} />
        <StatCard label="Total you repay" value={money(total)} hint={`at ${(APR * 100).toFixed(0)}% APR`} />
        <StatCard label="Cost of borrowing" value={money(cost)} hint="the extra you pay back" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Why this decision</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reasons.map((r, i) => (
            <div key={i} className="flex gap-3 text-sm">
              {r.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />}
              <span>{r.text}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex gap-3">
        <Button variant="outline" onClick={goApply}>Change my answers</Button>
        <Button onClick={goSchedule}>See repayment plan</Button>
      </div>
    </div>
  );
}
