import { Button, Popover, PopoverContent, PopoverTrigger, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useMemo, useState } from 'react';
import { NumberInputFromNumber } from '@/components/NumberInput';
import type { CatalogLossEntry, CatalogLossFormula, ProductionLossType } from '@shared/types/production';
import {
  effectiveLossPercent,
  isLossSplitValid,
  normalizeLossEntries,
  sumLossPercent,
} from '@shared/utils/catalogLoss';

interface BomLossSplitPopoverProps {
  /** Сира розбивка рядка (під час редагування може містити 0%) */
  losses: CatalogLossEntry[] | null | undefined;
  cookingLossPercent: number;
  lossTypes: ProductionLossType[];
  lossFormula: CatalogLossFormula;
  isReadOnly: boolean;
  onChange: (next: { losses: CatalogLossEntry[] | null; cookingLossPercent: number }) => void;
}

const INPUT_WRAPPER_CLASS =
  'border-1 border-default-200/50 bg-default-100/75! ring-0! group-data-[focus-visible=true]:ring-offset-0!';

function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('uk-UA', { maximumFractionDigits: 2 })}%`;
}

/** Чи має рядок розбивку втрат (хоча б один запис, навіть з 0% під час редагування). */
export function hasLossSplit(losses: CatalogLossEntry[] | null | undefined): boolean {
  return (losses?.length ?? 0) > 0;
}

/**
 * Суфікс поля «Втрати» + Popover розбивки за типами.
 * Без розбивки: «%», при наведенні – іконка `split`. З розбивкою: завжди `split`.
 */
export function BomLossSplitPopover({
  losses,
  cookingLossPercent,
  lossTypes,
  lossFormula,
  isReadOnly,
  onChange,
}: BomLossSplitPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const entries = losses ?? [];
  const isSplit = entries.length > 0;

  const typeById = useMemo(() => new Map(lossTypes.map((t) => [t.id, t])), [lossTypes]);
  const usedTypeIds = new Set(entries.map((e) => e.typeId));
  const freeTypes = lossTypes.filter((t) => t.isActive && !usedTypeIds.has(t.id));

  const normalized = normalizeLossEntries(entries);
  const total = sumLossPercent(normalized);
  const effective = effectiveLossPercent({ losses: normalized }, lossFormula);
  const isValid = isLossSplitValid(normalized, lossFormula);

  const emit = (next: CatalogLossEntry[]) => {
    if (next.length === 0) {
      // Без розбивки поле знову редагується вручну, сума лишається.
      onChange({ losses: null, cookingLossPercent });
      return;
    }
    onChange({ losses: next, cookingLossPercent: sumLossPercent(normalizeLossEntries(next)) });
  };

  const addEntry = () => {
    const type = freeTypes[0];
    if (!type) return;
    // Перший тип отримує поточне значення поля, щоб сума не «стрибнула» до 0.
    const percent = isSplit ? 0 : cookingLossPercent;
    emit([...entries, { typeId: type.id, percent }]);
  };

  if (!isSplit && isReadOnly) {
    return <span className="text-xs text-default-400">%</span>;
  }

  return (
    <Popover placement="bottom" isOpen={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <button
          type="button"
          className="group/split inline-flex h-5 w-5 items-center justify-center rounded text-xs text-default-400 hover:text-default-700 focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={isSplit ? 'Розбивка втрат за типами' : 'Розділити втрати за типами'}
          title={isSplit ? 'Розбивка втрат за типами' : 'Розділити втрати за типами'}
        >
          {isSplit ? (
            <DynamicIcon name="split" size={14} className="text-default-600" />
          ) : (
            <>
              <span className="group-hover/split:hidden group-focus-visible/split:hidden">%</span>
              <DynamicIcon
                name="split"
                size={14}
                className="hidden group-hover/split:inline group-focus-visible/split:inline"
              />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3">
        <div className="flex flex-col gap-2 w-full">
          <p className="text-xs font-medium text-default-600">Типи втрат</p>

          {entries.length === 0 && (
            <p className="text-xs text-default-500">
              Розділіть загальні втрати на окремі типи, наприклад очистка і розсип.
            </p>
          )}

          {entries.map((entry, idx) => {
            const current = typeById.get(entry.typeId);
            const options = lossTypes.filter(
              (t) => t.id === entry.typeId || (t.isActive && !usedTypeIds.has(t.id))
            );
            return (
              <div key={`${entry.typeId}-${idx}`} className="flex items-center gap-2">
                <Select
                  size="sm"
                  aria-label="Тип втрат"
                  className="flex-1 min-w-0"
                  selectedKeys={[String(entry.typeId)]}
                  isDisabled={isReadOnly}
                  classNames={{ trigger: INPUT_WRAPPER_CLASS }}
                  onSelectionChange={(keys) => {
                    const typeId = Number(Array.from(keys)[0]);
                    if (!Number.isInteger(typeId)) return;
                    emit(entries.map((e, i) => (i === idx ? { ...e, typeId } : e)));
                  }}
                >
                  {options.map((t) => (
                    <SelectItem key={String(t.id)}>{t.isActive ? t.name : `${t.name} (неактивний)`}</SelectItem>
                  ))}
                </Select>
                {!current && <span className="sr-only">Тип #{entry.typeId}</span>}
                <NumberInputFromNumber
                  size="sm"
                  aria-label="Втрати цього типу, %"
                  className="w-20 shrink-0"
                  value={entry.percent}
                  min={0}
                  max={100}
                  decimalPlaces={1}
                  trimTrailingZeros
                  isReadOnly={isReadOnly}
                  autoFocus={idx === entries.length - 1 && entry.percent === 0}
                  classNames={{ inputWrapper: INPUT_WRAPPER_CLASS }}
                  endContent={<span className="text-xs text-default-400">%</span>}
                  onChange={(percent) =>
                    emit(entries.map((e, i) => (i === idx ? { ...e, percent } : e)))
                  }
                />
                {!isReadOnly && (
                  <Button
                    size="sm"
                    variant="light"
                    color="danger"
                    isIconOnly
                    aria-label="Прибрати тип втрат"
                    className="h-8 min-w-8 shrink-0"
                    onPress={() => emit(entries.filter((_, i) => i !== idx))}
                  >
                    <DynamicIcon name="x" size={14} />
                  </Button>
                )}
              </div>
            );
          })}

          {!isReadOnly && (
            <Button
              size="sm"
              variant="light"
              className="self-start h-7 px-2 text-default-600"
              isDisabled={freeTypes.length === 0}
              startContent={<DynamicIcon name="plus" size={14} />}
              onPress={addEntry}
            >
              {lossTypes.length === 0 ? 'Типи втрат не налаштовано' : 'Додати тип'}
            </Button>
          )}

          {isSplit && (
            <div className="flex flex-col gap-0.5 border-t border-default-200 pt-2 text-xs">
              <div className="flex justify-between text-default-600">
                <span>Разом</span>
                <span className="tabular-nums font-medium">{formatPercent(total)}</span>
              </div>
              {lossFormula === 'sequential' && (
                <div className="flex justify-between text-default-500">
                  <span>Ефективно (послідовна формула)</span>
                  <span className="tabular-nums">{formatPercent(effective)}</span>
                </div>
              )}
              {!isValid && (
                <p className="text-danger">Сума втрат має бути менша за 100%, інакше брутто не порахувати.</p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
