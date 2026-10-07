import { DataTable, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tag } from '@carbon/react';

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

export default function TransactionTable({ items, onSelect, title, description }) {
  const rows = items.map((t) => ({ id: t.id, holder: t.holder, merchant: t.merchant, amount: t.amount, city: t.city, risk: t.risk.score, status: t.status }));
  const byId = Object.fromEntries(items.map((t) => [t.id, t]));
  return (
    <DataTable rows={rows} headers={HEADERS} isSortable>
      {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
        <TableContainer title={title} description={description}>
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((h) => {
                  const { key, ...rest } = getHeaderProps({ header: h });
                  return <TableHeader key={key} {...rest}>{h.header}</TableHeader>;
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const { key, ...rest } = getRowProps({ row });
                const t = byId[row.id];
                return (
                  <TableRow key={key} {...rest} className="row-clickable" onClick={() => onSelect(t)}>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>
                        {cell.info.header === 'risk' ? <Tag type={TAG[t.risk.level]} size="sm">{t.risk.score} · {t.risk.level}</Tag> : cell.info.header === 'status' ? <Tag type={STATUS[t.status]} size="sm">{t.status}</Tag> : cell.info.header === 'amount' ? `£${Number(cell.value).toFixed(2)}` : cell.value}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );
}
