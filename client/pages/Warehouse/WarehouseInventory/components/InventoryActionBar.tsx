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
  isEditingCompleted?: boolean;
}

export const InventoryActionBar = ({
  deviationCount, totalCheckedAll, isSavingDraft, comment,
  onCancel, onOpenComment, onSaveDraft, onFinish,
  isEditingCompleted = false,
}: InventoryActionBarProps) => (
  <div className="flex items-center justify-between gap-8 mt-2">
    {/* Ліва частина */}
    <Button
      variant="flat"
      color="danger"
      className="gap-2"
      size="lg"
      onPress={onCancel}
      // startContent={<DynamicIcon name="x" className="w-4 h-4 -ml-1" />}
    >
      Скасувати
    </Button>

    {/* Права частина */}
    <div className="flex items-center gap-4">
      <Button
        variant="flat"
        color="default"
        className="bg-neutral-500 text-white gap-2"
        size="lg"
        onPress={onOpenComment}
        startContent={<DynamicIcon name="message-square-plus" className="w-4 h-4 -ml-0.5" />}
      >
        {comment ? 'Редагувати коментар' : 'Додати коментар'}
      </Button>
      <Button
        variant="flat"
        color="default"
        className="bg-neutral-500 text-white gap-2"
        size="lg"
        onPress={onSaveDraft}
        isLoading={isSavingDraft}
        startContent={!isSavingDraft ? <DynamicIcon name="save" className="w-4 h-4 -ml-0.5" /> : undefined}
      >
        {isEditingCompleted ? 'Зберегти зміни' : 'Зберегти чернетку'}
      </Button>
      <Button
        color={deviationCount > 0 ? 'danger' : 'success'}
        size="lg"
        className="text-white"
        isDisabled={totalCheckedAll === 0}
        onPress={onFinish}
        startContent={
          <DynamicIcon
            name={deviationCount > 0 ? 'alert-triangle' : 'check'}
            className="w-4 h-4 -ml-0.5"
          />
        }
      >
        {isEditingCompleted ? (deviationCount > 0 ? 'Перезавершити і зафіксувати відхилення' : 'Перезавершити') : (deviationCount > 0 ? 'Завершити і зафіксувати відхилення' : 'Завершити')}
      </Button>
    </div>
  </div>
);
