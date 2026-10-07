import { Laptop, Plane, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/finance/blocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { money } from '@/lib/format';

const ICONS = { shield: ShieldCheck, laptop: Laptop, plane: Plane };

export default function Jars({ t, jars, setJars }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  const add = (id) => {
    setJars((list) => list.map((j) => (j.id === id ? { ...j, saved: Math.min(j.target, j.saved + 10) } : j)));
    toast.success('£10 added. Nice one!');
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('jars')} description="Small amounts add up. Pick a goal and fill the jar." actions={<Button onClick={() => setOpen(true)}><Plus /> {t('newJar')}</Button>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {jars.map((j) => {
          const Icon = ICONS[j.emoji] ?? ShieldCheck;
          const pct = (j.saved / j.target) * 100;
          return (
            <Card key={j.id}>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-5" /></div>
                    <div className="font-medium">{j.name}</div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{Math.round(pct)}%</span>
                </div>
                <Progress value={pct} />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{money(j.saved)} {t('saved')} of {money(j.target)}</span>
                  <Button size="sm" variant="outline" onClick={() => add(j.id)} disabled={j.saved >= j.target}>{t('addToJar')}</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('newJar')}</DialogTitle></DialogHeader>
          <Field label="What are you saving for?" htmlFor="jn"><Input id="jn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Phone repair" /></Field>
          <Field label="Target (£)" htmlFor="jt"><Input id="jt" type="number" min="10" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="200" /></Field>
          <Button onClick={() => { if (!name.trim() || !(Number(target) >= 10)) return toast.error('Add a name and a target of £10 or more.'); setJars((l) => [...l, { id: `j${Date.now()}`, name: name.trim(), target: Number(target), saved: 0, emoji: 'shield' }]); setName(''); setTarget(''); setOpen(false); }}>Create jar</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
