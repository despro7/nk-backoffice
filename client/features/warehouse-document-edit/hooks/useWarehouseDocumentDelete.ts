import { useCallback, useState } from 'react';
import { ToastService } from '@/services/ToastService';

export type DeletableWarehouseDocumentKind =
  | 'goodMoving'
  | 'writeOff'
  | 'surplus'
  | 'release'
  | 'saleReturn';

const DELETE_PATH: Record<DeletableWarehouseDocumentKind, (id: number) => string> = {
  goodMoving: (id) => `/api/warehouse/${id}`,
  writeOff: (id) => `/api/warehouse/writeoff/history/${id}`,
  surplus: (id) => `/api/warehouse/surplus/history/${id}`,
  release: (id) => `/api/warehouse/releases/${id}`,
  saleReturn: (id) => `/api/warehouse/returns/history/${id}`,
};

interface DeleteResponse {
  success?: boolean;
  error?: string;
  message?: string;
  canDeleteLocal?: boolean;
  /** Returns controller uses this flag instead of canDeleteLocal. */
  canForceDelete?: boolean;
}

interface UseWarehouseDocumentDeleteOptions {
  kind: DeletableWarehouseDocumentKind;
  localId: number | null | undefined;
  /** Викликається після успішного видалення (закрити drawer, оновити звіт). */
  onDeleted?: () => void;
}

export function useWarehouseDocumentDelete({
  kind,
  localId,
  onDeleted,
}: UseWarehouseDocumentDeleteOptions) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [forceLocalPending, setForceLocalPending] = useState(false);

  const canDelete = typeof localId === 'number' && Number.isFinite(localId) && localId > 0;

  const run = useCallback(
    async (forceLocal: boolean) => {
      if (!canDelete) return;
      setIsDeleting(true);
      try {
        const url = `${DELETE_PATH[kind](localId as number)}${forceLocal ? '?forceLocal=true' : ''}`;
        const resp = await fetch(url, { method: 'DELETE', credentials: 'include' });
        const json: DeleteResponse = await resp.json().catch(() => ({}));

        if (resp.ok && json.success !== false) {
          setForceLocalPending(false);
          ToastService.show({
            title: forceLocal ? 'Локальний запис видалено' : 'Документ видалено',
            color: 'success',
          });
          onDeleted?.();
          return;
        }

        if (!forceLocal && (json.canDeleteLocal || json.canForceDelete)) {
          setForceLocalPending(true);
          return;
        }

        throw new Error(json.message || json.error || `HTTP ${resp.status}`);
      } catch (err) {
        setForceLocalPending(false);
        ToastService.show({
          title: 'Не вдалося видалити документ',
          description: err instanceof Error ? err.message : undefined,
          color: 'danger',
        });
      } finally {
        setIsDeleting(false);
      }
    },
    [canDelete, kind, localId, onDeleted],
  );

  return {
    canDelete,
    isDeleting,
    forceLocalPending,
    deleteDocument: () => run(false),
    deleteLocalOnly: () => run(true),
    cancelForceLocal: () => setForceLocalPending(false),
  };
}
