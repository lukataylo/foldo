import { PageHeader } from '@/components/finance/blocks';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/misc';
import { Card, CardContent } from '@/components/ui/card';

const SCAMS = [
  ['Fake bank calls and texts', 'They say your account is at risk and ask for a code or to move money to a "safe account". Your bank will never ask you to do this. Hang up and call the number on your card.'],
  ['Parcel and delivery fees', 'A text says a parcel is held and asks for a small fee through a link. The small fee is the bait; the page steals your card details.'],
  ['Romance and friendship scams', 'Someone you met online builds trust, then needs money urgently. Never send money to someone you have not met in person.'],
  ['Investment "opportunities"', 'Guaranteed returns do not exist. Check the firm on the FCA register before you invest anything.'],
  ['Invoice and boss scams', 'An email that looks like your boss or supplier asks for an urgent payment to new bank details. Always confirm by phone.'],
];

export default function Learn() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Spot the signs" description="The five scams we see most, in plain English." />
      <Card>
        <CardContent className="px-6 py-2">
          <Accordion type="single" collapsible>
            {SCAMS.map(([q, a]) => (
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
