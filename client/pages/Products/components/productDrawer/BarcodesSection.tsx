import { Button, Input, Tooltip } from '@heroui/react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useCallback, useMemo, useState, type HTMLAttributes, type ReactNode } from 'react';
import { BarcodeKindIcon } from '../BarcodeKindIcon';
import { useProductMovementsDrawerOptional } from '@/features/product-movements/context/productMovementsDrawerContext.shared';
import type { BarcodeRow, RowDeleteKind } from './productDrawerTypes';
import { FieldDirtyMarker } from './FieldDirtyMarker';
import { reorderBarcodeRows, sortBarcodeEntries } from './barcodesSectionSort';
import { RowDeleteButton } from './RowDeleteButton';

function BarcodeBatchMovementsButton({
  sku,
  productName,
  batchId,
  batchLabel,
  disabled,
}: {
  sku: string | null;
  productName: string | null;
  batchId: string;
  batchLabel: string;
  disabled?: boolean;
}) {
  const movementsDrawer = useProductMovementsDrawerOptional();
  if (!movementsDrawer) {
    return null;
  }
  const { open } = movementsDrawer;
  const canOpen = Boolean(sku?.trim() && batchId.trim());
  return (
    <Button
      size="sm"
      variant="light"
      className="min-w-0 shrink-0 gap-1 px-3 h-10"
      startContent={<DynamicIcon name="arrow-left-right" size={14} />}
      isDisabled={disabled || !canOpen}
      onPress={() => {
        if (!sku?.trim() || !batchId.trim()) return;
        open({
          sku: sku.trim(),
          productName: productName?.trim() || undefined,
          goodPartId: batchId.trim(),
          batchLabel: batchLabel.trim() || undefined,
          autoGenerate: true,
          placement: 'left',
          nonDismissable: true,
        });
      }}
    >
      <span className="hidden md:inline-block">Рухи партії</span>
    </Button>
  );
}

function BarcodeCodeInputEndContent({
  row,
  idx,
  isReadOnly,
  saving,
  barcodeGeneratingIdx,
  onGenerateBarcode,
}: {
  row: BarcodeRow;
  idx: number;
  isReadOnly: boolean;
  saving?: boolean;
  barcodeGeneratingIdx: number | null;
  onGenerateBarcode: (idx: number) => void;
}): ReactNode {
  const isBox = row.barcodeKind === 'box';
  const showGenerate = row.isNew === true && !isBox && !isReadOnly;

  if (showGenerate) {
    return (
      <Tooltip
        content="Згенерувати ШК автоматично"
        placement="top-end"
        showArrow={true}
        color="default"
        delay={200}
        classNames={{
          base: 'before:rounded-[3px] before:bg-blue-500 before:z-[10]',
          content: 'bg-blue-500 text-white rounded-sm',
        }}
      >
        <Button
          isIconOnly
          size="sm"
          variant="light"
          color="default"
          className="text-default-500 hover:text-blue-600/75 hover:bg-blue-600/10! -mr-2"
          aria-label="Генерувати ШК автоматично"
          onPress={() => onGenerateBarcode(idx)}
          isLoading={barcodeGeneratingIdx === idx}
          isDisabled={saving || barcodeGeneratingIdx != null}
        >
          <DynamicIcon name="dices" size={16} />
        </Button>
      </Tooltip>
    );
  }

  if (isBox) {
    return <BarcodeKindIcon kind="box" className="bg-white/75 p-1 rounded-sm border border-warning-600 -mr-1" />;
  }

  return null;
}

interface BarcodesSectionProps {
  barcodes: BarcodeRow[];
  sku: string | null;
  productName: string | null;
  saving?: boolean;
  barcodeGeneratingIdx: number | null;
  dirty?: boolean;
  rowDeleteConfirm: { kind: RowDeleteKind; idx: number } | null;
  onBarcodesChange: (updater: (prev: BarcodeRow[]) => BarcodeRow[]) => void;
  onGenerateBarcode: (idx: number) => void;
  onOpenBatchPicker: (idx: number) => void;
  onRowDeleteConfirm: (next: { kind: RowDeleteKind; idx: number } | null) => void;
  isReadOnly?: boolean;
}

export function BarcodesSection({
  barcodes,
  sku,
  productName,
  saving,
  barcodeGeneratingIdx,
  dirty,
  rowDeleteConfirm,
  onBarcodesChange,
  onGenerateBarcode,
  onOpenBatchPicker,
  onRowDeleteConfirm,
  isReadOnly = false,
}: BarcodesSectionProps) {
  const [listSortEnabled, setListSortEnabled] = useState(false);
  const sortedEntries = useMemo(() => sortBarcodeEntries(barcodes), [barcodes]);
  const canManualReorder = listSortEnabled && !isReadOnly;
  const showDragHandle = canManualReorder;

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || !canManualReorder) return;
      const from = result.source.index;
      const to = result.destination.index;
      if (from === to) return;
      onBarcodesChange((prev) => reorderBarcodeRows(prev, from, to));
    },
    [canManualReorder, onBarcodesChange],
  );

  const renderBarcodeRow = (
    b: BarcodeRow,
    idx: number,
    dragHandleProps?: HTMLAttributes<HTMLElement>,
  ) => {
    const isBox = b.barcodeKind === 'box';
    const rowLocked = isReadOnly || isBox;

    const fieldsGrid = (
      <>
        <Input
          size="md"
          aria-label={isBox ? 'Штрихкод коробки' : 'Штрихкод'}
          labelPlacement="outside"
          placeholder={isBox ? 'ШК коробки' : 'Введіть або згенеруйте штрихкод'}
          classNames={{
            base: 'flex-1',
            inputWrapper: 'border-1 border-default-200',
          }}
          value={b.code}
          isReadOnly={rowLocked}
          onValueChange={(v) => {
            if (rowLocked) return;
            onBarcodesChange((prev) => prev.map((row, i) => (i === idx ? { ...row, code: v } : row)));
          }}
          endContent={
            <BarcodeCodeInputEndContent
              row={b}
              idx={idx}
              isReadOnly={isReadOnly}
              saving={saving}
              barcodeGeneratingIdx={barcodeGeneratingIdx}
              onGenerateBarcode={onGenerateBarcode}
            />
          }
        />
        <Input
          size="md"
          aria-label="Номер партії"
          labelPlacement="outside"
          placeholder="Оберіть партію…"
          value={b.goodPartName}
          isReadOnly
          classNames={{
            base: 'flex-1',
            inputWrapper: isBox
              ? 'cursor-default border-1 border-default-200'
              : 'cursor-pointer border-1 border-default-200',
            input: isBox ? 'cursor-default py-2' : 'cursor-pointer py-2',
          }}
          onClick={() => !rowLocked && onOpenBatchPicker(idx)}
          endContent={
            isBox ? null : (
              <DynamicIcon name="chevrons-up-down" size={14} className="shrink-0 text-default-400" />
            )
          }
        />
        <BarcodeBatchMovementsButton
          sku={sku}
          productName={productName}
          batchId={b.goodPart}
          batchLabel={b.goodPartName}
          disabled={saving}
        />
        <RowDeleteButton
          ariaLabel="Видалити ШК"
          className="shrink-0 h-10"
          confirming={rowDeleteConfirm?.kind === 'barcode' && rowDeleteConfirm.idx === idx}
          isDisabled={saving || isBox}
          onRequest={() => onRowDeleteConfirm({ kind: 'barcode', idx })}
          onConfirm={() => {
            onBarcodesChange((prev) => prev.filter((_, i) => i !== idx));
            onRowDeleteConfirm(null);
          }}
        />
      </>
    );

    if (showDragHandle) {
      return (
        <div className="flex items-start gap-2">
          <span
            {...dragHandleProps}
            className="inline-flex touch-none text-default-300 mt-2 h-8 w-4 shrink-0 items-center justify-center cursor-grab active:cursor-grabbing hover:text-default-500"
            title="Перетягнути для зміни порядку"
          >
            <DynamicIcon name="grip-vertical" size={14} />
          </span>
          <div className="min-w-0 flex-1 grid grid-cols-[1fr_1fr_auto_auto] gap-2">{fieldsGrid}</div>
        </div>
      );
    }

    return <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2">{fieldsGrid}</div>;
  };

  return (
    <section className={`space-y-3 ${isReadOnly ? 'pointer-events-none' : ''}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="text-sm font-semibold flex items-center gap-1">
          <DynamicIcon name="scan-barcode" size={14} />
          <span>Штрихкоди і партії</span>
          <FieldDirtyMarker show={dirty} />
        </h3>
        {barcodes.length > 1 && (
          <Tooltip
            content={
              listSortEnabled
                ? 'Вимкнути ручне сортування'
                : 'Увімкнути ручне сортування перетягуванням'
            }
            classNames={{ content: 'text-xs max-w-52' }}
          >
            <Button
              size="sm"
              isDisabled={isReadOnly}
              aria-label="Ручне сортування"
              aria-pressed={listSortEnabled && !isReadOnly}
              className={`h-6 min-w-6 gap-1 ml-3 pl-2 pr-2.5 ${
                listSortEnabled && !isReadOnly
                  ? 'bg-slate-600 text-slate-100'
                  : 'bg-default-200/60 text-default-400'
              }`}
              onPress={() => setListSortEnabled((value) => !value)}
              startContent={<DynamicIcon name="arrow-up-down" size={12} />}
            >
              Ручне сортування
            </Button>
          </Tooltip>
        )}
      </div>
      {barcodes.length > 0 ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="product-barcodes" isDropDisabled={!canManualReorder}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-3">
                {sortedEntries.map((entry, displayIndex) => (
                  <Draggable
                    key={`barcode-${entry.originalIdx}-${entry.row.code || 'empty'}-${entry.row.barcodeKind ?? 'portion'}`}
                    draggableId={`barcode-${entry.originalIdx}-${entry.row.barcodeKind ?? 'portion'}`}
                    index={displayIndex}
                    isDragDisabled={!canManualReorder || entry.row.barcodeKind === 'box'}
                  >
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={
                          snapshot.isDragging
                            ? 'rounded-md bg-default-100 shadow-sm'
                            : undefined
                        }
                      >
                        {renderBarcodeRow(
                          entry.row,
                          entry.originalIdx,
                          dragProvided.dragHandleProps ?? undefined,
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : null}
      <Button
        size="sm"
        color="secondary"
        aria-label="Додати ШК"
        className="bg-neutral-600/75 text-neutral-50 hover:bg-neutral-500/75"
        startContent={<DynamicIcon name="plus-circle" size={14} />}
        isDisabled={isReadOnly}
        onPress={() =>
          onBarcodesChange((prev) => [
            ...prev,
            {
              code: '',
              activity: true,
              goodPart: '',
              goodPartName: '',
              barcodeKind: 'portion',
              isNew: true,
            },
          ])
        }
      >
        Додати ШК
      </Button>
    </section>
  );
}
