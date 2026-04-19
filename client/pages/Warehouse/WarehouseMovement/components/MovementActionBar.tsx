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
  onSaveDraft: () => void;
  /** Проміжна відправка (isFinal=false) — статус → 'active', документ залишається редагованим */
  onSendIntermediate: () => void;
  /** Фінальна відправка (isFinal=true) — статус → 'finalized', документ блокується */
  onSendFinal: () => void;
  /** Завершити локально без відправки в Діловод */
  onFinalizeLocally?: () => void;
  isFinalizingLocally?: boolean;
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
  onSaveDraft,
  onSendIntermediate,
  onSendFinal,
  onFinalizeLocally,
  isFinalizingLocally = false,
  onShowPayload,
  isAdmin = false,
  isDebugMode = false,
  isLoadingPayload = false,
}: MovementActionBarProps) => {
  const isFinalized = draftStatus === 'finalized';
  const canEdit = !isFinalized;
  // Кнопка "Відправити" активна якщо: є товари та або (є збережена чернетка) або (є незбережені зміни)
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
        {/* Зберегти чернетку — закоментовано: автозбереження відбувається перед відправкою */}
        {canEdit && (
          <Button
            variant="flat"
            color="default"
            className="bg-neutral-500 text-white"
            size="lg"
            onPress={onSaveDraft}
            isLoading={isSavingDraft}
            isDisabled={selectedCount === 0}
            startContent={!isSavingDraft ? <DynamicIcon name="save" className="w-4 h-4" /> : undefined}
          >
            {isSavingDraft ? 'Збереження...' : 'Зберегти чернетку'}
          </Button>
        )}

        {/* Відправити в Діловод — проміжна відправка, документ залишається активним */}
        {canEdit && (
          <Button
            color="warning"
            size="lg"
            className="text-white"
            isDisabled={!canSend || isSending}
            onPress={onSendIntermediate}
            isLoading={isSending}
            startContent={!isSending ? <DynamicIcon name="send" className="w-4 h-4" /> : undefined}
          >
            {isSending ? 'Відправка...' : 'Відправити в Діловод'}
          </Button>
        )}

        {/* Завершити переміщення — фінальна відправка, документ блокується */}
        {canEdit && draftStatus === 'active' && (
          <Button
            color="success"
            size="lg"
            className="text-white"
            isDisabled={!canSend || isSending}
            onPress={onSendFinal}
            isLoading={isSending}
            startContent={!isSending ? <DynamicIcon name="check-circle" className="w-4 h-4" /> : undefined}
          >
            Завершити переміщення
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3 w-full justify-end">
        {/* Кнопка "Показати payload" — тільки для адміністраторів */}
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

        {/* Завершити без Діловода — локальне завершення без відправки в ERP (лише debug-режим) */}
        {isDebugMode && canEdit && draftStatus === 'active' && onFinalizeLocally && (
          <Button
            variant="solid"
            color="danger"
            size="lg"
            isDisabled={isSending || isFinalizingLocally}
            onPress={onFinalizeLocally}
            isLoading={isFinalizingLocally}
            startContent={!isFinalizingLocally ? <DynamicIcon name="check" className="w-4 h-4" /> : undefined}
          >
            Завершити без Діловода
          </Button>
        )}
      </div>
    </div>
  );
};
