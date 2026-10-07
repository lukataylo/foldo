import { Alert } from '@/components/ui/misc';
import { PageHeader, TrustNote } from '@/components/finance/blocks';
import { tips } from '@/coach';

export default function Coach() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Your coach" description="Simple tips based on your own numbers." />
      {tips().map((tip) => (
        <Alert key={tip.id} variant={tip.tone} title={tip.title}>
          {tip.body}
          <div className="mt-2 text-xs italic">{tip.why}</div>
        </Alert>
      ))}
      <TrustNote title="Why am I seeing this?">Every tip shows the rule that triggered it. We do not sell your data or show you ads for loans.</TrustNote>
    </div>
  );
}
