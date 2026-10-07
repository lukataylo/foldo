import { useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tag } from '@carbon/react';

const HEADERS = [
  { key: 'id', header: 'ID' },
  { key: 'holder', header: 'Cardholder' },
  { key: 'merchant', header: 'Merchant' },
  { key: 'amount', header: 'Amount' },
  { key: 'city', header: 'Location' },
  { key: 'risk', header: 'Risk' },
  { key: 'status', header: 'Status' },
];
const TAG = { high: 'red', medium: 'warm-gray', low: 'green' };
const STATUS = { open: 'gray', approved: 'green', blocked: 'red' };
const value = (t, key) => (key === 'risk' ? t.risk.score : t[key]);

// Plain Carbon table parts with our own sorting. (Carbon's DataTable keeps its own copy of the rows and, fed a new list every
// 2.5 s by the live feed, can loop or render a stale row.)
export default function TransactionTable({ items, onSelect, title, description }) {
  const [sort, setSort] = useState(null); // { key, dir }
  const rows = sort
    ? [...items].sort((a, b) => {
        const x = value(a, sort.key);
        const y = value(b, sort.key);
        return (x > y ? 1 : x < y ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1);
      })
    : items;
  const toggle = (key) => setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  return (
    <TableContainer title={title} description={description}>
      <Table>
        <TableHead>
          <TableRow>
            {HEADERS.map((h) => (
              <TableHeader key={h.key} isSortable isSortHeader={sort?.key === h.key} sortDirection={sort?.key === h.key ? (sort.dir === 'asc' ? 'ASC' : 'DESC') : 'NONE'} onClick={() => toggle(h.key)}>
                {h.header}
              </TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id} className="row-clickable" onClick={() => onSelect(t)}>
              <TableCell>{t.id}</TableCell>
              <TableCell>{t.holder}</TableCell>
              <TableCell>{t.merchant}</TableCell>
              <TableCell>{`£${Number(t.amount).toFixed(2)}`}</TableCell>
              <TableCell>{t.city}</TableCell>
              <TableCell>
                <Tag type={TAG[t.risk.level]} size="sm">{t.risk.score} · {t.risk.level}</Tag>
              </TableCell>
              <TableCell>
                <Tag type={STATUS[t.status]} size="sm">{t.status}</Tag>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
