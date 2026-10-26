import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import type { WarehouseDilovodObjectSnapshot } from '@shared/types/warehouseDocumentEdit';
import { formatQty } from '@/features/product-movements/productMovementsUtils';

function headerEntries(header: Record<string, unknown>): Array<{ key: string; value: string }> {
  const skip = new Set(['id', 'version', 'delMark', 'posted', 'saveType']);
  return Object.entries(header)
    .filter(([key, value]) => !skip.has(key) && value != null && String(value).trim() !== '')
    .map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }))
    .slice(0, 24);
}

function tpGoodsRows(tpGoods?: Record<string, Record<string, unknown>>) {
  if (!tpGoods) return [];
  return Object.values(tpGoods).map((row, index) => ({
    id: String(row.id ?? index),
    name: String(row.good__pr ?? row.good ?? '—'),
    sku: String(row.sku ?? ''),
    batch: String(row.goodPart__pr ?? row.goodPart ?? ''),
    qty: Number(row.qty ?? 0),
  }));
}

interface DilovodDocumentViewSectionsProps {
  dilovod: WarehouseDilovodObjectSnapshot | null;
  title?: string;
  /** Не показувати сирий блок реквізитів header (лише таблична частина). */
  hideHeader?: boolean;
  /** Стиль таблиці як на сторінках складу (без дублювання заголовка «Таблична частина»). */
  tableOnly?: boolean;
}

export default function DilovodDocumentViewSections({
  dilovod,
  title = 'Діловод',
  hideHeader = false,
  tableOnly = false,
}: DilovodDocumentViewSectionsProps) {
  if (!dilovod) {
    return (
      <p className="text-sm text-default-500">Дані документа з Діловода недоступні.</p>
    );
  }

  const meta = headerEntries(dilovod.header ?? {});
  const rows = tpGoodsRows(dilovod.tableParts?.tpGoods);

  return (
    <div className="space-y-4">
      {!hideHeader && meta.length > 0 ? (
        <div className="rounded-lg border border-default-200 bg-content1 p-3">
          <h3 className="text-sm font-semibold mb-2">{title} — реквізити</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {meta.map((entry) => (
              <div key={entry.key} className="min-w-0">
                <dt className="text-default-500 text-xs">{entry.key}</dt>
                <dd className="font-mono text-xs break-all">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className={`rounded-lg border border-default-200 overflow-hidden ${tableOnly ? 'bg-white shadow-small' : ''}`}>
        <h3 className="text-sm font-semibold px-3 py-2 bg-default-100 border-b border-default-200">
          {tableOnly ? 'Товари документа' : `Таблична частина (${rows.length})`}
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-default-500 p-3">Рядків tpGoods немає.</p>
        ) : (
          <Table removeWrapper aria-label="tpGoods" classNames={{ th: 'text-xs' }}>
            <TableHeader>
              <TableColumn>Товар</TableColumn>
              <TableColumn>SKU</TableColumn>
              <TableColumn>Партія</TableColumn>
              <TableColumn className="text-right">Кількість</TableColumn>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">{row.name}</TableCell>
                  <TableCell className="text-xs font-mono">{row.sku}</TableCell>
                  <TableCell className="text-xs">{row.batch}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatQty(row.qty) || '0'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
