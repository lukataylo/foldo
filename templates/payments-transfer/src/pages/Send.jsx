import { ArrowRight, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader, TrustNote } from '@/components/finance/blocks';
import { BarCompare } from '@/components/finance/charts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/misc';
import { BANK_FEE, CURRENCIES, OUR_FEE, RECIPIENTS } from '@/data';
import { convert } from '@/lib/finance';
import { money } from '@/lib/format';

export default function SendMoney({ rates, onSent }) {
  const [amount, setAmount] = useState('200');
  const [to, setTo] = useState('NGN');
  const [recipient, setRecipient] = useState(RECIPIENTS[0].id);
  const [confirm, setConfirm] = useState(false);

  const q = useMemo(() => {
    const a = Math.max(0, Number(amount) || 0);
    const ourFee = a ? OUR_FEE.fixed + a * OUR_FEE.percent : 0;
    const rate = convert(1, 'GBP', to, rates);
    const receives = (a - ourFee) * rate;
    const bankReceives = (a - BANK_FEE.fixed) * rate * (1 - BANK_FEE.marginOnRate);
    return { a, ourFee, rate, receives, bankReceives, saving: receives - bankReceives };
  }, [amount, to, rates]);

  const valid = q.a >= 10 && q.a <= 5000;
  const chart = [
    { label: 'Hopper', value: Math.round(q.receives) },
    { label: 'Typical bank', value: Math.round(q.bankReceives) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Send money" description="See exactly what it costs and what arrives, before you pay." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Transfer details</CardTitle>
            <CardDescription>Rate updates every few seconds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <Field label="You send (GBP)" htmlFor="amt" error={q.a && !valid ? 'Between £10 and £5,000.' : undefined}>
                <Input id="amt" type="number" min="10" max="5000" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="They receive in">
                <Select value={to} onValueChange={setTo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.filter((c) => c !== 'GBP').map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Recipient">
              <Select value={recipient} onValueChange={setRecipient}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RECIPIENTS.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · {r.account}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Separator />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Our fee</dt><dd className="tabular-nums">{money(q.ourFee)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Exchange rate (no markup)</dt><dd className="tabular-nums">1 GBP = {q.rate.toFixed(4)} {to}</dd></div>
              <div className="flex justify-between text-base font-semibold"><dt>They receive</dt><dd className="tabular-nums">{money(q.receives || 0, to, { maximumFractionDigits: 0 })}</dd></div>
            </dl>
            <Button size="lg" className="w-full" disabled={!valid} onClick={() => setConfirm(true)}>
              Review transfer <ArrowRight />
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>You save {valid ? money(q.saving / q.rate) : '£0.00'}</CardTitle>
              <CardDescription>vs a typical bank (assumes a £15 fee and 4% rate margin)</CardDescription>
            </CardHeader>
            <CardContent>
              <BarCompare data={chart} series={[{ key: 'value', name: `Recipient gets (${to})` }]} height={200} />
            </CardContent>
          </Card>
          <TrustNote title="Why we show every fee">Hidden fees hurt the people who can least afford them. You always see the fee, the rate and the amount that arrives before you confirm.</TrustNote>
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm transfer</DialogTitle>
            <DialogDescription>Check the details. You cannot edit a transfer once it is sent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between"><span>To</span><b>{RECIPIENTS.find((r) => r.id === recipient)?.name}</b></div>
            <div className="flex justify-between"><span>You send</span><b>{money(q.a)}</b></div>
            <div className="flex justify-between"><span>Fee</span><b>{money(q.ourFee)}</b></div>
            <div className="flex justify-between"><span>They receive</span><b>{money(q.receives, to, { maximumFractionDigits: 0 })}</b></div>
          </div>
          <Button
            size="lg"
            onClick={() => {
              setConfirm(false);
              onSent({ id: `TR-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, to: RECIPIENTS.find((r) => r.id === recipient)?.name, amount: q.a, fee: q.ourFee, receives: q.receives, currency: to, created: Date.now() });
            }}
          >
            <Check /> Send {money(q.a)}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
