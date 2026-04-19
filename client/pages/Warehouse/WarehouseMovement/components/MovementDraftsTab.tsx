import { useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { formatDate } from '@/lib/formatUtils';
import type { MovementDraft, MovementStatus } from '../WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// MovementDraftsTab — вміст вкладки "Чернетки"
// ---------------------------------------------------------------------------

interface MovementDraftsTabProps {
  drafts: MovementDraft[];
  loading: boolean;
  onRefresh: () => void;
  onLoadDraft: (draft: MovementDraft) => Promise<void>;
  onDeleteDraft: (id: number) => Promise<void>;
}

/** Чіп статусу документа */
const StatusChip = ({ status }: { status: MovementStatus | string }) => {
  if (status === 'active') {
    return <Chip size="sm" variant="flat" color="warning" className="bg-amber-200/50 text-amber-600" startContent={<DynamicIcon name="clock" className="w-3 h-3 ml-1" />}>Активний</Chip>;
  }
  return <Chip size="sm" variant="flat" color="default">Чернетка</Chip>;
};

/** Підраховує кількість унікальних SKU в чернетці */
const countItems = (draft: MovementDraft): number => {
  try {
    const items = typeof draft.items === 'string'
      ? JSON.parse(draft.items as unknown as string)
      : draft.items;
    return Array.isArray(items) ? new Set(items.map((i: any) => i.sku)).size : 0;
  } catch {
    return 0;
  }
};

export const MovementDraftsTab = ({
  drafts,
  loading,
  onRefresh,
  onLoadDraft,
  onDeleteDraft,
}: MovementDraftsTabProps) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleLoad = async (draft: MovementDraft) => {
    setLoadingId(draft.id);
    try {
      await onLoadDraft(draft);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (confirmDeleteId === null) return;
    await onDeleteDraft(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  const draftToDelete = drafts.find(d => d.id === confirmDeleteId);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 pl-1">Чернетки переміщень</h2>
        <Button
          size="sm"
          variant="flat"
          color="default"
          onPress={onRefresh}
          isLoading={loading}
          startContent={!loading ? <DynamicIcon name="refresh-cw" className="w-3.5 h-3.5" /> : undefined}
        >
          Оновити
        </Button>
      </div>

      {/* Стан завантаження */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">
          <DynamicIcon name="loader-2" className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
          <p className="text-sm">Завантаження чернеток...</p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <DynamicIcon name="file-x" className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Немає збережених чернеток</p>
          <Button size="sm" variant="flat" className="mt-3" onPress={onRefresh}>
            Завантажити
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-1/8">Номер</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-1/8">Статус</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-1/6">Дата переміщення</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-1/6">Дата створення</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-1/6">Товарів</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-1/6">Автор</th>
                <th className="text-right py-2 px-3 pr-5 text-xs font-medium text-gray-500 uppercase tracking-wide w-1/6">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {drafts.map((draft) => {
                const itemCount = countItems(draft);
                return (
                  <tr key={draft.id} className="hover:bg-gray-50 transition-colors">
                    {/* Номер */}
                    <td className="py-3 px-3">
                      <span className=" font-semibold text-gray-700">
                        {draft.docNumber ?? draft.internalDocNumber}
                      </span>
                    </td>

                    {/* Статус */}
                    <td className="py-3 px-3">
                      <StatusChip status={draft.status} />
                    </td>

                    {/* Дата переміщення */}
                    <td className="py-3 px-3">
                      {draft.movementDate ? (
                        <span className="text-gray-800">{formatDate(draft.movementDate)}</span>
                      ) : (
                        <Chip size="sm" variant="flat" color="warning">Не вказано</Chip>
                      )}
                    </td>

                    {/* Дата створення */}
                    <td className="py-3 px-3 text-gray-500">
                      {formatDate(draft.draftCreatedAt)}
                    </td>

                    {/* Кількість товарів */}
                    <td className="py-3 px-3">
                      <Chip size="sm" variant="flat" color="default">
                        {itemCount} {itemCount === 1 ? 'товар' : itemCount < 5 ? 'товари' : 'товарів'}
                      </Chip>
                    </td>

                    {/* Автор */}
                    <td className="py-3 px-3 text-gray-700">
                      {draft.createdByName ?? '—'}
                    </td>

                    {/* Дії */}
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="flat"
                          color="primary"
													className="bg-blue-100"
                          isLoading={loadingId === draft.id}
                          onPress={() => handleLoad(draft)}
                          startContent={
                            loadingId !== draft.id
                              ? <DynamicIcon name="square-pen" className="w-3.5 h-3.5" />
                              : undefined
                          }
                        >
                          Редагувати
                        </Button>
                        {/* Видалення доступне тільки для чернеток (не для активних документів у Діловоді) */}
                        {draft.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="light"
                            color="danger"
                            isIconOnly
                            onPress={() => setConfirmDeleteId(draft.id)}
                            aria-label="Видалити чернетку"
                          >
                            <DynamicIcon name="trash-2" className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Модалка підтвердження видалення */}
      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Видалити чернетку?"
        message={
          draftToDelete
            ? `Чернетка №${draftToDelete.internalDocNumber ?? draftToDelete.id} від ${formatDate(draftToDelete.movementDate ?? draftToDelete.draftCreatedAt)} буде видалена безповоротно.`
            : ''
        }
        confirmText="Видалити"
        cancelText="Скасувати"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
};
