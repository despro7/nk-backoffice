import { useCallback, useState } from 'react';
import { LoggingService } from '@/services/LoggingService';
import { ToastService } from '@/services/ToastService';
import type { DilovodMovementPayload } from '@shared/types/movement';
import type { MovementProduct, MovementDraft } from '../../WarehouseMovement/WarehouseMovementTypes';

interface MovementV2SendFacade {
  storage: string;
  storageTo: string;
  selectedDateTime: Date;
  summaryItems: MovementProduct[];
  savedDraft: MovementDraft | null;
  handleSaveDraft: () => Promise<MovementDraft | null>;
}

export function useMovementV2SendFlow(mov: MovementV2SendFacade, options?: { onFinalized?: () => void | Promise<void> }) {
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<DilovodMovementPayload | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);
  const [isSendingToDilovod, setIsSendingToDilovod] = useState(false);

  const sendAndFinalize = useCallback(async () => {
    if (mov.summaryItems.length === 0) {
      ToastService.show({ title: 'Додайте товари з партіями', color: 'warning' });
      return;
    }

    const draft = await mov.handleSaveDraft();
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
          description: `Документ ${docLabel} успішно відправлено`,
          color: 'success',
        });
        setShowPayloadPreview(false);
        await options?.onFinalized?.();
      } else {
        ToastService.show({
          title: data.errorTitle ?? 'Помилка при відправці до Діловода',
          description: data.error?.replace(/\n/g, ' '),
          color: 'danger',
        });
        LoggingService.log('[WarehouseMovementV2] Dilovod error:', data);
      }
    } catch (err) {
      LoggingService.log('[WarehouseMovementV2] send error:', err);
      ToastService.show({ title: 'Помилка при відправці', color: 'danger' });
    } finally {
      setIsSendingToDilovod(false);
    }
  }, [mov, options]);

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
        ToastService.show({
          title: data.error ?? 'Не вдалось отримати payload',
          description: Array.isArray(data.details) ? data.details.join(' | ') : undefined,
          color: 'danger',
        });
      }
    } finally {
      setIsLoadingPayload(false);
    }
  }, [mov]);

  return {
    sendAndFinalize,
    handleShowPayload,
    showPayloadPreview,
    setShowPayloadPreview,
    payloadPreview,
    isLoadingPayload,
    isSendingToDilovod,
  };
}
