import { Button, Spinner } from '@heroui/react';
import { SwipeActionRow, type SwipeActionRest } from '@/components/motion/swipe-action-row';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState, type ReactNode } from 'react';
import type {
  MovementMobActionBar,
  MovementMobAdminQtySide,
  MovementMobAggregates,
  MovementMobChronologyEvent,
  MovementMobEditorMode,
  MovementMobProductLineViewModel,
} from '../WarehouseMovementMobTypes';
import MovementMobAddMoreButton from './MovementMobAddMoreButton';
import MovementMobChronology from './MovementMobChronology';
import MovementMobDocumentSummary from './MovementMobDocumentSummary';
import MovementMobProductCard from './MovementMobProductCard';
import MovementMobWarehouseSelectors, {
  type MovementMobStorageOption,
} from './MovementMobWarehouseSelectors';

interface MovementMobDocumentScreenProps {
  editorMode: MovementMobEditorMode;
  storages: MovementMobStorageOption[];
  sourceId: string;
  destId: string;
  onSourceChange: (id: string) => void;
  onDestChange: (id: string) => void;
  onSwap: () => void;
  lines: MovementMobProductLineViewModel[];
  aggregates: MovementMobAggregates;
  receivedAggregates?: MovementMobAggregates;
  chronology: MovementMobChronologyEvent[];
  scanSlot: ReactNode;
  onAddMore: () => void;
  onManualBarcode: () => void;
  onEditLine?: (line: MovementMobProductLineViewModel) => void;
  onDeleteLine?: (line: MovementMobProductLineViewModel) => void;
  enterLineKey?: string | null;
  onSend: () => void;
  onConfirmReceipt?: () => void;
  onShowPayload?: () => void;
  isLoadingPayload?: boolean;
  warehousesLocked?: boolean;
  actionBar?: MovementMobActionBar | null;
  isDeleted?: boolean;
  showAdminActions?: boolean;
  adminEditing?: boolean;
  onAdminEdit?: () => void;
  onAdminDelete?: () => void;
  onFinishAdminEdit?: () => void;
  canAdminEdit?: boolean;
  canAdminDelete?: boolean;
  isFinalized?: boolean;
  adminQtySide?: MovementMobAdminQtySide;
  onAdminQtySideChange?: (side: MovementMobAdminQtySide) => void;
  onSyncDilovod?: () => void;
  syncingDilovod?: boolean;
}

export default function MovementMobDocumentScreen({
  editorMode,
  storages,
  sourceId,
  destId,
  onSourceChange,
  onDestChange,
  onSwap,
  lines,
  aggregates,
  receivedAggregates,
  chronology,
  scanSlot,
  onAddMore,
  onManualBarcode,
  onEditLine,
  onDeleteLine,
  enterLineKey = null,
  onSend,
  onConfirmReceipt,
  onShowPayload,
  isLoadingPayload = false,
  warehousesLocked = false,
  actionBar = null,
  isDeleted = false,
  showAdminActions = false,
  adminEditing = false,
  onAdminEdit,
  onAdminDelete,
  onFinishAdminEdit,
  canAdminEdit = true,
  canAdminDelete = true,
  isFinalized = false,
  adminQtySide = 'sent',
  onAdminQtySideChange,
  onSyncDilovod,
  syncingDilovod = false,
}: MovementMobDocumentScreenProps) {
  const isView = editorMode === 'view';
  const isEmpty = editorMode === 'empty';
  const isFormation = editorMode === 'formation';
  const isReceiving = editorMode === 'receiving';
  const [openSwipe, setOpenSwipe] = useState<{ key: string; side: Exclude<SwipeActionRest, 'closed'> } | null>(null);
  const canSwipe = (isFormation || adminEditing) && Boolean(onEditLine && onDeleteLine);
  const dualQty = isFinalized || isReceiving
    || lines.some((line) => line.receivedTotalPortions > 0 || line.receivedBoxQuantity > 0);
  const showReceipt = dualQty && (!adminEditing || isFinalized);
  const qtyFocus: MovementMobAdminQtySide = adminEditing && isFinalized ? adminQtySide : 'received';
  const listTitle = adminEditing && isFinalized
    ? (adminQtySide === 'received' ? 'Отримані товари' : 'Відправлені товари')
    : isReceiving
      ? 'Прийом товарів'
      : 'Товари на переміщення';

  return (
    <div className="flex flex-col gap-4 pb-24 px-3 md:px-0">
      {isDeleted && (
        <div className="rounded-sm bg-danger-50 px-3 py-2.5 text-sm text-danger-700 border border-danger-700/40 flex items-center gap-2">
          <DynamicIcon name="trash-2" size={16} strokeWidth={1.75} className="shrink-0" />
          Документ видалено. Він не потрапляє в робочий список і зʼявиться в архіві.
        </div>
      )}

      <MovementMobWarehouseSelectors
        storages={storages}
        sourceId={sourceId}
        destId={destId}
        onSourceChange={onSourceChange}
        onDestChange={onDestChange}
        onSwap={onSwap}
        readOnly={isView || isReceiving || warehousesLocked}
      />

      {(isFormation || isReceiving || isEmpty) && scanSlot}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center gap-6 py-10 min-h-[18rem]">
          <DynamicIcon
            name="package-search"
            size={120}
            strokeWidth={1}
            className="text-neutral-400"
          />
          <p className="text-center text-lg leading-tight text-neutral-400/75 max-w-68">
            Оберіть товар для переміщення
          </p>
          <MovementMobAddMoreButton
            onAdd={onAddMore}
            onManualBarcode={onManualBarcode}
            label="Додати товар"
          />
        </div>
      )}

      {!isEmpty && (
        <section className="flex flex-col gap-3 mt-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-default-700">
              {listTitle}
            </h3>
          </div>

          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-default-200 bg-white py-10 text-center text-sm text-default-400">
              Немає позицій у документі
            </div>
          ) : (
            <div className="flex flex-col">
              {lines.map((line) => (
                <SwipeActionRow
                  key={line.key}
                  disabled={!canSwipe}
                  rest={openSwipe?.key === line.key ? openSwipe.side : 'closed'}
                  onRestChange={(next) => {
                    setOpenSwipe(next === 'closed' ? null : { key: line.key, side: next });
                  }}
                  leading={{
                    label: 'Редагувати',
                    icon: <DynamicIcon name="pencil" size={18} strokeWidth={1.75} className="shrink-0" />,
                    onAction: () => onEditLine?.(line),
                  }}
                  trailing={{
                    label: 'Видалити',
                    icon: <DynamicIcon name="trash-2" size={18} strokeWidth={1.75} className="shrink-0" />,
                    onAction: () => onDeleteLine?.(line),
                  }}
                  enterFromCollapsed={enterLineKey === line.key}
                >
                  <MovementMobProductCard line={line} showReceipt={showReceipt} qtyFocus={qtyFocus} />
                </SwipeActionRow>
              ))}
            </div>
          )}

          <MovementMobDocumentSummary
            aggregates={aggregates}
            receivedAggregates={isReceiving || isFinalized ? receivedAggregates : undefined}
          />
        </section>
      )}

      {actionBar === 'formation' && (
        <div className="flex items-stretch gap-3 mt-4">
          <MovementMobAddMoreButton onAdd={onAddMore} onManualBarcode={onManualBarcode} />
          <Button
            size="lg"
            className="gap-2 bg-gradient-to-b from-lime-500 to-lime-600 text-white h-12 font-medium shadow-button-primary shrink-0 w-auto px-6 sm:min-w-0 sm:flex-1 sm:w-auto"
            startContent={<DynamicIcon name="send" size={18} strokeWidth={1.5} className="shrink-0" />}
            onPress={onSend}
          >
            Відправити
          </Button>
        </div>
      )}

      {actionBar === 'receiving' && (
        <div className="flex flex-col gap-3 mt-4 w-full">
          <MovementMobAddMoreButton
            onAdd={onAddMore}
            onManualBarcode={onManualBarcode}
            label="Сканувати позицію"
          />
          <div className="flex items-stretch gap-3 w-full">
            {onShowPayload && (
              <Button
                size="lg"
                variant="flat"
                color="primary"
                className="h-12 font-medium shrink-0 px-4 bg-blue-200 text-slate-900"
                isLoading={isLoadingPayload}
                startContent={
                  !isLoadingPayload
                    ? <DynamicIcon name="code-2" size={18} strokeWidth={1.5} className="shrink-0" />
                    : undefined
                }
                onPress={onShowPayload}
              >
                Payload
              </Button>
            )}
            <Button
              size="lg"
              className="gap-2 bg-gradient-to-b from-blue-500 to-blue-600 text-white h-12 font-medium shadow-button-primary flex-1 min-w-0"
              startContent={<DynamicIcon name="check" size={18} strokeWidth={1.5} className="shrink-0" />}
              onPress={onConfirmReceipt}
            >
              Підтвердити отримання
            </Button>
          </div>
        </div>
      )}

      {actionBar === 'adminEdit' && (
        <div className="flex flex-col gap-3 mt-4 w-full">
          {isFinalized && (
            <div className="grid grid-cols-2 gap-2 w-full">
              <Button
                size="lg"
                variant={adminQtySide === 'sent' ? 'solid' : 'flat'}
                color={adminQtySide === 'sent' ? 'primary' : 'default'}
                className={`h-11 font-medium ${adminQtySide === 'sent' ? 'text-white bg-blue-600' : ''}`}
                onPress={() => onAdminQtySideChange?.('sent')}
              >
                Відправлене
              </Button>
              <Button
                size="lg"
                variant={adminQtySide === 'received' ? 'solid' : 'flat'}
                color={adminQtySide === 'received' ? 'primary' : 'default'}
                className={`h-11 font-medium ${adminQtySide === 'received' ? 'text-white bg-blue-600' : ''}`}
                onPress={() => onAdminQtySideChange?.('received')}
              >
                Отримане
              </Button>
            </div>
          )}
          <MovementMobAddMoreButton
            onAdd={onAddMore}
            onManualBarcode={onManualBarcode}
            label={isFinalized && adminQtySide === 'received' ? 'Сканувати позицію' : 'Додати товар'}
          />
          {isFinalized && onSyncDilovod && (
            <div className="flex items-stretch gap-3 w-full">
              {onShowPayload && (
                <Button
                  size="lg"
                  variant="flat"
                  color="primary"
                  className="h-12 font-medium shrink-0 px-4 bg-blue-200 text-slate-900"
                  isLoading={isLoadingPayload}
                  startContent={
                    !isLoadingPayload
                      ? <DynamicIcon name="code-2" size={18} strokeWidth={1.5} className="shrink-0" />
                      : undefined
                  }
                  onPress={onShowPayload}
                >
                  Payload
                </Button>
              )}
              <Button
                size="lg"
                className="gap-2 bg-gradient-to-b from-blue-500 to-blue-600 text-white h-12 font-medium shadow-button-primary flex-1 min-w-0"
                isLoading={syncingDilovod}
                startContent={<DynamicIcon name="upload" size={18} strokeWidth={1.5} className="shrink-0" />}
                onPress={onSyncDilovod}
              >
                Зберегти в Dilovod
              </Button>
            </div>
          )}
        </div>
      )}

      {actionBar === 'awaitingReceipt' && (
        <Button
          fullWidth
          isDisabled
          size="lg"
          className="mt-4 h-12 font-medium w-full"
          startContent={<DynamicIcon name="send" size={18} strokeWidth={1.5} className="shrink-0" />}
        >
          Документ відправлено
        </Button>
      )}

      {chronology.length > 0 && <MovementMobChronology events={chronology} />}

      {showAdminActions && !isDeleted && (
        <div className="flex items-stretch gap-2 mt-6">
          {canAdminEdit && (adminEditing ? (
            <Button
              size="sm"
              variant="flat"
              className="flex-1 h-10 text-white bg-neutral-400/75 hover:bg-neutral-400/80"
              startContent={<DynamicIcon name="check" size={16} strokeWidth={1.75} />}
              onPress={onFinishAdminEdit}
            >
              Завершити редагування
            </Button>
          ) : (
            <Button
              size="sm"
              variant="flat"
              color="primary"
              className="flex-1 h-10 text-white bg-blue-600 hover:bg-blue-600"
              startContent={<DynamicIcon name="pencil" size={16} strokeWidth={1.75} />}
              onPress={onAdminEdit}
            >
              Редагувати
            </Button>
          ))}
          {canAdminDelete && (
            <Button
              size="sm"
              variant="flat"
              color="danger"
              className="flex-1 h-10 text-white bg-danger-500 hover:bg-danger-500"
              startContent={<DynamicIcon name="trash-2" size={16} strokeWidth={1.75} />}
              onPress={onAdminDelete}
            >
              Видалити
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function MovementMobDocumentScreenLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-default-500">
      <Spinner size="lg" color="primary" />
      <p className="text-sm">Завантаження документа…</p>
    </div>
  );
}
