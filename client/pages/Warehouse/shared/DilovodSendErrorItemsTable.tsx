import { useMemo } from 'react';
import { dedupeAndNormalize, parseDilovodErrorText } from '@/lib/metaLogsParser';
import { parseDilovodInsufficientStockRows } from '@shared/utils/dilovodInsufficientStockParse';

type Row = {
  name: string;
  sku: string;
  batch: string;
  needed: string;
  stock: string;
  missing: string;
};

function collectRows(raw: string): Row[] {
  const structured = parseDilovodInsufficientStockRows(raw);
  if (structured.length > 0) return structured;

  const parsed = dedupeAndNormalize(parseDilovodErrorText(raw));
  if (parsed.skus.length === 0) return [];

  const max = Math.max(
    parsed.names.length,
    parsed.skus.length,
    parsed.needed.length,
    parsed.stock.length,
    parsed.missing.length,
  );
  const rows: Row[] = [];
  for (let i = 0; i < max; i++) {
    rows.push({
      name: parsed.names[i] ?? '—',
      sku: parsed.skus[i] ?? '—',
      batch: '—',
      needed: parsed.needed[i] ?? '—',
      stock: parsed.stock[i] ?? '—',
      missing: parsed.missing[i] ?? '—',
    });
  }
  return rows;
}

export function DilovodSendErrorItemsTable({ raw }: { raw: string }) {
  const rows = useMemo(() => collectRows(raw), [raw]);
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs text-red-900">
        <thead>
          <tr className="border-b border-red-200 text-left text-red-800/90">
            <th className="py-1 pr-2 font-medium">Позиція</th>
            <th className="py-1 pr-2 font-medium">SKU</th>
            <th className="py-1 pr-2 font-medium">Партія</th>
            <th className="py-1 pr-2 font-medium">Потрібно</th>
            <th className="py-1 pr-2 font-medium">Залишок</th>
            <th className="py-1 font-medium">Бракує</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.sku}-${index}`} className="border-b border-red-100/80 last:border-0">
              <td className="py-1 pr-2 align-top">{row.name}</td>
              <td className="py-1 pr-2 align-top font-mono">{row.sku}</td>
              <td className="py-1 pr-2 align-top font-mono">{row.batch}</td>
              <td className="py-1 pr-2 align-top">{row.needed}</td>
              <td className="py-1 pr-2 align-top">{row.stock}</td>
              <td className="py-1 align-top font-medium">{row.missing}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
