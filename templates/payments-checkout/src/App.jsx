import { CreditCard, Link2, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/finance/AppShell';
import { DemoBanner } from '@/components/finance/blocks';
import { Badge } from '@/components/ui/badge';
import { fakeTransactions } from '@/lib/data';
import Activity from '@/pages/Activity.jsx';
import Checkout from '@/pages/Checkout.jsx';
import Links from '@/pages/Links.jsx';

const NAV = [
  { id: 'checkout', label: 'Checkout', icon: CreditCard },
  { id: 'links', label: 'Payment links', icon: Link2 },
  { id: 'activity', label: 'Activity', icon: ReceiptText },
];

export default function App() {
  const [page, setPage] = useState('checkout');
  const [payments, setPayments] = useState(() =>
    fakeTransactions(14, 14).map((t) => ({ id: t.id, customer: t.merchant, amount: t.amount, date: t.date, status: t.status === 'settled' ? 'succeeded' : 'processing' })),
  );
  const [links, setLinks] = useState([
    { id: 'l1', title: 'Community workshop ticket', amount: 15, currency: 'GBP', slug: 'workshop-ticket', active: true },
    { id: 'l2', title: 'Donation', amount: 5, currency: 'GBP', slug: 'donate', active: true },
  ]);
  const total = useMemo(() => payments.filter((p) => p.status === 'succeeded').reduce((n, p) => n + p.amount, 0), [payments]);

  const addPayment = (p) => setPayments((list) => [{ id: `pay_${Date.now()}`, date: new Date().toISOString(), status: 'succeeded', ...p }, ...list]);

  return (
    <AppShell brand="Payly" tagline="Payments demo" nav={NAV} active={page} onNavigate={setPage} actions={<Badge variant="warning">Test mode</Badge>}>
      <DemoBanner>Test mode: use card 4242 4242 4242 4242, any future date, any CVC. No real money moves.</DemoBanner>
      {page === 'checkout' && <Checkout onPaid={addPayment} />}
      {page === 'links' && <Links links={links} setLinks={setLinks} />}
      {page === 'activity' && <Activity payments={payments} total={total} />}
    </AppShell>
  );
}
