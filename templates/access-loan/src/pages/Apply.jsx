import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, TrustNote } from '@/components/finance/blocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { money } from '@/lib/format';

const STEPS = ['About you', 'Money in and out', 'The loan'];

export default function Apply({ onSubmit, initial }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState(initial ?? { name: '', income: 1400, outgoings: 900, missedPayments: 0, amount: 500, months: 12 });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value }));
  const canNext = step === 0 ? f.name.trim().length > 1 : step === 1 ? f.income > 0 && f.outgoings >= 0 : f.amount >= 50;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Apply for a small loan" description="Three short steps. You see the full cost before you decide anything." />
      <div>
        <div className="mb-2 flex justify-between text-sm text-muted-foreground">
          <span>Step {step + 1} of 3: {STEPS[step]}</span>
        </div>
        <Progress value={((step + 1) / 3) * 100} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>{['Just your first name for now.', 'Roughly, per month. We use this only to check the loan is affordable.', 'Choose an amount and how long to repay.'][step]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <Field label="First name" htmlFor="n">
              <Input id="n" value={f.name} onChange={set('name')} placeholder="Amara" autoFocus />
            </Field>
          )}
          {step === 1 && (
            <>
              <Field label="Money coming in each month (£)" htmlFor="i" hint="Wages, benefits, regular support">
                <Input id="i" type="number" min="0" value={f.income} onChange={set('income')} />
              </Field>
              <Field label="Regular bills each month (£)" htmlFor="o" hint="Rent, food, transport, phone, existing debts">
                <Input id="o" type="number" min="0" value={f.outgoings} onChange={set('outgoings')} />
              </Field>
              <Field label="Missed payments in the last 6 months" htmlFor="m">
                <Input id="m" type="number" min="0" max="12" value={f.missedPayments} onChange={set('missedPayments')} />
              </Field>
            </>
          )}
          {step === 2 && (
            <>
              <Field label={`Amount: ${money(f.amount)}`} htmlFor="a">
                <input id="a" type="range" min="50" max="3000" step="50" value={f.amount} onChange={set('amount')} className="w-full accent-[hsl(var(--primary))]" />
              </Field>
              <Field label={`Repay over: ${f.months} months`} htmlFor="t">
                <input id="t" type="range" min="3" max="36" step="1" value={f.months} onChange={set('months')} className="w-full accent-[hsl(var(--primary))]" />
              </Field>
            </>
          )}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              <ArrowLeft /> Back
            </Button>
            {step < 2 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Next <ArrowRight />
              </Button>
            ) : (
              <Button onClick={() => onSubmit(f)} disabled={!canNext}>
                See my decision <ArrowRight />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <TrustNote title="What we never use">We do not use your age, gender, ethnicity or postcode. The decision uses only what you enter here, and we explain it in plain words.</TrustNote>
    </div>
  );
}
