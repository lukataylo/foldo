import { Content, Header, HeaderGlobalBar, HeaderName, InlineNotification, Tab, TabList, TabPanel, TabPanels, Tabs, Theme, Toggle } from '@carbon/react';
import { useEffect, useMemo, useState } from 'react';
import CaseModal from '@/components/CaseModal.jsx';
import Kpis from '@/components/Kpis.jsx';
import RulesPanel from '@/components/RulesPanel.jsx';
import TransactionTable from '@/components/TransactionTable.jsx';
import { makeTransaction, seedTransactions } from '@/data';
import { RULES, score } from '@/risk';
import './app.css';

export default function App() {
  const [raw, setRaw] = useState(() => seedTransactions());
  const [enabled, setEnabled] = useState(RULES.map((r) => r.id));
  const [live, setLive] = useState(true);
  const [selected, setSelected] = useState(null);

  // simulated live feed: one new transaction every 2.5 seconds
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setRaw((list) => [makeTransaction(), ...list].slice(0, 80)), 2500);
    return () => clearInterval(t);
  }, [live]);

  // scores are derived, so toggling a rule re-scores everything
  const items = useMemo(() => raw.map((t) => ({ ...t, risk: score(t, enabled) })), [raw, enabled]);
  const queue = items.filter((t) => t.risk.level !== 'low' && t.status === 'open');
  const decide = (id, status) => { setRaw((l) => l.map((t) => (t.id === id ? { ...t, status } : t))); setSelected(null); };
  const current = selected && items.find((t) => t.id === selected.id);

  return (
    <Theme theme="g100">
      <Header aria-label="Fraud console">
        <HeaderName href="#" prefix="Sentinel">Fraud monitoring</HeaderName>
        <HeaderGlobalBar>
          <div style={{ padding: '0 1rem' }}>
            <Toggle id="live" size="sm" labelA="Paused" labelB="Live" hideLabel toggled={live} onToggle={setLive} aria-label="Live feed" />
          </div>
        </HeaderGlobalBar>
      </Header>
      <Content style={{ minHeight: '100vh', paddingTop: '5rem' }}>
        <InlineNotification kind="info" lowContrast hideCloseButton title="Demo data" subtitle="All transactions are simulated. No real cardholder data is used." style={{ marginBottom: '1rem', maxWidth: 'none' }} />
        <Kpis items={items} />
        <Tabs>
          <TabList aria-label="Views">
            <Tab>Live monitoring</Tab>
            <Tab>{`Alert queue (${queue.length})`}</Tab>
            <Tab>Rules</Tab>
          </TabList>
          <TabPanels>
            <TabPanel><TransactionTable items={items.slice(0, 30)} onSelect={setSelected} title="Live transactions" description="Click a row to see why it was scored this way." /></TabPanel>
            <TabPanel><TransactionTable items={queue} onSelect={setSelected} title="Needs review" description="Medium and high risk, not yet decided." /></TabPanel>
            <TabPanel><RulesPanel enabled={enabled} setEnabled={setEnabled} /></TabPanel>
          </TabPanels>
        </Tabs>
      </Content>
      <CaseModal txn={current} onClose={() => setSelected(null)} onDecide={decide} />
    </Theme>
  );
}
