import { Lightbulb, LayoutDashboard, PiggyBank } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/finance/AppShell';
import { DemoBanner } from '@/components/finance/blocks';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { JARS } from '@/data';
import { LANGS, makeT } from '@/i18n';
import Coach from '@/pages/Coach.jsx';
import Jars from '@/pages/Jars.jsx';
import Overview from '@/pages/Overview.jsx';

export default function App() {
  const [page, setPage] = useState('overview');
  const [lang, setLang] = useState('en');
  const [simple, setSimple] = useState(false);
  const [jars, setJars] = useState(JARS);
  const t = useMemo(() => makeT(lang), [lang]);
  const nav = [
    { id: 'overview', label: t('overview'), icon: LayoutDashboard },
    { id: 'jars', label: t('jars'), icon: PiggyBank },
    { id: 'coach', label: t('coach'), icon: Lightbulb },
  ];

  return (
    <div className={simple ? 'text-lg [&_.text-xs]:text-sm [&_.text-sm]:text-base' : ''}>
      <AppShell
        brand="Pennywise"
        tagline="Your money, made simple"
        nav={nav}
        active={page}
        onNavigate={setPage}
        actions={
          <>
            <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
              {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <Switch id="simple" checked={simple} onCheckedChange={setSimple} />
              <Label htmlFor="simple" className="hidden sm:block">{t('simple')}</Label>
            </div>
          </>
        }
      >
        <DemoBanner>Example data only. Nothing here is connected to a real bank account.</DemoBanner>
        {page === 'overview' && <Overview t={t} />}
        {page === 'jars' && <Jars t={t} jars={jars} setJars={setJars} />}
        {page === 'coach' && <Coach />}
      </AppShell>
    </div>
  );
}
