import React, { useMemo, useState } from 'react';
import { normalizeItemsArray as clientNormalizeItems, normalizeSetsArray as clientNormalizeSets } from '@/pages/Warehouse/shared/historyNormalize';
import type { HistoryBatchLink, HistoryItemNormalized, HistorySetNormalized } from '@/pages/Warehouse/shared/historyNormalize';
import { useProductMovementsDrawerOptional } from '@/features/product-movements/context/productMovementsDrawerContext.shared';
import { DynamicIcon } from 'lucide-react/dynamic';

type Mode = 'normal' | 'sets';

export interface HistoryItemsTableColumn {
  key: string;
  label: React.ReactNode;
  render?: (item: HistoryItemNormalized) => React.ReactNode;
  sortValue?: (item: HistoryItemNormalized) => string | number | null | undefined;
  sortType?: 'text' | 'number';
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'center' | 'right';
}

interface Props {
  title?: string;
  mode?: Mode;
  items?: any[];
  sets?: any[];
  className?: string;
  hideHeader?: boolean;
  columns?: HistoryItemsTableColumn[];
  footerTotals?: Record<string, number>;
  footerLabel?: React.ReactNode;
  /** Склад для фільтра «Рухи по партії» (release / списання тощо). */
  movementsStorageId?: string | null;
}

function compareValues(a: any, b: any, numeric = false) {
  if (numeric) return (Number(a) || 0) - (Number(b) || 0);
  return String(a || '').localeCompare(String(b || ''), 'uk');
}

function historyBatchLabels(item: HistoryItemNormalized): string[] {
  if (Array.isArray(item.batches) && item.batches.length > 0) {
    return item.batches.map((label) => String(label).trim()).filter(Boolean);
  }
  const text = String(item.batch ?? '').trim();
  if (!text) return [];
  return text.split(/\n|,\s+/).map((label) => label.trim()).filter(Boolean);
}

function HistoryBatchMovementsTrigger({
  label,
  sku,
  productName,
  batchId,
  storageId,
}: {
  label: string;
  sku: string;
  productName: string | null;
  batchId: string;
  storageId?: string | null;
}) {
  const movementsDrawer = useProductMovementsDrawerOptional();
  const canOpen = Boolean(movementsDrawer && sku.trim() && batchId.trim());

  if (!canOpen) {
    return <span>{label}</span>;
  }

  return (
    <button
      type="button"
      className="text-left text-primary-600 hover:text-primary-800 hover:underline underline-offset-2 font-mono text-[13px]"
      title="Рухи товару по партії"
      onClick={(event) => {
        event.stopPropagation();
        movementsDrawer?.open({
          sku: sku.trim(),
          productName: productName?.trim() || undefined,
          goodPartId: batchId.trim(),
          batchLabel: label.trim(),
          storageId: storageId?.trim() || undefined,
          autoGenerate: true,
        });
      }}
    >
      {label}
    </button>
  );
}

function resolveBatchLinks(item: HistoryItemNormalized): HistoryBatchLink[] {
  if (Array.isArray(item.batchLinks) && item.batchLinks.length > 0) {
    return item.batchLinks;
  }
  const labels = historyBatchLabels(item);
  const batchId = String(item.batchId ?? '').trim();
  if (labels.length === 1 && batchId) {
    return [{ label: labels[0], batchId }];
  }
  return [];
}

function HistoryBatchList({
  item,
  movementsStorageId,
}: {
  item: HistoryItemNormalized;
  movementsStorageId?: string | null;
}) {
  const links = resolveBatchLinks(item);
  if (links.length === 0) {
    const labels = historyBatchLabels(item);
    if (labels.length === 0) return <>—</>;
    if (labels.length === 1) return <>{labels[0]}</>;
    return (
      <ul className="m-0 list-disc space-y-0.5 pl-4">
        {labels.map((label, index) => (
          <li key={`${label}-${index}`}>{label}</li>
        ))}
      </ul>
    );
  }

  if (links.length === 1) {
    return (
      <HistoryBatchMovementsTrigger
        label={links[0].label}
        sku={item.sku}
        productName={item.name}
        batchId={links[0].batchId}
        storageId={movementsStorageId}
      />
    );
  }

  return (
    <ul className="m-0 list-disc space-y-0.5 pl-4">
      {links.map((link, index) => (
        <li key={`${link.batchId}-${index}`}>
          <HistoryBatchMovementsTrigger
            label={link.label}
            sku={item.sku}
            productName={item.name}
            batchId={link.batchId}
            storageId={movementsStorageId}
          />
        </li>
      ))}
    </ul>
  );
}

const defaultColumns: HistoryItemsTableColumn[] = [
  {
    key: 'sku',
    label: 'SKU',
    sortValue: (item) => item.sku,
    sortType: 'text',
    className: 'font-mono',
  },
  {
    key: 'name',
    label: 'Позиція',
    sortValue: (item) => item.name || item.sku,
    sortType: 'text',
  },
  {
    key: 'batch',
    label: 'Партія',
    sortValue: (item) => item.batch || '',
    sortType: 'text',
  },
  {
    key: 'qty',
    label: 'Кількість',
    render: (item) => item.qty,
    sortValue: (item) => item.qty,
    sortType: 'number',
    className: 'font-semibold text-center',
    headerClassName: 'text-center',
    align: 'center',
  },
];

export const HistoryItemsTable: React.FC<Props> = ({
  title = 'Товари',
  mode = 'normal',
  items = [],
  sets = [],
  className,
  hideHeader = false,
  columns,
  footerTotals,
  footerLabel = 'Всього:',
  movementsStorageId = null,
}) => {
  const [sortBy, setSortBy] = useState<string | null>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const normalizedItems: HistoryItemNormalized[] = useMemo(() => {
    if (!items) return [];
    if (items.length > 0 && items[0] && ('qty' in items[0] || 'sku' in items[0])) return items as HistoryItemNormalized[];
    return clientNormalizeItems(items);
  }, [items]);

  const normalizedSets: HistorySetNormalized[] = useMemo(() => {
    const base = !sets || sets.length === 0
      ? []
      : (sets[0] && 'components' in sets[0] ? sets as HistorySetNormalized[] : clientNormalizeSets(sets));
    return base.map((setItem) => ({
      ...setItem,
      components: setItem.components.map((component) => (
        component.batch ? component : clientNormalizeItems([component.raw ?? component])[0] ?? component
      )),
    }));
  }, [sets]);

  const tableColumns = useMemo(() => {
    const base = columns && columns.length > 0 ? columns : defaultColumns;
    return base.map((column) => {
      if (column.key !== 'batch' || column.render) return column;
      return {
        ...column,
        render: (item: HistoryItemNormalized) => (
          <HistoryBatchList item={item} movementsStorageId={movementsStorageId} />
        ),
      };
    });
  }, [columns, movementsStorageId]);

  const getColumnValue = (item: HistoryItemNormalized, column: HistoryItemsTableColumn) => {
    if (column.sortValue) return column.sortValue(item);
    return item[column.key as keyof HistoryItemNormalized] as any;
  };

  const toggleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(key);
    setSortDir('asc');
  };

  const sortedItems = useMemo(() => {
    if (!sortBy) return normalizedItems;
    const column = tableColumns.find((itemColumn) => itemColumn.key === sortBy);
    const numeric = column?.sortType === 'number' || sortBy === 'qty';
    const copy = [...normalizedItems];
    copy.sort((a, b) => compareValues(getColumnValue(a, column ?? defaultColumns[0]), getColumnValue(b, column ?? defaultColumns[0]), numeric));
    if (sortDir === 'desc') copy.reverse();
    return copy;
  }, [normalizedItems, sortBy, sortDir, tableColumns]);

  const sortedSets = useMemo(() => {
    if (!sortBy) return normalizedSets;
    const column = tableColumns.find((itemColumn) => itemColumn.key === sortBy);
    const numeric = column?.sortType === 'number' || sortBy === 'qty' || sortBy === 'setQty';
    return normalizedSets.map((setItem) => {
      const components = [...setItem.components];
      components.sort((a, b) => compareValues(getColumnValue(a, column ?? defaultColumns[0]), getColumnValue(b, column ?? defaultColumns[0]), numeric));
      if (sortDir === 'desc') components.reverse();
      return { ...setItem, components };
    });
  }, [normalizedSets, sortBy, sortDir, tableColumns]);

  const renderHeaderCell = (column: HistoryItemsTableColumn) => {
    const sortable = Boolean(column.sortValue || column.sortType || defaultColumns.some((defaultColumn) => defaultColumn.key === column.key));
    const isActive = sortBy === column.key;
    const iconName = !isActive ? 'arrow-up-down' : (sortDir === 'asc' ? 'arrow-up' : 'arrow-down');
    const justifyClass = column.align === 'center' ? 'justify-center' : column.align === 'right' ? 'justify-end' : 'justify-start';

    return (
      <th
        key={column.key}
        onClick={sortable ? () => toggleSort(column.key) : undefined}
        className={`${sortable ? 'cursor-pointer' : ''} ${column.headerClassName ?? ''}`}
      >
        <div className={`flex items-center gap-1 ${justifyClass}`}>
          <span>{column.label}</span>
          {sortable && <DynamicIcon name={iconName} className={`inline w-3 h-3 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />}
        </div>
      </th>
    );
  };

  const renderFooter = (totals: Record<string, number>) => {
    if (tableColumns.length === 0) return null;

    return tableColumns.map((column, index) => {
      if (index === 0) {
        return (
          <td key={`${column.key}-footer-label`}>
            {footerLabel}
          </td>
        );
      }

      if (Object.prototype.hasOwnProperty.call(totals, column.key)) {
        return (
          <td key={`${column.key}-footer-total`} className={column.className}>
            {totals[column.key]}
          </td>
        );
      }

      return <td key={`${column.key}-footer-empty`} />;
    });
  };

  if (mode === 'sets') {
    return (
      <div className="flex flex-col gap-6">
        {sortedSets.map((setItem, idx) => {
          const kitBatch = setItem.raw?.kit_output_batch ?? setItem.raw?.kitOutputBatch;
          const kitBatchNumber = String(kitBatch?.batchNumber ?? '').trim();
          const kitBatchId = String(kitBatch?.batchId ?? '').trim();
          return (
          <div key={`set-${idx}`} className={`overflow-x-auto px-1 pb-1 bg-gray-200 rounded-md ${className ?? ''}`}>
            <div className="flex items-center gap-2 px-2 py-2">
              <span className="rounded bg-amber-200/80 px-1 py-0 text-sm ring-1 ring-amber-700/30">{setItem.setSku}</span>
              <h4 className="text-md font-medium text-gray-700">
                {setItem.setName}
                <span className="mx-2 text-xs">✕</span>
                <span>{setItem.setQty} шт.</span>
              </h4>
              {kitBatchNumber ? (
                <span className="text-sm font-medium text-gray-600 ml-auto">
                  Партія набору:{' '}
                  <span className="rounded bg-fuchsia-200/80 px-1.5 py-0.5 text-sm leading-snug ring-1 ring-fuchsia-800/25 font-mono text-gray-800">
                    {kitBatchId ? (
                      <HistoryBatchMovementsTrigger
                        label={kitBatchNumber}
                        sku={setItem.setSku}
                        productName={setItem.setName}
                        batchId={kitBatchId}
                        storageId={movementsStorageId}
                      />
                    ) : (
                      kitBatchNumber
                    )}
                  </span>
                </span>
              ) : null}
            </div>
            <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md bg-white text-sm">
              {!hideHeader && (
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-100 [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold [&>th]:text-gray-600">
                    {tableColumns.map(renderHeaderCell)}
                  </tr>
                </thead>
              )}
              <tbody>
                {setItem.components.map((component, compIdx) => (
                  <tr key={`set-${idx}-comp-${compIdx}`} className="[&>td]:border-b [&>td]:border-b-gray-100 [&>td]:px-3 [&>td]:py-2 text-gray-700">
                    {tableColumns.map((column) => (
                      <td key={`${column.key}-${compIdx}`} className={column.className}>
                        {column.render ? column.render(component) : (component[column.key as keyof HistoryItemNormalized] as React.ReactNode)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-gray-50 [&>td]:px-3 [&>td]:py-2 [&>td]:font-semibold">
                  {renderFooter(footerTotals ?? { qty: setItem.componentsTotal })}
                </tr>
              </tbody>
            </table>
          </div>
          );
        })}
      </div>
    );
  }

  const totalQty = sortedItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const effectiveFooterTotals = footerTotals ?? { qty: totalQty };

  return (
    <div className={`overflow-x-auto rounded-md bg-gray-200 px-1 pb-1 ${className ?? ''}`}>
      {!hideHeader && (
        <div className="flex items-center justify-between gap-2 rounded-t-md border-1 border-b-0 border-gray-200 px-3 py-2">
          <h4 className="text-md font-medium text-gray-700">
            {title} <span className="text-sm font-normal text-gray-500">({items.length})</span>
          </h4>
        </div>
      )}
      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md border-1 border-gray-200 bg-white text-sm">
        {!hideHeader && (
          <thead>
            <tr className="border-b border-gray-200 bg-gray-100 [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold [&>th]:text-gray-600">
              {tableColumns.map(renderHeaderCell)}
            </tr>
          </thead>
        )}
        <tbody>
          {sortedItems.map((item, idx) => (
            <tr key={idx} className="[&>td]:border-b [&>td]:border-b-gray-100 [&>td]:px-3 [&>td]:py-2 text-gray-700">
              {tableColumns.map((column) => (
                <td key={`${column.key}-${idx}`} className={column.className}>
                  {column.render ? column.render(item) : (item[column.key as keyof HistoryItemNormalized] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="bg-gray-100/80 [&>td]:px-3 [&>td]:py-2 [&>td]:font-semibold">
            {renderFooter(effectiveFooterTotals)}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default HistoryItemsTable;
