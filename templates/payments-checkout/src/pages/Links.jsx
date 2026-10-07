import { Copy, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader } from '@/components/finance/blocks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { money } from '@/lib/format';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Links({ links, setLinks }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');

  const create = (e) => {
    e.preventDefault();
    if (!title.trim() || !(Number(amount) > 0)) return toast.error('Add a title and an amount above zero.');
    setLinks((l) => [{ id: `l${Date.now()}`, title: title.trim(), amount: Number(amount), currency: 'GBP', slug: slugify(title), active: true }, ...l]);
    setTitle('');
    setAmount('');
    toast.success('Payment link created');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Payment links" description="Share a link, get paid. No website needed." />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <form onSubmit={create}>
            <CardHeader>
              <CardTitle>New link</CardTitle>
              <CardDescription>Anyone with the link can pay.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="What is it for?" htmlFor="t">
                <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Piano lesson" />
              </Field>
              <Field label="Amount (GBP)" htmlFor="a">
                <Input id="a" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25.00" />
              </Field>
              <Button type="submit" className="w-full">
                <Plus /> Create link
              </Button>
            </CardContent>
          </form>
        </Card>

        <div className="space-y-3">
          {links.length === 0 && <EmptyState title="No links yet" description="Create your first payment link on the left." />}
          {links.map((l) => (
            <Card key={l.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {l.title} <Badge variant={l.active ? 'success' : 'secondary'}>{l.active ? 'Active' : 'Paused'}</Badge>
                  </div>
                  <div className="truncate text-sm text-muted-foreground">pay.payly.demo/{l.slug}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold tabular-nums">{money(l.amount, l.currency)}</span>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(`https://pay.payly.demo/${l.slug}`); toast.success('Link copied'); }}>
                    <Copy /> Copy
                  </Button>
                  <Switch checked={l.active} onCheckedChange={(v) => setLinks((all) => all.map((x) => (x.id === l.id ? { ...x, active: v } : x)))} aria-label="Active" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
