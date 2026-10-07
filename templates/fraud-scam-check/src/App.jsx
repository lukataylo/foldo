import { BookOpen, ClipboardList, ScanSearch } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '@/components/finance/AppShell';
import { Badge } from '@/components/ui/badge';
import Checker from '@/pages/Checker.jsx';
import Learn from '@/pages/Learn.jsx';
import Reports from '@/pages/Reports.jsx';

const NAV = [
  { id: 'check', label: 'Check a message', icon: ScanSearch },
  { id: 'learn', label: 'Spot the signs', icon: BookOpen },
  { id: 'reports', label: 'My reports', icon: ClipboardList },
];

const load = () => {
  try {
    return JSON.parse(localStorage.getItem('scam-reports') ?? '[]');
  } catch {
    return [];
  }
};

export default function App() {
  const [page, setPage] = useState('check');
  const [reports, setReports] = useState(load);
  const addReport = (r) => setReports((list) => {
    const next = [r, ...list].slice(0, 50);
    try { localStorage.setItem('scam-reports', JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });

  return (
    <AppShell brand="Scamwise" tagline="Check before you click" nav={NAV} active={page} onNavigate={setPage} actions={<Badge variant="success">Private: runs on your device</Badge>}>
      {page === 'check' && <Checker onReport={addReport} />}
      {page === 'learn' && <Learn />}
      {page === 'reports' && <Reports reports={reports} />}
    </AppShell>
  );
}
