import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

// ---------------------------------------------------------------------------
// InventoryActionBar — нижня панель дій для активної інвентаризації
// ---------------------------------------------------------------------------

interface InventoryActionBarProps {
  deviationCount: number;
  totalCheckedAll: number;
  isSavingDraft: boolean;
  comment: string;
  onCancel: () => void;
  onOpenComment: () => void;
  onSaveDraft: () => void;
  onFinish: () => void;
}

export const InventoryActionBar = ({
  deviationCount, totalCheckedAll, isSavingDraft, comment,
  onCancel, onOpenComment, onSaveDraft, onFinish,
}: InventoryActionBarProps) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between gap-3">
    {/* Ліва частина */}
    <Button
      variant="flat"
      color="default"
      onPress={onCancel}
      startContent={<DynamicIcon name="x" className="w-4 h-4" />}
    >
      Скасувати
    </Button>

    {/* Права частина */}
    <div className="flex items-center gap-2">
      <Button
        variant="flat"
        color="default"
        onPress={onOpenComment}
        startContent={<DynamicIcon name="message-square-plus" className="w-4 h-4" />}
      >
        {comment ? 'Редагувати коментар' : 'Додати коментар'}
      </Button>
      <Button
        variant="flat"
        color="default"
        onPress={onSaveDraft}
        isLoading={isSavingDraft}
        startContent={!isSavingDraft ? <DynamicIcon name="save" className="w-4 h-4" /> : undefined}
      >
        Зберегти чернетку
      </Button>
      <Button
        color={deviationCount > 0 ? 'danger' : 'success'}
        className="text-white"
        isDisabled={totalCheckedAll === 0}
        onPress={onFinish}
        startContent={
          <DynamicIcon
            name={deviationCount > 0 ? 'alert-triangle' : 'check'}
            className="w-4 h-4"
          />
        }
      >
        {deviationCount > 0 ? 'Завершити і зафіксувати відхилення' : 'Завершити'}
      </Button>
    </div>
  </div>
);
