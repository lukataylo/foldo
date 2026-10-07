import { Tile, Toggle } from '@carbon/react';
import { RULES } from '@/risk';

export default function RulesPanel({ enabled, setEnabled }) {
  return (
    <Tile>
      <h4 style={{ marginBottom: '0.5rem' }}>Detection rules</h4>
      <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1.5rem' }}>Switch a rule off and watch scores and alerts change instantly. Every rule is explainable.</p>
      {RULES.map((r) => (
        <div className="reason" key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>{r.label}</strong>
            <div style={{ color: 'var(--cds-text-secondary)' }}>Adds {r.weight} points to the risk score</div>
          </div>
          <Toggle id={`rule-${r.id}`} size="sm" labelA="Off" labelB="On" hideLabel toggled={enabled.includes(r.id)} onToggle={(on) => setEnabled((cur) => (on ? [...cur, r.id] : cur.filter((x) => x !== r.id)))} aria-label={r.label} />
        </div>
      ))}
    </Tile>
  );
}
