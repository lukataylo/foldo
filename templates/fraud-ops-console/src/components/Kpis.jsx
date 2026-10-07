import { Tile } from '@carbon/react';

export default function Kpis({ items }) {
  const flagged = items.filter((t) => t.risk.level !== 'low');
  const blocked = items.filter((t) => t.status === 'blocked');
  const open = flagged.filter((t) => t.status === 'open').length;
  const saved = blocked.reduce((n, t) => n + t.amount, 0);
  const cards = [
    ['Transactions today', items.length],
    ['Flagged', flagged.length],
    ['Waiting for review', open],
    ['Blocked value', `£${saved.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`],
  ];
  return (
    <div className="kpis">
      {cards.map(([label, value]) => (
        <Tile key={label}>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{value}</div>
        </Tile>
      ))}
    </div>
  );
}
