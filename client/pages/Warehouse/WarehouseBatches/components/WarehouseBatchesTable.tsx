import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
  type SortDescriptor,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { StockBadge } from '@/components/StockBadge';
import { formatDateOnly } from '@/lib/formatUtils';
import { HR_TABLE_CLASS_NAMES } from '@/pages/Hr/hrUi';
import type { WarehouseBatchListItem } from '../WarehouseBatchesTypes';
import {
  loadWarehouseBatchesColumnOrder,
  saveWarehouseBatchesColumnOrder,
  sortWarehouseBatches,
  toColumnDefs,
  WAREHOUSE_BATCHES_DEFAULT_SORT,
  type WarehouseBatchesColumnDef,
  type WarehouseBatchesColumnKey,
} from '../warehouseBatchesColumns';

interface WarehouseBatchesTableProps {
  items: WarehouseBatchListItem[];
  loading: boolean;
  columnReorderEnabled: boolean;
  onProductOpen: (productId: string) => void;
}

/** Runtime column shape for HeroUI collection — includes UI flags that must trigger header refresh. */
interface WarehouseBatchesTableColumn extends WarehouseBatchesColumnDef {
  reorderEnabled: boolean;
}

function formatBatchDate(value: string | null): string {
  if (!value) return '—';
  const formatted = formatDateOnly(value);
  return formatted === '-' ? '—' : formatted;
}

function formatBarcodeDate(value: string | null): string {
  if (!value) return '—';
  const formatted = formatDateOnly(value);
  return formatted === '-' ? '—' : formatted;
}

function BarcodeCell({ item }: { item: WarehouseBatchListItem }) {
  if (item.barcodeCount <= 0) {
    return <span className="text-default-400">—</span>;
  }

  const latestCode = item.lastBarcode ?? item.barcodes[0]?.code ?? null;
  if (!latestCode) {
    return <span className="text-sm text-default-700">{item.barcodeCount} шт.</span>;
  }

  const extraCount = Math.max(item.barcodeCount - 1, 0);
  const label = extraCount > 0
    ? `${latestCode} +${extraCount}`
    : latestCode;

  const content = (
    <>
      <span className="font-mono text-sm">{label}</span>
      {item.lastBarcodeRegisteredAt ? (
        <span className="block text-xs text-default-400">
          {formatBarcodeDate(item.lastBarcodeRegisteredAt)}
        </span>
      ) : null}
    </>
  );

  if (extraCount === 0) {
    return (
      <div className="max-w-full truncate text-left text-sm text-default-700" title={latestCode}>
        {content}
      </div>
    );
  }

  const tooltipContent = (
    <div className="flex max-w-sm flex-col gap-1.5 py-1">
      {item.barcodes.map((barcode) => (
        <div key={barcode.code} className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-sm">{barcode.code}</span>
          <span className="text-xs text-default-400 whitespace-nowrap">
            {formatBarcodeDate(barcode.registeredAt)}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <Tooltip content={tooltipContent} placement="left" delay={200} closeDelay={0}>
      <button
        type="button"
        className="max-w-full truncate text-left text-sm text-primary-600 underline-offset-2 hover:underline"
        title={latestCode}
      >
        {content}
      </button>
    </Tooltip>
  );
}

function StockQtyCell({ quantity }: { quantity: number }) {
  return (
    <span className={`text-sm font-semibold tabular-nums ${quantity < 0 ? 'text-danger' : ''}`}>
      {quantity}
    </span>
  );
}

function ColumnTitle({ column }: { column: WarehouseBatchesColumnDef }) {
  if (column.key === 'stockGp') {
    return (
      <span className="inline-flex items-center gap-1">
        Залишки
        <StockBadge variant="gp" size="9px" />
      </span>
    );
  }

  if (column.key === 'stockMs') {
    return (
      <span className="inline-flex items-center gap-1">
        Залишки
        <StockBadge variant="ms" size="9px" />
      </span>
    );
  }

  return <span>{column.label}</span>;
}

function ProductCell({
  item,
  onOpen,
}: {
  item: WarehouseBatchListItem;
  onOpen: (productId: string) => void;
}) {
  return (
    <div className="flex min-w-48 flex-col gap-0.5">
      {item.productId ? (
        <button
          type="button"
          className="max-w-xs truncate text-left text-sm text-primary-600 underline-offset-2 hover:text-primary-700 hover:underline"
          title={item.productName}
          onClick={() => onOpen(item.productId)}
        >
          {item.productName}
        </button>
      ) : (
        <span className="text-sm text-default-900">{item.productName}</span>
      )}
      {item.sku ? (
        <span className="text-xs text-default-500">{item.sku}</span>
      ) : null}
    </div>
  );
}

function renderCell(
  item: WarehouseBatchListItem,
  columnKey: WarehouseBatchesColumnKey,
  onProductOpen: (productId: string) => void,
) {
  switch (columnKey) {
    case 'batchNumber':
      return (
        <span className="font-mono text-sm whitespace-nowrap">{item.batchNumber}</span>
      );
    case 'product':
      return <ProductCell item={item} onOpen={onProductOpen} />;
    case 'barcodes':
      return <BarcodeCell item={item} />;
    case 'createdAt':
      return (
        <span className="text-sm whitespace-nowrap">{formatBatchDate(item.createdAt)}</span>
      );
    case 'expiration':
      return (
        <span className="text-sm whitespace-nowrap">{formatBatchDate(item.expiration)}</span>
      );
    case 'stockGp':
      return <StockQtyCell quantity={item.quantityGp} />;
    case 'stockMs':
      return <StockQtyCell quantity={item.quantityMs} />;
    default:
      return null;
  }
}

function getSortIconName(
  columnKey: WarehouseBatchesColumnKey,
  sortDescriptor: SortDescriptor,
): 'arrow-up-down' | 'arrow-up' | 'arrow-down' {
  if (String(sortDescriptor.column) !== columnKey) return 'arrow-up-down';
  return sortDescriptor.direction === 'ascending' ? 'arrow-up' : 'arrow-down';
}

function ColumnHeader({
  column,
  reorderEnabled,
  isDragTarget,
  sortDescriptor,
  onSort,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  column: WarehouseBatchesColumnDef;
  reorderEnabled: boolean;
  isDragTarget: boolean;
  sortDescriptor: SortDescriptor;
  onSort: (key: WarehouseBatchesColumnKey) => void;
  onDragStart: (event: DragEvent<HTMLSpanElement>, key: WarehouseBatchesColumnKey) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, key: WarehouseBatchesColumnKey) => void;
  onDragEnd: () => void;
}) {
  const isSorted = String(sortDescriptor.column) === column.key;
  const sortable = Boolean(column.allowsSorting);
  const alignEnd = column.align === 'end';

  return (
    <div
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, column.key)}
      className={`flex items-center gap-1 rounded-md transition-colors ${
        alignEnd ? 'justify-end' : ''
      } ${isDragTarget ? 'bg-primary-50 ring-1 ring-primary-200' : ''}`}
    >
      {reorderEnabled ? (
        <span
          draggable
          onDragStart={(event) => onDragStart(event, column.key)}
          onDragEnd={onDragEnd}
          className="inline-flex shrink-0 cursor-grab text-default-300 active:cursor-grabbing"
          aria-hidden="true"
        >
          <DynamicIcon name="grip-vertical" size={14} />
        </span>
      ) : null}
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort(column.key)}
          className={`inline-flex min-w-0 items-center gap-1.5 text-left ${
            alignEnd ? 'justify-end' : ''
          }`}
          aria-label={`Сортувати за «${column.label}»`}
          aria-sort={
            isSorted
              ? (sortDescriptor.direction === 'ascending' ? 'ascending' : 'descending')
              : 'none'
          }
        >
          <ColumnTitle column={column} />
          <DynamicIcon
            name={getSortIconName(column.key, sortDescriptor)}
            size={14}
            className={`shrink-0 ${isSorted ? 'text-default-600' : 'text-default-300'}`}
          />
        </button>
      ) : (
        <ColumnTitle column={column} />
      )}
    </div>
  );
}

export function WarehouseBatchesTable({
  items,
  loading,
  columnReorderEnabled,
  onProductOpen,
}: WarehouseBatchesTableProps) {
  const [columnOrder, setColumnOrder] = useState(loadWarehouseBatchesColumnOrder);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>(WAREHOUSE_BATCHES_DEFAULT_SORT);
  const [draggingKey, setDraggingKey] = useState<WarehouseBatchesColumnKey | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<WarehouseBatchesColumnKey | null>(null);

  useEffect(() => {
    saveWarehouseBatchesColumnOrder(columnOrder);
  }, [columnOrder]);

  const columns = useMemo<WarehouseBatchesTableColumn[]>(
    () => toColumnDefs(columnOrder).map((column) => ({
      ...column,
      reorderEnabled: columnReorderEnabled,
    })),
    [columnOrder, columnReorderEnabled],
  );

  const sortedItems = useMemo(
    () => sortWarehouseBatches(items, sortDescriptor),
    [items, sortDescriptor],
  );

  const reorderColumns = useCallback((sourceKey: WarehouseBatchesColumnKey, targetKey: WarehouseBatchesColumnKey) => {
    if (sourceKey === targetKey) return;
    setColumnOrder((current) => {
      const sourceIndex = current.indexOf(sourceKey);
      const targetIndex = current.indexOf(targetKey);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return current;
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const handleSort = useCallback((key: WarehouseBatchesColumnKey) => {
    setSortDescriptor((current) => {
      if (current.column === key) {
        return {
          column: key,
          direction: current.direction === 'ascending' ? 'descending' : 'ascending',
        };
      }
      return { column: key, direction: 'ascending' };
    });
  }, []);

  const handleDragStart = useCallback((
    event: DragEvent<HTMLSpanElement>,
    key: WarehouseBatchesColumnKey,
  ) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
    setDraggingKey(key);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((
    event: DragEvent<HTMLDivElement>,
    targetKey: WarehouseBatchesColumnKey,
  ) => {
    event.preventDefault();
    const sourceKey = event.dataTransfer.getData('text/plain') as WarehouseBatchesColumnKey;
    if (sourceKey) reorderColumns(sourceKey, targetKey);
    setDraggingKey(null);
    setDropTargetKey(null);
  }, [reorderColumns]);

  const handleDragEnd = useCallback(() => {
    setDraggingKey(null);
    setDropTargetKey(null);
  }, []);

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" label="Завантаження партій…" />
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-default-500">
        <p className="text-sm">Партій не знайдено</p>
      </div>
    );
  }

  return (
    <Table
      aria-label="Список партій"
      removeWrapper
      classNames={HR_TABLE_CLASS_NAMES}
    >
      <TableHeader>
        {columns.map((column) => (
          <TableColumn
            key={column.key}
            width={column.width}
            align={column.align}
          >
            <ColumnHeader
              column={column}
              reorderEnabled={column.reorderEnabled}
              isDragTarget={dropTargetKey === column.key && draggingKey !== column.key}
              sortDescriptor={sortDescriptor}
              onSort={handleSort}
              onDragStart={handleDragStart}
              onDragOver={(event) => {
                handleDragOver(event);
                setDropTargetKey(column.key);
              }}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          </TableColumn>
        ))}
      </TableHeader>
      <TableBody
        items={sortedItems}
        isLoading={loading}
        loadingContent={<Spinner label="Оновлення…" />}
      >
        {(item) => (
          <TableRow key={item.batchId}>
            {columns.map((column) => (
              <TableCell key={column.key}>
                {renderCell(item, column.key, onProductOpen)}
              </TableCell>
            ))}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
