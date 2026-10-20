import { useCallback, useState } from 'react';
import { LoggingService } from '@/services/LoggingService';
import { ToastService } from '@/services/ToastService';
import type { DilovodMovementPayload } from '@shared/types/movement';
import type { UseWarehouseMovementReturn } from '../useWarehouseMovement';
import type { EmptyBatchInfo } from '../components/EmptyBatchesWarningModal';

interface UseMovementSendFlowOptions {
  onFinalized?: () => void | Promise<void>;
}

export function useMovementSendFlow(mov: UseWarehouseMovementReturn, options?: UseMovementSendFlowOptions) {
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<DilovodMovementPayload | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);
  const [isSendingToDilovod, setIsSendingToDilovod] = useState(false);
  const [emptyBatchesModal, setEmptyBatchesModal] = useState<{
    items: EmptyBatchInfo[];
    pendingAction: 'final';
  } | null>(null);

  const findEmptyBatches = useCallback((): EmptyBatchInfo[] => {
    return mov.products
      .filter((p) => mov.selectedProductIds.has(p.id))
      .flatMap((product) => {
        const emptyBatchIndices = product.details.batches
          .map((batch, idx) => (batch.boxes === 0 && batch.portions === 0 ? idx : -1))
          .filter((idx) => idx !== -1);
        return emptyBatchIndices.length > 0 ? [{ product, emptyBatchIndices }] : [];
      });
  }, [mov.products, mov.selectedProductIds]);

  const sendAndFinalize = useCallback(async (skipEmptyCheck = false) => {
    if (!skipEmptyCheck) {
      const empty = findEmptyBatches();
      if (empty.length > 0) {
        setEmptyBatchesModal({ items: empty, pendingAction: 'final' });
        return;
      }
    }

    let draft = mov.savedDraft;
    draft = await mov.handleSaveDraft();
    if (!draft) return;

    setIsSendingToDilovod(true);
    try {
      const response = await fetch('/api/warehouse/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          draftId: draft.id,
          summaryItems: mov.summaryItems,
          movementDate: mov.selectedDateTime.toISOString(),
          dryRun: false,
          isFinal: true,
          sourceWarehouse: mov.storage,
          destinationWarehouse: mov.storageTo,
        }),
      });
      const data = await response.json();
      if (data.success) {
        const docLabel = data.docNumber ?? data.dilovodDocId ?? '—';
        ToastService.show({
          title: 'Переміщення завершено!',
          description: `Документ ${docLabel} успішно відправлено та закрито`,
          color: 'success',
          hideIcon: false,
        });
        setShowPayloadPreview(false);
        await mov.handleReset();
        await options?.onFinalized?.();
      } else {
        const errorDescription = data.error
          ? data.error.replace(/\n-\s*/g, ' | ').replace(/\n/g, ' ').trim()
          : undefined;
        ToastService.show({
          title: data.errorTitle ?? 'Помилка при відправці до Діловода',
          description: errorDescription,
          color: 'danger',
          hideIcon: false,
          icon: 'alert-triangle',
        });
        LoggingService.log('[WarehouseMovement] Діловод відповів з помилкою:', data);
      }
    } catch (err) {
      LoggingService.log('[WarehouseMovement] sendAndFinalize error:', err);
      ToastService.show({ title: 'Помилка при відправці до Діловода', color: 'danger' });
    } finally {
      setIsSendingToDilovod(false);
    }
  }, [findEmptyBatches, mov, options]);

  const autoCleanAndSend = useCallback(() => {
    if (!emptyBatchesModal) return;
    emptyBatchesModal.items.forEach(({ product, emptyBatchIndices }) => {
      const cleaned = product.details.batches.filter((_, idx) => !emptyBatchIndices.includes(idx));
      mov.handleProductChange(product.id, cleaned);
    });
    setEmptyBatchesModal(null);
    void sendAndFinalize(true);
  }, [emptyBatchesModal, mov, sendAndFinalize]);

  const handleShowPayload = useCallback(async () => {
    let draft = mov.savedDraft;
    if (!draft || draft.id === 0) {
      draft = await mov.handleSaveDraft();
      if (!draft) return;
    }

    setIsLoadingPayload(true);
    try {
      const response = await fetch('/api/warehouse/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          draftId: draft.id,
          summaryItems: mov.summaryItems,
          movementDate: mov.selectedDateTime.toISOString(),
          dryRun: true,
          sourceWarehouse: mov.storage,
          destinationWarehouse: mov.storageTo,
        }),
      });
      const data = await response.json();
      if (data.success && data.payload) {
        setPayloadPreview(data.payload);
        setShowPayloadPreview(true);
      } else {
        const description = Array.isArray(data.details) && data.details.length > 0
          ? data.details.join(' | ')
          : undefined;
        ToastService.show({ title: data.error ?? 'Не вдалось отримати payload', description, color: 'danger' });
      }
    } catch (err) {
      LoggingService.log('[WarehouseMovement] handleShowPayload error:', err);
      ToastService.show({ title: 'Помилка при завантаженні payload', color: 'danger' });
    } finally {
      setIsLoadingPayload(false);
    }
  }, [mov]);

  return {
    sendAndFinalize,
    autoCleanAndSend,
    handleShowPayload,
    showPayloadPreview,
    setShowPayloadPreview,
    payloadPreview,
    isLoadingPayload,
    isSendingToDilovod,
    emptyBatchesModal,
    setEmptyBatchesModal,
  };
}
