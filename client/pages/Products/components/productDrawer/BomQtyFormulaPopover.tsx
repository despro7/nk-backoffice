import { Button, Popover, PopoverContent, PopoverTrigger, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState } from 'react';
import { NumberInputFromNumber } from '@/components/NumberInput';
import type { CatalogQtyFormula } from '@shared/types/catalog';
import { bomRowGrossKg } from '@shared/utils/catalogBomWeight';
import {
  derivedBatchQty,
  derivedSpecQty,
  kgPerRowUnit,
  normalizeBatchPortions,
  normalizeQtyFormula,
  qtyFormulaSourceError,
} from '@shared/utils/catalogQtyFormula';
import type { BomRow } from './productDrawerTypes';

type UnitLike = { id: string; name: string; code?: string | null };

interface BomQtyFormulaPopoverProps {
  row: BomRow;
  rows: BomRow[];
  units: UnitLike[];
  specQty: number;
  /** «Розрахунок на N порцій» з техкарти */
  batchPortions: number;
  isReadOnly: boolean;
  onChange: (formula: CatalogQtyFormula | null) => void;
}

const INPUT_WRAPPER_CLASS =
  'border-1 border-default-200/50 bg-default-100/75! ring-0! group-data-[focus-visible=true]:ring-offset-0!';

function fmt(value: number, digits = 3): string {
  return value.toLocaleString('uk-UA', { maximumFractionDigits: digits });
}

/** Підсумок на варку – у кг / л замість г / мл (55 000 г → 55 кг). */
function batchDisplayUnit(unitName: string): { name: string; divisor: number } {
  const u = unitName.trim().toLowerCase().replace(/\./g, '');
  if (/^(мл|ml|мілілітр)/.test(u)) return { name: 'л', divisor: 1000 };
  if (/^(г|гр|грам|g)$/.test(u) || /^грам/.test(u)) return { name: 'кг', divisor: 1000 };
  return { name: unitName, divisor: 1 };
}

function rowLabel(row: BomRow): string {
  const name = row.componentName || row.componentGoodId;
  return row.note?.trim() ? `${name} (${row.note.trim()})` : name;
}

/** Помилка формули рядка (немає джерела тощо); null – формули немає або вона коректна. */
export function bomQtyFormulaError(row: BomRow, rows: BomRow[], units: UnitLike[]): string | null {
  return qtyFormulaSourceError(row, rows, units);
}

/**
 * Суфікс поля «Кількість» + Popover похідної кількості: `на варку = k · нетто джерела (кг) + b`.
 * Без формули – бліда іконка, з формулою – виразна; кількість тоді рахується сама.
 */
export function BomQtyFormulaPopover({
  row,
  rows,
  units,
  specQty,
  batchPortions,
  isReadOnly,
  onChange,
}: BomQtyFormulaPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const formula = normalizeQtyFormula(row.qtyFormula);
  const error = formula ? qtyFormulaSourceError(row, rows, units) : null;
  const n = normalizeBatchPortions(batchPortions);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const unitName = unitById.get(row.unitId)?.name?.trim() || '';

  const sources = rows.filter((r) => r.rowKey && r.rowKey !== row.rowKey && !normalizeQtyFormula(r.qtyFormula));
  const source = formula ? rows.find((r) => r.rowKey === formula.sourceRowKey) : undefined;

  // Джерело на варку в одиницях цього рядка (55 кг картоплі → 55 000 мл для рядка в мл)
  const sourceBatchInRowUnits = (() => {
    if (!source) return null;
    const kg = bomRowGrossKg(
      { qty: source.qty, unitId: source.unitId, componentWeight: source.componentWeight },
      unitById,
    );
    const rowKg = kgPerRowUnit(row, units);
    return kg == null || rowKg == null ? null : (kg * n) / (specQty > 0 ? specQty : 1) / rowKg;
  })();
  const unitSuffix = unitName ? ` ${unitName}` : '';
  const batchUnit = batchDisplayUnit(unitName);
  const batchSuffix = batchUnit.name ? ` ${batchUnit.name}` : '';
  const toBatch = (value: number) => value / batchUnit.divisor;
  const perSpec = formula && !error ? derivedSpecQty(row, rows, units, specQty, n) : null;

  if (!formula && isReadOnly) return null;

  const patch = (next: Partial<CatalogQtyFormula>) => {
    if (!formula) return;
    onChange({ ...formula, ...next });
  };

  return (
    <Popover placement="bottom" isOpen={isOpen} onOpenChange={setIsOpen} shouldCloseOnScroll={false}>
      <PopoverTrigger>
        <button
          type="button"
          className={`inline-flex h-5 w-5 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-primary ${
            error
              ? 'text-danger'
              : formula
                ? 'text-default-700'
                : 'text-default-300 hover:text-default-700'
          }`}
          aria-label={formula ? 'Формула кількості' : 'Задати кількість формулою'}
          title={error ?? (formula ? 'Формула кількості' : 'Задати кількість формулою')}
        >
          <DynamicIcon name="sigma" size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-3">
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-default-900">Кількість за формулою</p>
            <p className="text-xs text-default-600">
              {rowLabel(row)} = k × {source ? rowLabel(source) : 'джерело'} + b
            </p>
            <details className="group text-xs text-default-500">
              <summary className="w-fit cursor-pointer list-none text-default-400 hover:text-default-600 [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1">
                  <DynamicIcon name="chevron-right" size={12} className="transition-transform group-open:rotate-90" />
                  Як це працює
                </span>
              </summary>
              <div className="mt-1 flex flex-col gap-1 pl-4">
                <p>k – коефіцієнт: у скільки разів більше за джерело, росте з кількістю порцій.</p>
                <p>b – фіксована добавка на всю варку (котел), від порцій не залежить.</p>
                <p>Приклад: води в 1,3 раза більше за картоплю і ще 3 л на котел: k = 1,3, b = 3 л.</p>
                <p>Одиниці джерела (г, кг) перераховуються автоматично.</p>
              </div>
            </details>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-default-500">Джерело</span>
            <Select
              size="sm"
              aria-label="Інгредієнт-джерело"
              placeholder="Оберіть інгредієнт"
              selectedKeys={formula ? [formula.sourceRowKey] : []}
              isDisabled={isReadOnly}
              classNames={{ trigger: INPUT_WRAPPER_CLASS }}
              onSelectionChange={(keys) => {
                const key = String(Array.from(keys)[0] ?? '');
                if (!key) return;
                onChange(formula ? { ...formula, sourceRowKey: key } : { sourceRowKey: key, k: 1, b: 0 });
              }}
            >
              {sources.map((r) => (
                <SelectItem key={r.rowKey as string}>{rowLabel(r)}</SelectItem>
              ))}
            </Select>
          </div>

          {formula && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-default-500">k, коефіцієнт</span>
                <NumberInputFromNumber
                  size="sm"
                  aria-label="Коефіцієнт k"
                  value={formula.k}
                  min={0}
                  decimalPlaces={4}
                  trimTrailingZeros
                  isReadOnly={isReadOnly}
                  classNames={{ inputWrapper: INPUT_WRAPPER_CLASS }}
                  startContent={<span className="text-xs text-default-400">×</span>}
                  onChange={(k) => patch({ k })}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-default-500">b, на варку</span>
                <NumberInputFromNumber
                  size="sm"
                  aria-label="Постійна добавка b на всю варку"
                  value={formula.b}
                  decimalPlaces={3}
                  trimTrailingZeros
                  allowNegative
                  isReadOnly={isReadOnly}
                  classNames={{ inputWrapper: INPUT_WRAPPER_CLASS }}
                  startContent={<span className="text-xs text-default-400">+</span>}
                  endContent={unitName ? <span className="text-xs text-default-400">{unitName}</span> : undefined}
                  onChange={(b) => patch({ b })}
                />
              </div>
            </div>
          )}

          {formula && error && (
            <p className="rounded-md bg-danger-50 px-2.5 py-2 text-xs text-danger">{error}</p>
          )}

          {formula && !error && perSpec != null && (
            <div className="flex flex-col gap-1.5 rounded-md bg-default-100 px-2.5 py-2">
              {source && sourceBatchInRowUnits != null && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-default-500" title="N – «Розрахунок на N порцій» у техкарті">
                    На {fmt(n, 0)} порцій
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block text-sm font-semibold text-default-900">
                      {fmt(toBatch(derivedBatchQty(formula, sourceBatchInRowUnits)))}
                      {batchSuffix}
                    </span>
                    <span className="block text-[11px] text-default-400">
                      {fmt(toBatch(sourceBatchInRowUnits))} × {fmt(formula.k, 4)} + {fmt(toBatch(formula.b))}
                      {batchSuffix}
                    </span>
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 border-t border-default-200 pt-1.5">
                <span className="text-xs text-default-500">
                  {specQty > 1 ? `У специфікацію, на ${fmt(specQty, 0)} шт.` : 'На порцію'}
                </span>
                <span className="text-sm font-semibold tabular-nums text-default-900">
                  {fmt(perSpec, 6)}
                  {unitSuffix}
                </span>
              </div>
            </div>
          )}

          {formula && !isReadOnly && (
            <Button
              size="sm"
              variant="light"
              color="danger"
              className="h-7 min-w-0 self-start gap-1 px-2.5"
              startContent={<DynamicIcon name="x" size={14} />}
              onPress={() => {
                onChange(null);
                setIsOpen(false);
              }}
            >
              Прибрати формулу
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
