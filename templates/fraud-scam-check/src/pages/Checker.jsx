import { AlertTriangle, CheckCircle2, Flag, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, TrustNote } from '@/components/finance/blocks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ADVICE, SAMPLES, analyse } from '@/analyse';
import { cn } from '@/lib/utils';

const LEVEL = {
  high: { label: 'Very likely a scam', icon: ShieldAlert, tone: 'text-destructive', badge: 'destructive' },
  medium: { label: 'Suspicious', icon: AlertTriangle, tone: 'text-warning', badge: 'warning' },
  low: { label: 'No obvious warning signs', icon: CheckCircle2, tone: 'text-success', badge: 'success' },
};

// wrap every matched phrase in <mark> so people SEE the evidence
function Highlighted({ text, phrases }) {
  if (!phrases.length) return <>{text}</>;
  const escaped = phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return parts.map((part, i) => (i % 2 ? <mark key={i} className="rounded bg-warning/25 px-0.5">{part}</mark> : <span key={i}>{part}</span>));
}

export default function Checker({ onReport }) {
  const [text, setText] = useState('');
  const result = useMemo(() => (text.trim() ? analyse(text) : null), [text]);
  const L = result && LEVEL[result.level];

  return (
    <div className="space-y-6">
      <PageHeader title="Is this message a scam?" description="Paste a text, email or link. We explain exactly what looks wrong." />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle>The message</CardTitle>
            <CardDescription>Try an example:</CardDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              {SAMPLES.map((s) => <Button key={s.label} variant="outline" size="sm" onClick={() => setText(s.text)}>{s.label}</Button>)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the message here..." className="min-h-[180px]" aria-label="Message to check" />
            {result && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">What we found</div>
                <Highlighted text={text} phrases={result.findings.flatMap((f) => f.matches)} />
              </div>
            )}
            <TrustNote title="Private by design">Your message is checked inside your browser. It is never uploaded, stored or used to train anything.</TrustNote>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6">
              {!result ? (
                <p className="text-sm text-muted-foreground">Paste a message to see its risk score.</p>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <L.icon className={cn('size-8', L.tone)} />
                    <div>
                      <div className="font-semibold">{L.label}</div>
                      <div className="text-sm text-muted-foreground">Risk score {result.score}/100</div>
                    </div>
                  </div>
                  <Progress value={result.score} />
                  <div className="space-y-3">
                    {result.findings.map((f) => (
                      <div key={f.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {f.matches.slice(0, 3).map((m) => <Badge key={m} variant={L.badge}>{m.length > 28 ? `${m.slice(0, 28)}...` : m}</Badge>)}
                        </div>
                        <p className="mt-2 text-muted-foreground">{f.reason}</p>
                      </div>
                    ))}
                    {result.findings.length === 0 && <p className="text-sm text-muted-foreground">We did not find any of the usual scam patterns.</p>}
                  </div>
                  <div>
                    <div className="mb-1 text-sm font-semibold">What to do</div>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{ADVICE[result.level].map((a) => <li key={a}>{a}</li>)}</ul>
                  </div>
                  {result.level !== 'low' && (
                    <Button variant="outline" className="w-full" onClick={() => { onReport({ id: Date.now(), text: text.slice(0, 160), score: result.score, level: result.level, date: new Date().toISOString() }); toast.success('Saved to My reports on this device'); }}>
                      <Flag /> Save report
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
