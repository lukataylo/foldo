import { Modal, Tag } from '@carbon/react';

// Alert detail: always show the reasons, so an analyst (or a judge) can see why it was flagged.
export default function CaseModal({ txn, onClose, onDecide }) {
  if (!txn) return null;
  return (
    <Modal
      open
      modalHeading={`${txn.id} · £${txn.amount.toFixed(2)}`}
      modalLabel={`${txn.holder} at ${txn.merchant}`}
      primaryButtonText="Block transaction"
      secondaryButtonText="Approve"
      danger
      onRequestClose={onClose}
      onRequestSubmit={() => onDecide(txn.id, 'blocked')}
      onSecondarySubmit={() => onDecide(txn.id, 'approved')}
    >
      <p style={{ marginBottom: '1rem' }}>
        Risk score <Tag type={txn.risk.level === 'high' ? 'red' : txn.risk.level === 'medium' ? 'warm-gray' : 'green'}>{txn.risk.score}/100</Tag>
      </p>
      {txn.risk.reasons.length === 0 && <p>No rules matched. This looks like normal behaviour.</p>}
      {txn.risk.reasons.map((r) => (
        <div className="reason" key={r.id}>
          <strong>{r.label}</strong> <Tag size="sm">+{r.weight}</Tag>
          <div style={{ color: 'var(--cds-text-secondary)' }}>{r.text}</div>
        </div>
      ))}
    </Modal>
  );
}
