import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Pagination, Select, SelectItem } from '@heroui/react';
import HistoryAccordionItem from '../../shared/HistoryAccordionItem';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useDebug } from '@/contexts/debug-context';
import { useState } from 'react';
import { canEditWarehouseReleaseHistory } from '@shared/utils/releaseHistoryAccess';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import type { ReleaseHistoryPagination } from '../useReleaseSets';

function DebugDilovodCheck({ mapped, onRefresh }: { mapped: any[]; onRefresh?: () => void }) {
  const [results, setResults] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setBusy(true);
    setResults(null);
    setOpen(true);
    try {
      const toCheck = mapped.filter((item) => item.dilovodDocId).map((item) => ({ id: Number(item.id), dilovodDocId: item.dilovodDocId }));
      const resp = await fetch('/api/warehouse/releases/check-dilovod-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: toCheck }),
      });
      const json = await resp.json().catch(() => ({ success: false }));
      if (resp.ok && json && json.success) {
        setResults(json.results || []);
      } else {
        setResults([{ id: 'batch', success: false, error: json.error || `HTTP ${resp.status}` }]);
      }
    } catch (error) {
      setResults([{ id: 'batch', success: false, error: String(error) }]);
    } finally {
      setBusy(false);
      onRefresh && onRefresh();
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="flat"
        color="warning"
        className="bg-yellow-200 text-yellow-900 hover:opacity-90"
        onPress={run}
        startContent={<DynamicIcon name="refresh-cw" className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />}
      >
        Перевірити Dilovod (debug)
      </Button>

      <Modal isOpen={open} scrollBehavior="inside" onClose={() => setOpen(false)} size="3xl" className="max-h-[60vh]" isDismissable={!busy}>
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 text-lg font-semibold pr-10">
            <span>Результати перевірки Dilovod</span>
            {results && (
              <span className="ml-auto text-sm text-gray-500">{results.length} записів</span>
            )}
          </ModalHeader>
          <ModalBody className="space-y-2">
            {busy && <div className="text-sm text-gray-500">Виконується перевірка...</div>}
            {!busy && results && results.length === 0 && <div className="text-sm text-gray-500">Результатів немає.</div>}
            {!busy && results && (
              <ul className="text-sm">
                {results.map((result: any, index: number) => (
                  <li key={index} className="flex items-start justify-between gap-3 py-2 border-b border-gray-100">
                    <div className="flex-1">
                      <div className="font-medium">Випуск №{result.id}</div>
                    </div>
                    <div className="text-xs text-right text-gray-400 font-mono pt-1">{String(result.dilovodDocId)}</div>
                  </li>
                ))}
              </ul>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => { setOpen(false); setResults(null); }}>
              Закрити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

interface Props {
  records: any[];
  loading?: boolean;
  pagination?: ReleaseHistoryPagination;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onRefresh?: () => void;
  onDelete?: (id: number) => void;
  onEdit?: (record: any) => void;
  onRetryRelease?: (id: number) => Promise<void>;
  title?: string;
  emptyMessage?: string;
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

export default function ReleaseHistoryTab({
  records = [],
  loading,
  pagination,
  onPageChange,
  onLimitChange,
  onRefresh,
  onDelete,
  onEdit,
  onRetryRelease,
  title = 'Минулі операції',
  emptyMessage = 'Немає записів',
}: Props) {
  const { isDebugMode } = useDebug();
  const { isAdmin, user } = useRoleAccess();
  const [auditRefreshKey] = useState(0);

  const mapped = records.map((record: any) => {
    const items = Array.isArray(record.items) && record.items.length > 0
      ? record.items
      : [{ sku: record.setSku || '', quantity: Number(record.quantity ?? record.qty ?? 0) }];

    const firstItem = Array.isArray(record.items) && record.items[0] && typeof record.items[0] === 'object'
      ? record.items[0] as {
        dilovod_send_error?: unknown;
        correction_session_id?: unknown;
      }
      : null;

    return {
      id: String(record.id),
      createdAt: record.createdAt || record.created_at,
      operDate: record.operDate || record.oper_date || record.createdAt || record.created_at,
      createdBy: record.createdBy || record.created_by,
      firmId: record.firmId || record.firm_id,
      storageId: record.storageId || record.payload?.storage,
      comment: record.comment,
      dilovodDocId: record.dilovodDocId || record.dilovod_doc_id || null,
      operationType: record.operationType || record.operation_type || null,
      correctionSessionId: firstItem?.correction_session_id
        ? String(firstItem.correction_session_id).trim() || null
        : null,
      internalDocNumber: record.internalDocNumber || record.internal_doc_number || null,
      status: record.status || null,
      sendError: firstItem?.dilovod_send_error ?? null,
      quantity: Number(record.quantity ?? 0),
      setSku: record.setSku || record.set_sku || null,
      setsNormalized: record.setsNormalized,
      items,
    };
  });

  const handleDeleteRecord = async (id: string) => {
    if (!onDelete) return;
    const numeric = Number(id);
    await onDelete(Number.isNaN(numeric) ? id as any : numeric);
  };

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
          {title} {total > 0 && `(${total})`}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {isDebugMode && <DebugDilovodCheck mapped={mapped} onRefresh={onRefresh} />}
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
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Завантаження...</div>
      ) : mapped.length === 0 ? (
        <div className="text-sm text-gray-500">{emptyMessage}</div>
      ) : (
        <HistoryAccordionItem
          records={mapped}
          recordType="releaseSet"
          showEdit={Boolean(onEdit)}
          auditRefreshKey={auditRefreshKey}
          canEditRecord={(record) => canEditWarehouseReleaseHistory({
            isAdmin: isAdmin(),
            createdAt: record.createdAt || record.created_at,
            createdBy: record.createdBy ?? record.created_by,
            currentUserId: user?.id,
          })}
          onEditRecord={onEdit ? async (record) => {
            onEdit(record);
          } : undefined}
          onDeleteRecord={handleDeleteRecord}
          onRetryRelease={onRetryRelease ? async (record) => {
            const numeric = Number(record.id);
            if (!Number.isFinite(numeric) || numeric <= 0) return;
            await onRetryRelease(numeric);
          } : undefined}
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
}
