import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface ReturnsActionBarProps {
  canSaveDraft: boolean;
  canSubmit: boolean;
  isSavingDraft: boolean;
  isSubmitting: boolean;
  onSaveDraft: () => void;
  onOpenConfirm: () => void;
  onShowPayload?: () => void;
}

export function ReturnsActionBar({
  canSaveDraft,
  canSubmit,
  isSavingDraft,
  isSubmitting,
  onSaveDraft,
  onOpenConfirm,
  onShowPayload,
}: ReturnsActionBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xs text-sm text-gray-400">
        Уважно перевірте всі дані перед підтвердженням оприбуткування!
      </div>
      <div className="flex flex-wrap gap-3">
        {onShowPayload && (
          <Button
            variant="flat"
            color="primary"
            className="bg-blue-200 text-slate-900"
            size="lg"
            onPress={onShowPayload}
            startContent={<DynamicIcon name="code-2" className="w-4 h-4" />}
          >
            payload
          </Button>
        )}
        {/* <Button
          color="default"
          size="lg"
          variant="flat"
          onPress={onSaveDraft}
          isLoading={isSavingDraft}
          isDisabled={!canSaveDraft}
          startContent={!isSavingDraft ? <DynamicIcon name="save" className="w-4 h-4" /> : undefined}
        >
          Зберегти чернетку
        </Button> */}
        <Button
          color="primary"
          size="lg"
          onPress={onOpenConfirm}
          isLoading={isSubmitting}
          isDisabled={!canSubmit}
          startContent={!isSubmitting ? <DynamicIcon name="check" className="w-4 h-4" /> : undefined}
        >
          Оприбуткувати
        </Button>
      </div>
    </div>
  );
}
