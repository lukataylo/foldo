import { BookOpen, CalendarDays, FileText, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '@/components/finance/AppShell';
import { DemoBanner } from '@/components/finance/blocks';
import { Badge } from '@/components/ui/badge';
import { decide } from '@/decision';
import Apply from '@/pages/Apply.jsx';
import Decision from '@/pages/Decision.jsx';
import Learn from '@/pages/Learn.jsx';
import Schedule from '@/pages/Schedule.jsx';

const NAV = [
  { id: 'apply', label: 'Apply', icon: FileText },
  { id: 'decision', label: 'Your decision', icon: ShieldCheck },
  { id: 'schedule', label: 'Repayments', icon: CalendarDays },
  { id: 'learn', label: 'Learn', icon: BookOpen },
];

export default function App() {
  const [page, setPage] = useState('apply');
  const [application, setApplication] = useState(null);
  const result = application ? decide(application) : null;

  return (
    <AppShell brand="Fairly" tagline="Small loans, clear terms" nav={NAV} active={page} onNavigate={setPage} actions={<Badge variant="secondary">19% APR example</Badge>}>
      <DemoBanner>Demo only. This is not a real loan offer and no data is stored.</DemoBanner>
      {page === 'apply' && <Apply onSubmit={(a) => { setApplication(a); setPage('decision'); }} initial={application} />}
      {page === 'decision' && <Decision application={application} result={result} goApply={() => setPage('apply')} goSchedule={() => setPage('schedule')} />}
      {page === 'schedule' && <Schedule application={application} />}
      {page === 'learn' && <Learn />}
    </AppShell>
  );
}
