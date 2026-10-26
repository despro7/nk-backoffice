import { Button, Pagination, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useMemo } from 'react';
import HistoryAccordionItem from '../../shared/HistoryAccordionItem';
import { WarehouseHistoryTabBody } from '../../shared/WarehouseHistoryTabBody';
import { normalizeItemsArray } from '../../shared/historyNormalize';
import type { MovementV2HistoryPagination } from '../types';
import type { WarehouseDocHistoryFilters } from '@shared/utils/warehouseDocHistoryListQuery';
import {
  DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS,
  WarehouseDocHistoryResetFiltersButton,
  WarehouseDocHistorySortSelect,
} from '../../shared/WarehouseDocHistoryToolbarFilters';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

interface Props {
  records: any[];
  loading?: boolean;
  pagination?: MovementV2HistoryPagination;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onRefresh?: () => void;
  onLoadRecord?: (record: any) => Promise<void>;
  detailsLoading?: Record<string, boolean>;
  onEdit?: (record: any) => void;
  title?: string;
  emptyMessage?: string;
  variant?: 'movement' | 'archive';
  historyFilters?: WarehouseDocHistoryFilters;
  onHistoryFiltersChange?: (filters: WarehouseDocHistoryFilters) => void;
  showHistoryFilters?: boolean;
}

function mapMovementHistoryRecord(record: any) {
  const serverNormalized = Array.isArray(record.itemsNormalized) ? record.itemsNormalized : null;
  let rawItems: unknown = record.items;
  if (typeof rawItems === 'string') {
    try {
      rawItems = JSON.parse(rawItems);
    } catch {
      rawItems = [];
    }
  }
  const fromRaw = normalizeItemsArray(rawItems);
  const itemsNormalized = fromRaw.length > 0 ? fromRaw : (serverNormalized ?? []);

  return {
    id: String(record.id),
    createdAt: record.createdAt || record.created_at,
    movementDate: record.movementDate || record.movement_date,
    createdBy: record.createdBy || record.created_by,
    sourceWarehouse: record.sourceWarehouse || record.source_warehouse,
    destinationWarehouse: record.destinationWarehouse || record.destination_warehouse,
    internalDocNumber: record.internalDocNumber || record.internal_doc_number || record.docNumber || null,
    dilovodDocId: record.dilovodDocId || record.dilovod_doc_id || null,
    status: record.status || null,
    comment: record.notes || record.comment || null,
    items: Array.isArray(rawItems) ? rawItems : itemsNormalized,
    itemsNormalized,
  };
}

export default function MovementV2HistoryTab({
  records = [],
  loading,
  pagination,
  onPageChange,
  onLimitChange,
  onRefresh,
  onLoadRecord,
  detailsLoading,
  onEdit,
  title = 'Історія переміщень',
  emptyMessage = 'Немає записів',
  variant = 'movement',
  historyFilters,
  onHistoryFiltersChange,
  showHistoryFilters = false,
}: Props) {
  const mapped = useMemo(
    () => records.map(mapMovementHistoryRecord),
    [records],
  );

  const total = pagination?.total ?? records.length;
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 10;
  const pages = pagination?.pages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  return (
    <>
      <div className="mb-4 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          {title} {total > 0 && `(${total})`}
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-2 flex-1">
          {showHistoryFilters && historyFilters && onHistoryFiltersChange ? (
            <WarehouseDocHistorySortSelect
              filters={historyFilters}
              onFiltersChange={onHistoryFiltersChange}
            />
          ) : null}
          <Button
            size="sm"
            variant="flat"
            color="secondary"
            className="bg-blue-200 text-blue-900 hover:opacity-90 shrink-0"
            onPress={onRefresh}
            startContent={<DynamicIcon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Оновити
          </Button>
          {showHistoryFilters && historyFilters && onHistoryFiltersChange ? (
            <WarehouseDocHistoryResetFiltersButton
              filters={historyFilters}
              onReset={() => onHistoryFiltersChange({ ...DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS })}
            />
          ) : null}
        </div>
      </div>

      <WarehouseHistoryTabBody
        loading={Boolean(loading)}
        records={mapped}
        emptyMessage={emptyMessage}
        onRetry={onRefresh}
      >
        <HistoryAccordionItem
          records={mapped}
          recordType="movement"
          showDelete={false}
          showEdit={variant !== 'archive' && Boolean(onEdit)}
          onEditRecord={onEdit ? async (record) => {
            onEdit(record);
          } : undefined}
          onLoadRecord={onLoadRecord}
          detailsLoading={detailsLoading}
        />
      </WarehouseHistoryTabBody>

      {total > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-600">
            Показано {rangeStart}–{rangeEnd} з {total}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Кількість на сторінку"
              size="sm"
              className="w-36"
              selectedKeys={new Set([String(limit)])}
              onSelectionChange={(keys) => {
                const value = Number(Array.from(keys)[0]);
                if (Number.isFinite(value) && onLimitChange) onLimitChange(value);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={String(option)} textValue={`${option} / стор.`}>
                  {option} / стор.
                </SelectItem>
              ))}
            </Select>
            {pages > 1 && onPageChange && (
              <Pagination total={pages} page={page} onChange={onPageChange} showControls size="sm" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
