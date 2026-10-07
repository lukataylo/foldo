import { PageHeader, StatCard } from '@/components/finance/blocks';
import { AreaTrend, Donut } from '@/components/finance/charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { INCOME, SPENDING, WEEKLY } from '@/data';
import { money } from '@/lib/format';

export default function Overview({ t }) {
  const spent = SPENDING.reduce((n, s) => n + s.value, 0);
  return (
    <div className="space-y-6">
      <PageHeader title={t('overview')} description="Where your money went this month." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('income')} value={money(INCOME)} />
        <StatCard label={t('spent')} value={money(spent)} delta={-0.04} hint="vs last month" />
        <StatCard label={t('left')} value={money(INCOME - spent)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Spending by type</CardTitle></CardHeader>
          <CardContent><Donut data={SPENDING} format={(v) => money(v, 'GBP', { maximumFractionDigits: 0 })} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Spending each week</CardTitle></CardHeader>
          <CardContent><AreaTrend data={WEEKLY} format={(v) => money(v, 'GBP', { maximumFractionDigits: 0 })} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
