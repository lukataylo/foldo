import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DemoBanner } from '@/components/finance/blocks';

// Blank finance starter: replace this file. The UI kit (shadcn/ui style) lives in src/components/ui,
// finance blocks in src/components/finance, helpers (money, loan maths, fake data) in src/lib.
export default function App() {
  return (
    <div className="container space-y-6 py-12">
      <DemoBanner />
      <Card>
        <CardHeader>
          <CardTitle>Your fintech idea starts here</CardTitle>
          <CardDescription>Tell Foldo what to build. Everything you need is already installed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Get started</Button>
        </CardContent>
      </Card>
    </div>
  );
}
