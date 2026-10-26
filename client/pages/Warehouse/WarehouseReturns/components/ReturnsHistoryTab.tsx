import { Button, Pagination, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ReturnsHistoryTable } from './ReturnsHistoryTable';
import type { ReturnHistoryRecord } from '../WarehouseReturnsTypes';
import type { WarehouseDocHistoryFilters } from '@shared/utils/warehouseDocHistoryListQuery';
import type { WarehouseDocHistoryPagination } from '../../shared/warehouseDocHistoryTypes';
import {
  DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS,
  WarehouseDocHistoryResetFiltersButton,
  WarehouseDocHistorySortSelect,
} from '../../shared/WarehouseDocHistoryToolbarFilters';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

interface ReturnsHistoryTabProps {
  records: ReturnHistoryRecord[];
  loading: boolean;
  onRefresh: () => void;
  onLoadRecord?: (record: ReturnHistoryRecord) => Promise<void>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
  pagination?: WarehouseDocHistoryPagination;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  historyFilters?: WarehouseDocHistoryFilters;
  onHistoryFiltersChange?: (filters: WarehouseDocHistoryFilters) => void;
  showHistoryFilters?: boolean;
}

export const ReturnsHistoryTab = ({
  records,
  loading,
  onRefresh,
  onLoadRecord,
  onDeleteRecord,
  pagination,
  onPageChange,
  onLimitChange,
  historyFilters,
  onHistoryFiltersChange,
  showHistoryFilters = false,
}: ReturnsHistoryTabProps) => {
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
          Минулі повернення {total > 0 && `(${total})`}
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

      {loading ? (
        <div className="text-center py-8 text-gray-400">
          <DynamicIcon name="loader-2" className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
          <p className="text-sm">Завантаження...</p>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <DynamicIcon name="clipboard-x" className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Немає завершених повернень</p>
          <Button size="sm" variant="flat" className="mt-3" onPress={onRefresh}>
            Завантажити
          </Button>
        </div>
      ) : (
        <ReturnsHistoryTable
          records={records}
          onLoadRecord={onLoadRecord}
          onDeleteRecord={onDeleteRecord}
        />
      )}

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
                if (Number.isFinite(value) && onLimitChange) {
                  onLimitChange(value);
                }
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={String(option)} textValue={`${option} / стор.`}>
                  {option} / стор.
                </SelectItem>
              ))}
            </Select>
            {pages > 1 && onPageChange && (
              <Pagination
                total={pages}
                page={page}
                onChange={onPageChange}
                showControls
                size="sm"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
};
