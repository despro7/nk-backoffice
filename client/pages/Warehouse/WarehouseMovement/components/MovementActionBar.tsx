import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementStatus } from '@shared/types/movement';

// ---------------------------------------------------------------------------
// MovementActionBar — нижня панель дій для активного переміщення
// ---------------------------------------------------------------------------

interface MovementActionBarProps {
  selectedCount: number;
  isDirty: boolean;
  isSavingDraft: boolean;
  isSending: boolean;
  hasDraft: boolean;
  draftStatus: MovementStatus | null;
  onCancel: () => void;
  /** Зберегти та відправити в Діловод — документ одразу закривається (статус 'finalized') */
  onSaveAndSend: () => void;
  /** Тільки для адмінів — відображення кнопки "Показати payload" */
  onShowPayload?: () => void;
  isAdmin?: boolean;
  isLoadingPayload?: boolean;
  isDebugMode?: boolean;
}

export const MovementActionBar = ({
  selectedCount,
  isDirty,
  isSavingDraft,
  isSending,
  hasDraft,
  draftStatus,
  onCancel,
  onSaveAndSend,
  onShowPayload,
  isAdmin = false,
  isDebugMode = false,
  isLoadingPayload = false,
}: MovementActionBarProps) => {
  const isFinalized = draftStatus === 'finalized';
  const canEdit = !isFinalized;
  // Кнопка "Зберегти та відправити" активна якщо: є товари та або (є збережена чернетка) або (є незбережені зміни)
  const canSend = canEdit && !isSavingDraft && selectedCount > 0 && (hasDraft || isDirty);

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Ліва частина */}
      <Button
        variant="flat"
        color="danger"
        size="lg"
        onPress={onCancel}
        isDisabled={isFinalized}
      >
        Скасувати
      </Button>

      {/* Права частина */}
      <div className="flex items-center gap-3">
        {/* Зберегти та відправити в Діловод — документ одразу закривається (статус 'finalized') */}
        {canEdit && (
          <Button
            color="success"
            size="lg"
            className="text-white"
            isDisabled={!canSend || isSending}
            onPress={onSaveAndSend}
            isLoading={isSending}
            startContent={!isSending ? <DynamicIcon name="send" className="w-4 h-4" /> : undefined}
          >
            {isSending ? 'Відправка...' : 'Зберегти та відправити'}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3 w-full justify-end">
        {/* Кнопка "Показати payload" — тільки для адміністраторів (debug-режим) */}
        { isDebugMode && isAdmin && onShowPayload && (
          <Button
            variant="flat"
            color="primary"
            className="bg-blue-200"
            size="lg"
            onPress={onShowPayload}
            isLoading={isLoadingPayload}
            // isDisabled={!hasDraft || isSending || isLoadingPayload}
            startContent={!isLoadingPayload ? <DynamicIcon name="code-2" className="w-4 h-4" /> : undefined}
          >
            payload
          </Button>
        )}
      </div>
    </div>
  );
};
