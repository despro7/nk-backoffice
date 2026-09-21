import {
  Button,
  Chip,
  Divider,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  Tooltip,
  type SortDescriptor,
} from '@heroui/react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useCallback, useMemo, useState, type HTMLAttributes } from 'react';
import { NumberInput, NumberInputFromNumber } from '@/components/NumberInput';
import { pluralize } from '@/lib/formatUtils';
import { StepperInput } from '@/pages/Warehouse/shared/StepperInput';
import {
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  CATALOG_FINISHED_PRODUCTS_FOLDER_NAME,
} from '../../ProductsTypes';
import type { CatalogDictItemDto } from '../../ProductsTypes';
import { hasParenthesizedTextInName, isSuspiciousBomIngredientQty, type ExpectedBomWeight } from '../../ProductsUtils';
import type { BomRow, CatalogSearchHit, DrawerForm, RowDeleteKind } from './productDrawerTypes';
import {
  formatWeightKg,
  hasComponentWeight,
  showMissingWeightBadge,
} from './productDrawerUtils';
import { RowDeleteButton } from './RowDeleteButton';
import {
  BOM_MANUAL_SORT,
  getBomSortIconName,
  isBomManualSort,
  nextBomSortDescriptor,
  reorderBomRows,
  sortBomEntries,
  type BomRowEntry,
  type BomSortColumn,
} from './bomSectionSort';

interface BomSectionProps {
  form: DrawerForm;
  components: BomRow[];
  units: CatalogDictItemDto[];
  isGood: boolean;
  isKit: boolean;
  isAdmin: boolean;
  kitPortionCount: number;
  packageRatioInvalid: boolean;
  weightFieldInvalid: boolean;
  bomQuery: string;
  bomSuggestions: CatalogSearchHit[];
  editingNoteIdx: number | null;
  noteDeleteConfirmIdx: number | null;
  rowDeleteConfirm: { kind: RowDeleteKind; idx: number } | null;
  bomWeightExpected: ExpectedBomWeight | null;
  canFillWeightFromBom: boolean;
  showExpectedWeightHint: boolean;
  specQtySuspicious: boolean;
  onOpenTechCard: () => void;
  onFormChange: (updater: (prev: DrawerForm) => DrawerForm) => void;
  onBomQueryChange: (q: string) => void;
  onAddComponent: (hit: CatalogSearchHit) => void;
  onComponentsChange: (updater: (prev: BomRow[]) => BomRow[]) => void;
  onPatchKitComponents: (updater: (prev: BomRow[]) => BomRow[]) => void;
  onOpenNested: (componentGoodId: string) => void;
  onEditingNoteIdx: (idx: number | null) => void;
  onNoteDeleteConfirmIdx: (idx: number | null) => void;
  onRowDeleteConfirm: (next: { kind: RowDeleteKind; idx: number } | null) => void;
  onFillExpectedWeight: () => void;
  renamingComponentGoodId: string | null;
  onMoveParenthesesToNote: (idx: number) => void | Promise<void>;
  isReadOnly?: boolean;
}

function BomRowWeightHint({
  isKit,
  accPolicyId,
  weight,
}: {
  isKit: boolean;
  accPolicyId: string | null;
  weight: number | null;
}) {
  if (hasComponentWeight(weight)) {
    return (
      <span className="text-xs text-default-400 tabular-nums whitespace-nowrap">
        {formatWeightKg(weight as number, 2)} кг
      </span>
    );
  }
  if (showMissingWeightBadge(isKit, accPolicyId, false)) {
    return (
      <Chip size="sm" color="danger" variant="flat" className="h-5 min-h-5 px-1.5 text-[10px]">
        немає ваги
      </Chip>
    );
  }
  return null;
}

function BomSortableHeader({
  label,
  column,
  sortDescriptor,
  onSort,
  className = '',
}: {
  label: string;
  column: Exclude<BomSortColumn, 'sortOrder'>;
  sortDescriptor: SortDescriptor;
  onSort: (column: Exclude<BomSortColumn, 'sortOrder'>) => void;
  className?: string;
}) {
  const active = String(sortDescriptor.column) === column;
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-0.5 text-xs font-semibold text-default-500 hover:text-default-700 transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <span>{label}</span>
      <DynamicIcon
        name={getBomSortIconName(column, sortDescriptor)}
        size={12}
        className={active ? 'opacity-100 text-default-700' : 'opacity-0'}
      />
    </button>
  );
}

export function BomSection({
  form,
  components,
  units,
  isGood,
  isKit,
  isAdmin,
  kitPortionCount,
  packageRatioInvalid,
  weightFieldInvalid,
  bomQuery,
  bomSuggestions,
  editingNoteIdx,
  noteDeleteConfirmIdx,
  rowDeleteConfirm,
  bomWeightExpected,
  canFillWeightFromBom,
  showExpectedWeightHint,
  specQtySuspicious,
  onOpenTechCard,
  onFormChange,
  onBomQueryChange,
  onAddComponent,
  onComponentsChange,
  onPatchKitComponents,
  onOpenNested,
  onEditingNoteIdx,
  onNoteDeleteConfirmIdx,
  onRowDeleteConfirm,
  onFillExpectedWeight,
  renamingComponentGoodId,
  onMoveParenthesesToNote,
  isReadOnly = false,
}: BomSectionProps) {
  const packCols = isAdmin ? (isKit ? '3' : '4') : isKit ? '2' : '3';
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>(BOM_MANUAL_SORT);
  const [listSortEnabled, setListSortEnabled] = useState(false);

  const sortedEntries = useMemo(
    () => sortBomEntries(components, sortDescriptor, units),
    [components, sortDescriptor, units]
  );
  const isManualSort = isBomManualSort(sortDescriptor);
  const listSortDisabled = !isManualSort;
  const canManualReorder = isManualSort && listSortEnabled && !isReadOnly;
  const showDragHandle = canManualReorder;

  const handleSortColumn = useCallback((column: Exclude<BomSortColumn, 'sortOrder'>) => {
    setSortDescriptor((prev) => nextBomSortDescriptor(prev, column));
  }, []);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || !canManualReorder) return;
      const from = result.source.index;
      const to = result.destination.index;
      if (from === to) return;
      const apply = isKit ? onPatchKitComponents : onComponentsChange;
      apply((prev) => reorderBomRows(prev, from, to));
      setSortDescriptor(BOM_MANUAL_SORT);
    },
    [canManualReorder, isKit, onPatchKitComponents, onComponentsChange]
  );

  const renderBomRow = (
    entry: BomRowEntry,
    displayIndex: number,
    dragHandleProps?: HTMLAttributes<HTMLElement>
  ) => {
    const { row: c, originalIdx: idx } = entry;
    const qtySuspicious =
      !isKit &&
      isSuspiciousBomIngredientQty(
        {
          qty: c.qty,
          unitId: c.unitId,
          componentWeight: c.componentWeight,
        },
        units
      );

    return (
      <div className="flex flex-col gap-1.5 [&:not(:last-child)]:border-b border-default-200/60 py-1.5">
        <div className="flex flex-wrap md:flex-nowrap items-center gap-2 gap-y-0.5">
          {showDragHandle && (
            <span
              {...dragHandleProps}
              className="hidden md:inline-flex touch-none text-default-300 h-8 w-4 items-center justify-center cursor-grab active:cursor-grabbing hover:text-default-500 shrink-0"
              title="Перетягнути для зміни порядку"
            >
              <DynamicIcon name="grip-vertical" size={14} />
            </span>
          )}
          <span className="text-sm font-semibold text-right min-w-5 tabular-nums">
            {displayIndex + 1}
          </span>
          <div
            className={`min-w-0 ${isKit ? 'w-[calc(100%-2rem)]' : 'w-[calc(100%-9rem)]'} sm:w-auto sm:flex-1 flex items-center gap-2 md:flex-wrap`}
          >
            {c.componentGoodId ? (
              <button
                type="button"
                className={`min-w-0 ${isKit ? 'w-full' : 'w-auto'} md:w-auto flex items-center gap-2 text-left hover:text-primary`}
                onClick={() => onOpenNested(c.componentGoodId)}
              >
                <span className="truncate text-sm hover:underline mr-auto md:mr-0">
                  {c.componentName}
                </span>
                {c.componentSku && (
                  <span className="font-mono text-xs text-default-400 px-1 py-0.5 bg-default-100 rounded">
                    {c.componentSku}
                  </span>
                )}
                <BomRowWeightHint
                  isKit={isKit}
                  accPolicyId={c.componentAccPolicyId}
                  weight={c.componentWeight}
                />
              </button>
            ) : (
              <>
                <span className="truncate text-sm">{c.componentName}</span>
                {c.componentSku && (
                  <span className="font-mono text-xs text-default-400 px-1 py-0.5 bg-default-100 rounded">
                    {c.componentSku}
                  </span>
                )}
                <BomRowWeightHint
                  isKit={isKit}
                  accPolicyId={c.componentAccPolicyId}
                  weight={c.componentWeight}
                />
              </>
            )}
            {!isKit && (
              <Popover
                placement="top-start"
                isOpen={editingNoteIdx === idx}
                onOpenChange={(open) => {
                  onEditingNoteIdx(open ? idx : null);
                  if (!open) onNoteDeleteConfirmIdx(null);
                }}
              >
                <PopoverTrigger>
                  <Button
                    size="sm"
                    variant="light"
                    color={c.note.trim() ? 'warning' : 'default'}
                    className={`min-w-0 h-6 px-1.5 -my-1.5 ${c.note.trim() ? 'text-warning-700' : 'text-default-400'}`}
                    aria-label={c.note.trim() ? 'Редагувати примітку' : 'Додати примітку'}
                    title={c.note.trim() ? 'Редагувати примітку' : 'Додати примітку'}
                    startContent={
                      <DynamicIcon
                        name={c.note.trim() ? 'message-circle-more' : 'message-circle-plus'}
                        size={14}
                        className="shrink-0"
                      />
                    }
                  />
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3">
                  <div className="flex flex-col gap-2 w-full">
                    <p className="text-xs font-medium text-default-600">Примітка до інгредієнта</p>
                    <Input
                      size="sm"
                      aria-label="Примітка"
                      placeholder="Текст примітки…"
                      value={c.note}
                      autoFocus
                      onValueChange={(v) =>
                        onComponentsChange((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, note: v.slice(0, 150) } : row))
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          onEditingNoteIdx(null);
                        }
                      }}
                      classNames={{
                        inputWrapper:
                          'border-1 border-default-200/50 bg-default-100/75! ring-0! group-data-[focus-visible=true]:ring-offset-0!',
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        className="bg-neutral-600/75 text-neutral-50"
                        onPress={() => {
                          onNoteDeleteConfirmIdx(null);
                          onEditingNoteIdx(null);
                        }}
                      >
                        {c.note.trim() ? 'Редагувати' : 'Додати'}
                      </Button>
                      <Tooltip
                        content="Перенести текст у дужках з назви інгредієнта до примітки та прибрати його з назви"
                        classNames={{ content: 'text-xs max-w-56' }}
                      >
                        <Button
                          size="sm"
                          variant="light"
                          isIconOnly
                          aria-label="Перенести текст з дужок до примітки"
                          isDisabled={
                            isReadOnly ||
                            renamingComponentGoodId === c.componentGoodId ||
                            !hasParenthesizedTextInName(c.componentName)
                          }
                          className="h-8 min-w-8"
                          onPress={() => {
                            void onMoveParenthesesToNote(idx);
                            onNoteDeleteConfirmIdx(null);
                          }}
                        >
                          <DynamicIcon
                            name={
                              renamingComponentGoodId === c.componentGoodId
                                ? 'loader-circle'
                                : 'parentheses'
                            }
                            size={14}
                            className={
                              renamingComponentGoodId === c.componentGoodId ? 'animate-spin' : ''
                            }
                          />
                        </Button>
                      </Tooltip>
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        aria-label={
                          noteDeleteConfirmIdx === idx
                            ? 'Підтвердити видалення примітки'
                            : 'Видалити примітку'
                        }
                        isDisabled={!c.note.trim()}
                        className="h-8 min-w-8 gap-0 overflow-hidden px-2.5 transition-[min-width,padding] duration-200 ease-out"
                        onPress={() => {
                          if (noteDeleteConfirmIdx !== idx) {
                            onNoteDeleteConfirmIdx(idx);
                            return;
                          }
                          onComponentsChange((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, note: '' } : row))
                          );
                          onNoteDeleteConfirmIdx(null);
                          onEditingNoteIdx(null);
                        }}
                      >
                        <DynamicIcon name="trash-2" size={14} className="shrink-0" />
                        <span
                          className={[
                            'overflow-hidden whitespace-nowrap transition-all duration-200 ease-out',
                            noteDeleteConfirmIdx === idx
                              ? 'max-w-[4.5rem] opacity-100 ml-2'
                              : 'max-w-0 opacity-0 ml-0',
                          ].join(' ')}
                        >
                          Видалити?
                        </span>
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {isGood && (
            <NumberInputFromNumber
              size="sm"
              className="w-16 ml-7 sm:ml-0 shrink-0"
              aria-label="Втрати при готуванні, %"
              value={c.cookingLossPercent}
              min={0}
              max={100}
              decimalPlaces={1}
              trimTrailingZeros
              classNames={{
                inputWrapper: 'border-1 border-default-200',
              }}
              tooltip={{
                content: '% Втрат / Відходів',
                classNames: {
                  content: 'text-xs',
                },
              }}
              endContent={<span className="text-xs text-default-400">%</span>}
              isReadOnly={isReadOnly}
              onChange={(cookingLossPercent) =>
                onComponentsChange((prev) =>
                  prev.map((row, i) => (i === idx ? { ...row, cookingLossPercent } : row))
                )
              }
            />
          )}

          {!isKit ? (
            <div className="w-20 ml-7 sm:ml-0 order-last sm:order-none">
              <NumberInputFromNumber
                size="sm"
                aria-label="Кількість"
                value={c.qty || 0}
                min={0}
                decimalPlaces={3}
                isInvalid={c.qty <= 0}
                color={qtySuspicious ? 'danger' : 'default'}
                classNames={{
                  inputWrapper: `border-1 ${
                    qtySuspicious
                      ? 'bg-danger-50 border-danger-500 data-[hover=true]:bg-danger-50/75 data-[focus=true]:bg-danger-50/75'
                      : 'border-default-200'
                  }`,
                }}
                tooltip={{
                  content:
                    'Помічено аномальне значення ваги інгредієнта. Перевірте значення, можливо, обрана невірна одиниця виміру.',
                  isDisabled: !qtySuspicious,
                  classNames: {
                    base: 'before:bg-danger before:rounded-[2px] before:z-10',
                    content:
                      'bg-danger border-0 px-2.5 py-2 text-danger-foreground text-xs max-w-xs shadow-sm rounded-md',
                  },
                }}
                trimTrailingZeros
                onChange={(qty) =>
                  onComponentsChange((prev) =>
                    prev.map((row, i) => (i === idx ? { ...row, qty } : row))
                  )
                }
              />
            </div>
          ) : (
            <StepperInput
              size="xs"
              className="w-28 ml-7 sm:ml-4"
              inputClassName="text-sm"
              aria-label="Кількість"
              value={c.qty || 0}
              onChange={(v) =>
                onPatchKitComponents((prev) =>
                  prev.map((row, i) => (i === idx ? { ...row, qty: v } : row))
                )
              }
              onIncrement={() =>
                onPatchKitComponents((prev) =>
                  prev.map((row, i) => (i === idx ? { ...row, qty: row.qty + 1 } : row))
                )
              }
              onDecrement={() =>
                onPatchKitComponents((prev) =>
                  prev.map((row, i) =>
                    i === idx ? { ...row, qty: Math.max(0, row.qty - 1) } : row
                  )
                )
              }
            />
          )}
          {!isKit && (
            <Select
              aria-label="Од. виміру"
              size="sm"
              classNames={{
                base: 'w-20 order-last sm:order-none',
                trigger: 'border-1 border-default-200',
                popoverContent: 'bg-default-100 min-w-28',
              }}
              selectedKeys={c.unitId ? [c.unitId] : []}
              onSelectionChange={(keys) => {
                const v = Array.from(keys)[0];
                if (!v) return;
                onComponentsChange((prev) =>
                  prev.map((row, i) => (i === idx ? { ...row, unitId: String(v) } : row))
                );
              }}
            >
              {units.map((u) => (
                <SelectItem key={u.id}>{u.name}</SelectItem>
              ))}
            </Select>
          )}
          <RowDeleteButton
            ariaLabel="Видалити компонент"
            className="ml-auto md:ml-0"
            confirming={rowDeleteConfirm?.kind === 'component' && rowDeleteConfirm.idx === idx}
            onRequest={() => onRowDeleteConfirm({ kind: 'component', idx })}
            onConfirm={() => {
              const removeRow = (prev: BomRow[]) => prev.filter((_, i) => i !== idx);
              if (isKit) onPatchKitComponents(removeRow);
              else onComponentsChange(removeRow);
              onRowDeleteConfirm(null);
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <Divider className="bg-default-200/60" />
      <section className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1">
          <DynamicIcon name="scaling" size={14} />
          <span>Упаковка</span>
        </h3>
        <div className={`grid gap-3 grid-cols-2 md:grid-cols-${packCols}`}>
          <Select
            label="Од. виміру"
            selectedKeys={form.mainUnitId ? [form.mainUnitId] : []}
            classNames={{ popoverContent: 'bg-default-100' }}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0];
              if (v) onFormChange((f) => ({ ...f, mainUnitId: String(v) }));
            }}
          >
            {units.map((u) => (
              <SelectItem key={u.id}>{u.name}</SelectItem>
            ))}
          </Select>
          {isGood && (
            <NumberInput
              label="Порцій в коробці"
              value={form.packageRatio}
              decimalPlaces={0}
              min={1}
              isRequired={isGood}
              isInvalid={packageRatioInvalid}
              color={packageRatioInvalid ? 'danger' : 'default'}
              errorMessage={packageRatioInvalid ? 'Має бути більше 0' : undefined}
              onValueChange={(v) => onFormChange((f) => ({ ...f, packageRatio: v }))}
            />
          )}
          <div className="min-w-0">
            <NumberInput
              label="Вага, кг"
              value={form.weight}
              decimalPlaces={3}
              min={0}
              max={20}
              step={0.01}
              isRequired={isGood || isKit}
              isInvalid={weightFieldInvalid}
              color="default"
              errorMessage={weightFieldInvalid ? 'Має бути більше 0' : undefined}
              onValueChange={(v) => onFormChange((f) => ({ ...f, weight: v }))}
            />
            {bomWeightExpected && (showExpectedWeightHint || bomWeightExpected.missingCount > 0) && (
              <div className="mt-1 flex flex-col gap-1">
                {showExpectedWeightHint && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-warning-700">
                      Очікується {formatWeightKg(bomWeightExpected.kg, 2)}&nbsp;кг
                    </span>
                    {canFillWeightFromBom && (
                      <Button
                        size="sm"
                        variant="flat"
                        color="warning"
                        className="h-5 min-w-0 px-1.5 text-[11px] rounded"
                        onPress={onFillExpectedWeight}
                      >
                        Заповнити
                      </Button>
                    )}
                  </div>
                )}
                {bomWeightExpected.missingCount > 0 && (
                  <span className="text-xs text-warning-700">
                    У деяких позицій не вказана вага
                  </span>
                )}
              </div>
            )}
          </div>
          {isAdmin && (
            <NumberInput
              className="md:max-w-xs"
              label="Коефіцієнт (unitRatio)"
              value={form.unitRatio}
              decimalPlaces={3}
              min={0}
              step={0.05}
              trimTrailingZeros
              onValueChange={(v) => onFormChange((f) => ({ ...f, unitRatio: v }))}
            />
          )}
        </div>
      </section>

      <Divider className="bg-default-200/60" />
      <section className="flex flex-col gap-1 md:gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 gap-y-2 mb-3 md:mb-0">
          <h3 className="text-sm font-semibold flex items-center gap-1">
            {isGood ? (
              <div className="flex items-center gap-1">
                <DynamicIcon name="file-text" size={14} />
                <span>Специфікація товару</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <DynamicIcon name="package-2" size={14} />
                <span>Склад комплекту</span>
              </div>
            )}
            {components.length > 0 && (
              <span className="font-normal text-default-400">
                {isKit
                  ? `(${components.length} поз. / ${kitPortionCount} ${pluralize(kitPortionCount, 'порція', 'порції', 'порцій')})`
                  : `(${components.length} поз.)`}
              </span>
            )}
          </h3>
          {isGood && (
            <div className="flex flex-wrap items-center gap-2 ml-4.5 md:ml-auto">
              <span className="text-sm font-semibold whitespace-nowrap">Розрахунок на</span>
              <NumberInput
                aria-label="Розрахунок на, шт."
                size="sm"
                min={1}
                decimalPlaces={0}
                emptyOnBlur="min"
                value={form.specQty}
                color={specQtySuspicious ? 'danger' : 'default'}
                classNames={{
                  base: 'w-20',
                  inputWrapper: `border-1 ${specQtySuspicious ? 'bg-danger-50 border-danger-500 data-[hover=true]:bg-danger-50/75 data-[focus=true]:bg-danger-50/75' : 'border-default-200 data-[hover=true]:bg-default-50 data-[focus=true]:bg-default-50'}`,
                }}
                tooltip={{
                  content: "Ймовірно, неправильно вказано «Розрахунок на». Перевірте значення – через це не вдається порахувати вагу порції.",
                  isDisabled: !specQtySuspicious,
                  classNames: {
                    base: 'before:bg-danger before:rounded-[2px]',
                    content: 'bg-danger border-0 px-2.5 py-2 text-danger-foreground text-xs max-w-xs shadow-sm rounded-md',
                  },
                }}
                onValueChange={(v) => onFormChange((f) => ({ ...f, specQty: v }))}
              />
              <span className="text-sm text-default-500">шт.</span>
              
              <Button
                size="sm"
                variant="flat"
                color="primary"
                data-btn-tone="primary-blue-flat"
                className="h-8 min-w-6 gap-1 text-sm"
                isDisabled={components.length === 0 || isReadOnly}
                startContent={<DynamicIcon name="file-text" size={14} />}
                onPress={onOpenTechCard}
              >
                Техкарта
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 mb-4 md:mb-0">
          <Input
            aria-label="Додати компонент"
            placeholder={
              isKit
                ? `Пошук товарів в категорії «${CATALOG_FINISHED_PRODUCTS_FOLDER_NAME}» (за назвою або sku)`
                : 'Почніть пошук щоб додати компонент (за назвою або sku)'
            }
            classNames={{
              inputWrapper: 'border-1 border-default-200/75',
              input: 'placeholder:text-default-400/75',
            }}
            value={bomQuery}
            onValueChange={onBomQueryChange}
            isClearable
            startContent={<DynamicIcon name="search" size={14} />}
          />
          {bomSuggestions.length > 0 && (
            <div className="max-h-46 overflow-y-auto rounded-sm border border-default-200">
              {bomSuggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="grid grid-cols-[auto_40px] gap-2 w-full items-center justify-between px-3 py-2 text-left text-sm leading-tight hover:bg-default-200/50 [&:not(:last-child)]:border-b border-default-200/50"
                  onClick={() => onAddComponent(s)}
                >
                  <span>{s.name}</span>
                  <span className="font-mono text-xs text-default-400">{s.sku}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {components.length > 0 && (
          <div className="hidden md:flex flex-nowrap items-center gap-2 px-0.5 py-2 rounded-md bg-default-100 -mb-2">
            {showDragHandle && <span className="w-4 shrink-0" aria-hidden />}
            <span className="text-xs font-semibold text-default-500 text-right min-w-4.5 tabular-nums">
              #
            </span>
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <BomSortableHeader
                label={isKit ? 'Назва товару' : 'Назва інгредієнта'}
                column="name"
                sortDescriptor={sortDescriptor}
                onSort={handleSortColumn}
              />
              <Tooltip
                content={
                  listSortDisabled
                    ? 'Спочатку скиньте сортування колонок'
                    : listSortEnabled
                      ? 'Вимкнути ручне сортування'
                      : 'Увімкнути ручне сортування перетягуванням'
                }
                classNames={{ content: 'text-xs max-w-52' }}
              >
                <Button
                  size="sm"
                  isDisabled={listSortDisabled || isReadOnly}
                  aria-label="Ручне сортування"
                  aria-pressed={listSortEnabled && !listSortDisabled}
                  className={`h-6 min-w-6 gap-1 pl-2 pr-2.5 ${
                    listSortEnabled && !listSortDisabled
                      ? 'bg-slate-600 text-slate-100'
                      : 'bg-default-200/60 text-default-400'
                  }`}
                  onPress={() => setListSortEnabled((value) => !value)}
                  startContent={<DynamicIcon name="arrow-up-down" size={12} />}
                >
                  Ручне сортування
                </Button>
              </Tooltip>
              {!isManualSort && (
                <Tooltip content="Повернутися до ручного сортування" classNames={{ content: 'text-xs' }}>
                  <Button
                    size="sm"
                    variant="flat"
                    className="h-6 min-w-0 px-2 text-[11px] gap-1 bg-yellow-400/70 text-slate-900"
                    startContent={<DynamicIcon name="rotate-ccw" size={12} />}
                    onPress={() => setSortDescriptor(BOM_MANUAL_SORT)}
                  >
                    Скинути сортування
                  </Button>
                </Tooltip>
              )}
            </div>
            {!isKit && <span className="w-6 shrink-0" aria-hidden />}
            {isGood && (
              <BomSortableHeader
                label="Втрати"
                column="loss"
                sortDescriptor={sortDescriptor}
                onSort={handleSortColumn}
                className="w-16 justify-center"
              />
            )}
            <BomSortableHeader
              label="Кількість"
              column="qty"
              sortDescriptor={sortDescriptor}
              onSort={handleSortColumn}
              className={`${isKit ? 'w-28' : 'w-20'} justify-center`}
            />
            {!isKit && (
              <BomSortableHeader
                label="Од. вим."
                column="unit"
                sortDescriptor={sortDescriptor}
                onSort={handleSortColumn}
                className="w-20 justify-center"
              />
            )}
            <span className="w-8 shrink-0" aria-hidden />
          </div>
        )}
        {components.length > 0 && (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="bom-components" isDropDisabled={!canManualReorder}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {sortedEntries.map((entry, displayIndex) => (
                    <Draggable
                      key={`${entry.row.componentGoodId}-${entry.originalIdx}`}
                      draggableId={`${entry.row.componentGoodId}-${entry.originalIdx}`}
                      index={displayIndex}
                      isDragDisabled={!canManualReorder}
                    >
                      {(dragProvided, snapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={snapshot.isDragging ? 'bg-default-100 shadow-sm rounded-md' : undefined}
                        >
                          {renderBomRow(
                            entry,
                            displayIndex,
                            canManualReorder ? dragProvided.dragHandleProps : undefined
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
        )}
      </section>
    </>
  );
}

export function newBomRowFromSearch(hit: CatalogSearchHit, mainUnitId: string): BomRow {
  return {
    componentGoodId: hit.id,
    componentName: hit.name,
    componentSku: hit.sku,
    qty: 1,
    unitId: mainUnitId || CATALOG_DEFAULT_MAIN_UNIT_ID,
    note: '',
    componentWeight: hit.weight ?? null,
    componentAccPolicyId: hit.accPolicyId ?? null,
    cookingLossPercent: 0,
  };
}
