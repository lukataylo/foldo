import { ArrowDownRight, ArrowUpRight, Info, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const PageHeader = ({ title, description, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
);

/** Headline number with optional change indicator: <StatCard label="Balance" value="£1,200" delta={0.04} /> */
export function StatCard({ label, value, delta, hint, icon: Icon }) {
  const up = typeof delta === 'number' && delta >= 0;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          {Icon && <Icon className="size-4" />}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {(typeof delta === 'number' || hint) && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {typeof delta === 'number' && (
              <span className={cn('inline-flex items-center font-medium', up ? 'text-success' : 'text-destructive')}>
                {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(delta * 100).toFixed(1)}%
              </span>
            )}
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Always show this on money screens: judges score trust and responsibility. */
export const DemoBanner = ({ children = 'Demo only. No real money moves and no real data is stored.' }) => (
  <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-xs font-medium text-warning">
    <Info className="size-4 shrink-0" />
    {children}
  </div>
);

/** Plain-language privacy / explainability note. Put one near any decision, score or data entry. */
export const TrustNote = ({ title = 'How we use your data', children }) => (
  <div className="flex gap-3 rounded-lg border bg-background p-4 text-sm">
    <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    <div>
      <div className="font-medium">{title}</div>
      <div className="mt-0.5 text-muted-foreground">{children}</div>
    </div>
  </div>
);

export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-background px-6 py-12 text-center">
    {Icon && <Icon className="size-8 text-muted-foreground" />}
    <div className="font-medium">{title}</div>
    {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
    {action}
  </div>
);
