import { PageHeader } from '@/components/finance/blocks';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/misc';
import { Card, CardContent } from '@/components/ui/card';

const TERMS = [
  ['What is APR?', 'APR is the yearly cost of borrowing, including interest. A higher APR means you pay back more for the same loan.'],
  ['What is disposable income?', 'The money left each month after your regular bills. We check the loan fits inside it.'],
  ['What if I miss a payment?', 'Contact us before you miss one. We can usually agree a short break or a smaller payment. Missing payments can make future borrowing harder.'],
  ['Can I repay early?', 'Yes. In this example there is no penalty for repaying early, and you would pay less interest.'],
  ['Who can I talk to about debt?', 'Free, independent help is available from organisations such as MoneyHelper and StepChange in the UK.'],
];

export default function Learn() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Money words, explained" description="No jargon. Ask anything." />
      <Card>
        <CardContent className="px-6 py-2">
          <Accordion type="single" collapsible>
            {TERMS.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger>{q}</AccordionTrigger>
                <AccordionContent>{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
