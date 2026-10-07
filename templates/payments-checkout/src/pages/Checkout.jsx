import { CheckCircle2, Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, TrustNote } from '@/components/finance/blocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/misc';
import { cardBrand, luhn } from '@/lib/finance';
import { money } from '@/lib/format';

const ITEMS = [
  { name: 'Community workshop ticket', qty: 2, price: 15 },
  { name: 'Booking fee', qty: 1, price: 1.5 },
];

const formatCard = (v) => v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
const formatExpiry = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

function validate({ email, card, expiry, cvc }) {
  const errors = {};
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Enter a valid email so we can send your receipt.';
  if (!luhn(card)) errors.card = 'That card number does not look right. Try 4242 4242 4242 4242.';
  const m = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 || new Date(2000 + Number(m[2]), Number(m[1])) < new Date()) errors.expiry = 'Use a future date as MM/YY.';
  if (!/^\d{3,4}$/.test(cvc)) errors.cvc = '3 or 4 digits.';
  return errors;
}

export default function Checkout({ onPaid }) {
  const [form, setForm] = useState({ name: '', email: '', card: '', expiry: '', cvc: '' });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState('idle'); // idle | processing | paid
  const [receipt, setReceipt] = useState(null);
  const total = ITEMS.reduce((n, i) => n + i.qty * i.price, 0);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === 'card' ? formatCard(e.target.value) : k === 'expiry' ? formatExpiry(e.target.value) : e.target.value }));

  const pay = (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setState('processing');
    setTimeout(() => {
      const r = { ref: `PAY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, last4: form.card.slice(-4), brand: cardBrand(form.card) };
      setReceipt(r);
      onPaid({ customer: form.name || form.email, amount: total });
      setState('paid');
    }, 1400);
  };

  if (state === 'paid')
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardContent className="space-y-3 p-10">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <h2 className="text-xl font-semibold">Payment successful</h2>
          <p className="text-sm text-muted-foreground">
            {money(total)} paid with {receipt.brand} ending {receipt.last4}. A receipt was sent to {form.email}.
          </p>
          <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs">Reference {receipt.ref}</div>
          <Button variant="outline" onClick={() => { setState('idle'); setForm({ name: '', email: '', card: '', expiry: '', cvc: '' }); }}>
            Make another payment
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Checkout" description="What your customer sees when they pay." />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
            <CardDescription>Payly Community Events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ITEMS.map((i) => (
              <div key={i.name} className="flex justify-between text-sm">
                <span>
                  {i.name} <span className="text-muted-foreground">x {i.qty}</span>
                </span>
                <span className="tabular-nums">{money(i.qty * i.price)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{money(total)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <form onSubmit={pay} noValidate>
            <CardHeader>
              <CardTitle>Pay by card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Name on card" htmlFor="name">
                <Input id="name" value={form.name} onChange={set('name')} placeholder="Amara Okafor" autoComplete="cc-name" />
              </Field>
              <Field label="Email" htmlFor="email" error={errors.email}>
                <Input id="email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
              </Field>
              <Field label="Card number" htmlFor="card" error={errors.card} hint={form.card ? cardBrand(form.card) : 'Test card: 4242 4242 4242 4242'}>
                <Input id="card" inputMode="numeric" value={form.card} onChange={set('card')} placeholder="1234 1234 1234 1234" autoComplete="cc-number" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Expiry" htmlFor="expiry" error={errors.expiry}>
                  <Input id="expiry" inputMode="numeric" value={form.expiry} onChange={set('expiry')} placeholder="MM/YY" autoComplete="cc-exp" />
                </Field>
                <Field label="CVC" htmlFor="cvc" error={errors.cvc}>
                  <Input id="cvc" inputMode="numeric" value={form.cvc} onChange={set('cvc')} placeholder="123" autoComplete="cc-csc" />
                </Field>
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={state === 'processing'}>
                {state === 'processing' ? <Loader2 className="animate-spin" /> : <Lock />}
                {state === 'processing' ? 'Processing...' : `Pay ${money(total)}`}
              </Button>
              <TrustNote title="Your card never leaves this page">This demo checks the number in your browser only. Nothing is sent or stored anywhere.</TrustNote>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
