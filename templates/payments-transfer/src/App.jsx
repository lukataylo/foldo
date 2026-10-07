import { History, Send, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/finance/AppShell';
import { DemoBanner } from '@/components/finance/blocks';
import { Badge } from '@/components/ui/badge';
import { BASE_RATES } from '@/data';
import Activity from '@/pages/Activity.jsx';
import Recipients from '@/pages/Recipients.jsx';
import SendMoney from '@/pages/Send.jsx';

const NAV = [
  { id: 'send', label: 'Send money', icon: Send },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'recipients', label: 'Recipients', icon: Users },
];

export default function App() {
  const [page, setPage] = useState('send');
  const [rates, setRates] = useState(BASE_RATES);
  const [transfers, setTransfers] = useState([]);

  // rates wobble a little every 4s so the demo feels live
  useEffect(() => {
    const t = setInterval(() => setRates((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'GBP' ? 1 : v * (1 + (Math.random() - 0.5) * 0.002)]))), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <AppShell brand="Hopper" tagline="Cross-border transfers" nav={NAV} active={page} onNavigate={setPage} actions={<Badge variant="success">Rates live</Badge>}>
      <DemoBanner>Simulated rates and fees. No money is sent.</DemoBanner>
      {page === 'send' && <SendMoney rates={rates} onSent={(t) => { setTransfers((l) => [t, ...l]); setPage('activity'); }} />}
      {page === 'activity' && <Activity transfers={transfers} />}
      {page === 'recipients' && <Recipients />}
    </AppShell>
  );
}
