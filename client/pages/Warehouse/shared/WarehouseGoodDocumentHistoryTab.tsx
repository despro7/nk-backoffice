import { Button, Pagination, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import HistoryAccordionItem from './HistoryAccordionItem';
import { WarehouseHistoryTabBody } from './WarehouseHistoryTabBody';
import type { ReturnHistoryRecord } from '../WarehouseReturns/WarehouseReturnsTypes';
import { canEditWarehouseReleaseHistory } from '@shared/utils/releaseHistoryAccess';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import type { WarehouseDocHistoryPagination } from './warehouseDocHistoryTypes';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

const DEFAULT_COPY: Record<
  'writeOff' | 'surplus',
  { title: string; emptyMessage: string }
> = {
  writeOff: {
    title: 'Минулі списання',
    emptyMessage: 'Немає завершених списань',
  },
  surplus: {
    title: 'Минулі оприбуткування',
    emptyMessage: 'Немає завершених оприбуткувань',
  },
};

interface WarehouseGoodDocumentHistoryTabProps {
  recordType: 'writeOff' | 'surplus';
  records: ReturnHistoryRecord[];
  loading: boolean;
  onRefresh: () => void;
  title?: string;
  emptyMessage?: string;
  pagination?: WarehouseDocHistoryPagination;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onEditRecord?: (record: ReturnHistoryRecord) => void | Promise<void>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
  onLoadRecord?: (record: ReturnHistoryRecord) => Promise<void>;
  detailsLoading?: Record<string, boolean>;
}

export function WarehouseGoodDocumentHistoryTab({
  recordType,
  records,
  loading,
  onRefresh,
  title,
  emptyMessage,
  pagination,
  onPageChange,
  onLimitChange,
  onEditRecord,
  onDeleteRecord,
  onLoadRecord,
  detailsLoading,
}: WarehouseGoodDocumentHistoryTabProps) {
  const { isAdmin, user } = useRoleAccess();
  const copy = DEFAULT_COPY[recordType];

  const total = pagination?.total ?? records.length;
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 10;
  const pages = pagination?.pages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          {title ?? copy.title} {total > 0 && `(${total})`}
        </h2>
        <Button
          size="sm"
          variant="flat"
          color="secondary"
          className="bg-blue-200 text-blue-900 hover:opacity-90"
          onPress={onRefresh}
          startContent={<DynamicIcon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
        >
          Оновити
        </Button>
      </div>

      <WarehouseHistoryTabBody
        loading={loading}
        records={records}
        emptyMessage={emptyMessage ?? copy.emptyMessage}
        onRetry={onRefresh}
      >
        <HistoryAccordionItem
          records={records}
          recordType={recordType}
          showEdit={Boolean(onEditRecord)}
          canEditRecord={(record) => canEditWarehouseReleaseHistory({
            isAdmin: isAdmin(),
            createdAt: record.createdAt || record.created_at,
            createdBy: record.createdBy ?? record.created_by,
            currentUserId: user?.id,
          })}
          onEditRecord={onEditRecord ? async (record) => { await onEditRecord(record); } : undefined}
          onDeleteRecord={onDeleteRecord}
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
}
