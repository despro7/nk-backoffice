import { Button, Spinner } from '@heroui/react';
import { SwipeActionRow, type SwipeActionRest } from '@/components/motion/swipe-action-row';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState, type ReactNode } from 'react';
import type { MovementMobAggregates, MovementMobChronologyEvent, MovementMobEditorMode, MovementMobProductLineViewModel } from '../WarehouseMovementMobTypes';
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
  chronology: MovementMobChronologyEvent[];
  scanSlot: ReactNode;
  onAddMore: () => void;
  onManualBarcode: () => void;
  onEditLine?: (line: MovementMobProductLineViewModel) => void;
  onDeleteLine?: (line: MovementMobProductLineViewModel) => void;
  enterLineKey?: string | null;
  onSend: () => void;
  warehousesLocked?: boolean;
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
  chronology,
  scanSlot,
  onAddMore,
  onManualBarcode,
  onEditLine,
  onDeleteLine,
  enterLineKey = null,
  onSend,
  warehousesLocked = false,
}: MovementMobDocumentScreenProps) {
  const isView = editorMode === 'view';
  const isEmpty = editorMode === 'empty';
  const isFormation = editorMode === 'formation';
  const [openSwipe, setOpenSwipe] = useState<{ key: string; side: Exclude<SwipeActionRest, 'closed'> } | null>(null);
  const canSwipe = isFormation && Boolean(onEditLine && onDeleteLine);

  return (
    <div className="flex flex-col gap-4 pb-24 px-3 md:px-0">
      <MovementMobWarehouseSelectors
        storages={storages}
        sourceId={sourceId}
        destId={destId}
        onSourceChange={onSourceChange}
        onDestChange={onDestChange}
        onSwap={onSwap}
        readOnly={isView || warehousesLocked}
      />

      {!isView && scanSlot}

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
            <h3 className="text-base font-bold text-default-700">Товари на переміщення</h3>
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
                  <MovementMobProductCard line={line} />
                </SwipeActionRow>
              ))}
            </div>
          )}

          <MovementMobDocumentSummary aggregates={aggregates} />
        </section>
      )}

      {isFormation && (
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

      {chronology.length > 0 && <MovementMobChronology events={chronology} />}
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
