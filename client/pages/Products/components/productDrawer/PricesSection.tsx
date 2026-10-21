import { Button, Input, Select, SelectItem, Tooltip } from '@heroui/react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useCallback, useMemo, useState, type HTMLAttributes } from 'react';
import { NumberInputFromNumber } from '@/components/NumberInput';
import {
  CATALOG_DEFAULT_CURRENCY_ID,
  CATALOG_MAIN_PRICE_TYPE_IDS,
  CATALOG_PRICE_TYPE_MILITARY_ID,
} from '../../ProductsTypes';
import type { CatalogDictItemDto } from '../../ProductsTypes';
import { pricesAlmostEqual, withSyncedDerivedPrices } from '../../ProductsUtils';
import type { PriceRow, RowDeleteKind } from './productDrawerTypes';
import { FieldDirtyMarker } from './FieldDirtyMarker';
import { reorderPriceRows, sortPriceEntries } from './pricesSectionSort';
import { RowDeleteButton } from './RowDeleteButton';

interface PricesSectionProps {
  prices: PriceRow[];
  priceTypes: CatalogDictItemDto[];
  isGood: boolean;
  isKit: boolean;
  kitPortionCount: number;
  requiredPricesOk: boolean;
  mainPriceValue: number | null;
  militaryExpected: number | null;
  dirty?: boolean;
  rowDeleteConfirm: { kind: RowDeleteKind; idx: number } | null;
  onApplyPriceRowChange: (idx: number, patch: Partial<PriceRow>) => void;
  onPricesChange: (updater: (prev: PriceRow[]) => PriceRow[]) => void;
  onRowDeleteConfirm: (next: { kind: RowDeleteKind; idx: number } | null) => void;
  isReadOnly?: boolean;
}

export function PricesSection({
  prices,
  priceTypes,
  isGood,
  isKit,
  kitPortionCount,
  requiredPricesOk,
  mainPriceValue,
  militaryExpected,
  dirty,
  rowDeleteConfirm,
  onApplyPriceRowChange,
  onPricesChange,
  onRowDeleteConfirm,
  isReadOnly = false,
}: PricesSectionProps) {
  const [listSortEnabled, setListSortEnabled] = useState(false);
  const sortedEntries = useMemo(() => sortPriceEntries(prices), [prices]);
  const canManualReorder = listSortEnabled && !isReadOnly;
  const showDragHandle = canManualReorder;

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || !canManualReorder) return;
      const from = result.source.index;
      const to = result.destination.index;
      if (from === to) return;
      onPricesChange((prev) => reorderPriceRows(prev, from, to));
    },
    [canManualReorder, onPricesChange],
  );

  const renderPriceRow = (
    p: PriceRow,
    idx: number,
    dragHandleProps?: HTMLAttributes<HTMLElement>,
  ) => {
    const isMilitary = p.priceType === CATALOG_PRICE_TYPE_MILITARY_ID;
    const militaryMismatch =
      isMilitary && militaryExpected != null && !pricesAlmostEqual(p.price, militaryExpected);
    const militaryPortions = isKit ? kitPortionCount : 1;

    const fieldsGrid = (
      <>
            {priceTypes.length > 0 ? (
              <Select
                size="md"
                aria-label="Тип ціни"
                selectedKeys={p.priceType ? [p.priceType] : []}
                classNames={{
                  base: 'min-w-0',
                  popoverContent: 'bg-default-100',
                  trigger: 'border-1 border-default-200',
                }}
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0];
                  if (!v) return;
                  onApplyPriceRowChange(idx, { priceType: String(v) });
                }}
              >
                {priceTypes.map((t) => (
                  <SelectItem key={t.id}>{t.name}</SelectItem>
                ))}
              </Select>
            ) : (
              <Input
                size="md"
                aria-label="Тип ціни (id)"
                value={p.priceType}
                onValueChange={(v) => onApplyPriceRowChange(idx, { priceType: v })}
              />
            )}
            <NumberInputFromNumber
              size="md"
              aria-label="Ціна, грн"
              value={p.price}
              decimalPlaces={2}
              min={0}
              trimTrailingZeros={false}
              isInvalid={p.price <= 0}
              color={militaryMismatch ? 'danger' : 'default'}
              classNames={{
                inputWrapper: 'border-1 border-default-200',
              }}
              endContent={<span className="text-xs text-default-400/75">грн</span>}
              onChange={(price) => onApplyPriceRowChange(idx, { price })}
            />
            <RowDeleteButton
              ariaLabel="Видалити ціну"
              className="h-full"
              confirming={rowDeleteConfirm?.kind === 'price' && rowDeleteConfirm.idx === idx}
              onRequest={() => onRowDeleteConfirm({ kind: 'price', idx })}
              onConfirm={() => {
                onPricesChange((prev) =>
                  withSyncedDerivedPrices(
                    prev.filter((_, i) => i !== idx),
                    isKit,
                    kitPortionCount,
                    false,
                  ),
                );
                onRowDeleteConfirm(null);
              }}
            />
      </>
    );

    return (
      <div className="flex flex-col gap-1">
        {showDragHandle ? (
          <div className="flex items-start gap-2">
            <span
              {...dragHandleProps}
              className="inline-flex touch-none text-default-300 mt-2 h-8 w-4 shrink-0 items-center justify-center cursor-grab active:cursor-grabbing hover:text-default-500"
              title="Перетягнути для зміни порядку"
            >
              <DynamicIcon name="grip-vertical" size={14} />
            </span>
            <div className="min-w-0 flex-1 grid gap-2 grid-cols-[1fr_110px_auto]">{fieldsGrid}</div>
          </div>
        ) : (
          <div className="grid gap-2 grid-cols-[1fr_110px_auto]">{fieldsGrid}</div>
        )}
        {militaryMismatch && militaryExpected != null && mainPriceValue != null && (
          <p className={`text-xs text-danger ${showDragHandle ? 'pl-6' : ''}`}>
            Очікується {militaryExpected} грн (звичайна ціна {mainPriceValue} −{' '}
            {isKit ? `${militaryPortions}×5` : '5'})
          </p>
        )}
      </div>
    );
  };

  return (
    <section className={`space-y-3 ${isReadOnly ? 'pointer-events-none' : ''}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="text-sm font-semibold flex items-center gap-1">
          <DynamicIcon name="wallet" size={14} />
          <span>Ціни</span>
          <FieldDirtyMarker show={dirty} />
          {(isGood || isKit) && <span className="font-normal text-danger-500">*</span>}
        </h3>
        {prices.length > 0 && (
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
      {!requiredPricesOk && (
        <p className="text-xs text-warning-700">
          Обовʼязково вкажіть основні ціни (Роздріб, Звичайна і Військові мають бути більші за 0 грн)
        </p>
      )}
      {prices.length > 0 ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="product-prices" isDropDisabled={!canManualReorder}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-3">
                {sortedEntries.map((entry, displayIndex) => (
                  <Draggable
                    key={`${entry.row.priceType}-${entry.originalIdx}`}
                    draggableId={`${entry.row.priceType}-${entry.originalIdx}`}
                    index={displayIndex}
                    isDragDisabled={!canManualReorder}
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
                        {renderPriceRow(
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
        variant="solid"
        color="primary"
        className="bg-neutral-600/75 text-neutral-50 hover:bg-neutral-500/75"
        startContent={<DynamicIcon name="plus-circle" size={14} />}
        onPress={() => {
          if (prices.length === 0) {
            onPricesChange(() =>
              CATALOG_MAIN_PRICE_TYPE_IDS.map((priceType) => ({
                priceType,
                price: 0,
                currency: CATALOG_DEFAULT_CURRENCY_ID,
              })),
            );
            return;
          }
          onPricesChange((prev) => [
            ...prev,
            {
              priceType: priceTypes[0]?.id || '',
              price: 0,
              currency: CATALOG_DEFAULT_CURRENCY_ID,
            },
          ]);
        }}
      >
        {prices.length === 0 ? 'Додати основні ціни' : 'Додати ціну'}
      </Button>
    </section>
  );
}
