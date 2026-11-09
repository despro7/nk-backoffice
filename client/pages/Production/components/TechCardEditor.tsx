import { useEffect, useState, type ReactNode } from 'react';
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Divider,
  Input,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { NumberInputFromNumber } from '@/components/NumberInput';
import { DurationHmField } from './DurationHmField';
import { DescriptionEditor } from '@/pages/Products/components/DescriptionEditor';
import type {
  CatalogLossFormula,
  TechCardDetailDto,
  TechCardDosingFraction,
  TechCardPackagingBasis,
  TechCardPackagingRow,
  TechCardPayload,
  TechCardStage,
} from '@shared/types/production';
import { newRowKey } from '@shared/utils/catalogRowKey';
import { PACKAGING_BASIS_LABELS, TechCardCoverageNotice } from './TechCardRecipeView';
import { fractionKg, formatGrams, stageOutputsKg, type SpecRowOption } from './techCardRecipe';

const INPUT_CLASS = { inputWrapper: 'border-1 border-default-200' };
const SELECT_CLASS = { base: 'min-w-0', trigger: 'border-1 border-default-200' };
/** Мультиселект рядків/етапів: вищий список, без scroll shadow, виразно позначені вибрані пункти. */
const MULTI_SELECT_PROPS = {
  selectionMode: 'multiple' as const,
  classNames: SELECT_CLASS,
  maxListboxHeight: 420,
  scrollShadowProps: { isEnabled: false },
  listboxProps: {
    itemClasses: {
      base: 'data-[selected=true]:bg-blue-100 data-[selected=true]:text-blue-900 data-[selected=true]:font-medium data-[selected=true]:data-[hover=true]:bg-blue-200 dark:data-[selected=true]:bg-blue-500/25 dark:data-[selected=true]:text-blue-100 dark:data-[selected=true]:data-[hover=true]:bg-blue-500/35',
      selectedIcon: 'text-blue-600',
    },
  },
};
const FORMULA_LABELS: Record<CatalogLossFormula, string> = { additive: 'адитивна', sequential: 'послідовна' };
const GLOBAL = 'global';

type GoodNames = TechCardDetailDto['goodNames'];

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-default-900">
        <DynamicIcon name={icon} size={16} className="text-default-500" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Поле етапу: маленька сіра мітка над полем, як у «Опис техпроцесу». */
function Field({ label, hint, children }: { label: string; hint?: string | null; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-default-500">
        {label}
        {hint && <span className="text-default-400">{` ${hint}`}</span>}
      </span>
      {children}
    </div>
  );
}

function newStage(): TechCardStage {
  return {
    key: newRowKey(),
    name: '',
    description: null,
    durationMin: null,
    offsetMin: null,
    equipment: null,
    mode: null,
    inputRowKeys: [],
    inputStageKeys: [],
    outputName: null,
    yieldPercent: null,
  };
}

const textOrNull = (value: string) => (value.trim() ? value : null);

interface SearchHit {
  id: string;
  name: string;
  sku: string | null;
  /** Вага з каталогу, кг */
  weight: number | null;
}

/** Пошук матеріалу пакування в каталозі. */
function PackagingGoodPicker({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/catalog/search?${new URLSearchParams({ q }).toString()}`, { credentials: 'include' })
        .then((res) => res.json())
        .then((json) => {
          if (cancelled) return;
          const rows = Array.isArray(json?.data) ? json.data : [];
          setItems(
            rows
              .filter((r: { isGroup?: boolean }) => !r.isGroup)
              .map((r: SearchHit) => ({ id: r.id, name: r.name, sku: r.sku ?? null, weight: r.weight ?? null })),
          );
        })
        .catch(() => !cancelled && setItems([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <Autocomplete
      aria-label="Додати матеріал пакування"
      placeholder="Додати матеріал: назва або артикул"
      size="md"
      className="max-w-md"
      inputProps={{
        classNames: {
          inputWrapper: 'border-1 border-default-200',
        },
      }}
      inputValue={query}
      onInputChange={setQuery}
      isLoading={loading}
      items={items}
      startContent={<DynamicIcon name="search" size={14} className="text-default-400" />}
      listboxProps={{ emptyContent: query.trim().length < 2 ? 'Введіть 2+ символи' : 'Нічого не знайдено' }}
      onSelectionChange={(key) => {
        const hit = items.find((i) => i.id === key);
        if (!hit) return;
        onPick(hit);
        setQuery('');
        setItems([]);
      }}
    >
      {(item) => (
        <AutocompleteItem key={item.id} textValue={item.name}>
          <span className="truncate">{item.name}</span>
          {item.sku && <span className="ml-2 text-xs text-default-400">{item.sku}</span>}
        </AutocompleteItem>
      )}
    </Autocomplete>
  );
}

interface StageCardProps {
  stage: TechCardStage;
  index: number;
  previous: TechCardStage[];
  rows: SpecRowOption[];
  /** Рядки, вже взяті іншими етапами (рядок цілком в одному етапі) */
  takenRowKeys: Set<string>;
  outputKg: number | null;
  dragHandle: ReactNode;
  onChange: (next: TechCardStage) => void;
  onRemove: () => void;
}

function StageCard({ stage, index, previous, rows, takenRowKeys, outputKg, dragHandle, onChange, onRemove }: StageCardProps) {
  const set = <K extends keyof TechCardStage>(key: K, value: TechCardStage[K]) => onChange({ ...stage, [key]: value });
  const rowOptions = rows.filter((r) => !takenRowKeys.has(r.rowKey) || stage.inputRowKeys.includes(r.rowKey));

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-default-200/75 bg-content1 p-4">
      <div className="flex items-center gap-2">
        {dragHandle}
        <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-default-500">{index + 1}.</span>
        <Input
          size="md"
          aria-label="Назва етапу"
          placeholder="Назва етапу, напр. Бульйон"
          value={stage.name}
          isInvalid={!stage.name.trim()}
          classNames={INPUT_CLASS}
          onValueChange={(v) => set('name', v)}
        />
        <Button size="sm" variant="light" color="danger" isIconOnly aria-label="Видалити етап" onPress={onRemove}>
          <DynamicIcon name="trash-2" size={16} />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Інгредієнти">
          <Select
            size="md"
            aria-label="Інгредієнти"
            placeholder="Оберіть рядки специфікації"
            {...MULTI_SELECT_PROPS}
            selectedKeys={new Set(stage.inputRowKeys)}
            onSelectionChange={(keys) => set('inputRowKeys', Array.from(keys, String))}
          >
            {rowOptions.map((r) => (
              <SelectItem key={r.rowKey}>{r.name}</SelectItem>
            ))}
          </Select>
        </Field>
        <Field label="Виходи попередніх етапів">
          <Select
            size="md"
            aria-label="Виходи попередніх етапів"
            placeholder={previous.length === 0 ? 'Це перший етап' : 'Оберіть етапи'}
            {...MULTI_SELECT_PROPS}
            isDisabled={previous.length === 0}
            selectedKeys={new Set(stage.inputStageKeys)}
            onSelectionChange={(keys) => set('inputStageKeys', Array.from(keys, String))}
          >
            {previous.map((p, i) => (
              <SelectItem key={p.key}>{`${i + 1}. ${p.name || 'Без назви'}`}</SelectItem>
            ))}
          </Select>
        </Field>
        <DurationHmField
          label="Тривалість"
          minutes={stage.durationMin ?? 0}
          onMinutesChange={(m) => set('durationMin', m > 0 ? m : null)}
        />
        <DurationHmField
          label="Старт від початку варки"
          minutes={stage.offsetMin ?? 0}
          onMinutesChange={(m) => set('offsetMin', m > 0 ? m : null)}
        />
        <Field label="Обладнання">
          <Input
            size="md"
            aria-label="Обладнання"
            placeholder="Напр. котел 100 л"
            value={stage.equipment ?? ''}
            classNames={INPUT_CLASS}
            onValueChange={(v) => set('equipment', textOrNull(v))}
          />
        </Field>
        <Field label="Температура / режим">
          <Input
            size="md"
            aria-label="Температура / режим"
            placeholder="Напр. 95 °C, повільне кипіння"
            value={stage.mode ?? ''}
            classNames={INPUT_CLASS}
            onValueChange={(v) => set('mode', textOrNull(v))}
          />
        </Field>
        <Field label="Вихід (напівфабрикат)">
          <Input
            size="md"
            aria-label="Вихід (напівфабрикат)"
            placeholder="Напр. бульйон"
            value={stage.outputName ?? ''}
            classNames={INPUT_CLASS}
            onValueChange={(v) => set('outputName', textOrNull(v))}
          />
        </Field>
        <Field label="Вихід, %" hint={outputKg != null ? `≈ ${formatGrams(outputKg)} на порцію` : null}>
          <NumberInputFromNumber
            size="md"
            aria-label="Вихід, %"
            value={stage.yieldPercent ?? 0}
            min={0}
            max={1000}
            decimalPlaces={1}
            trimTrailingZeros
            classNames={INPUT_CLASS}
            onChange={(v) => set('yieldPercent', v > 0 ? v : null)}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-default-500">Опис техпроцесу</span>
        <DescriptionEditor
          value={stage.description ?? ''}
          blockFormat="simple"
          onChange={(html) => set('description', textOrNull(html))}
        />
      </div>
    </div>
  );
}

interface TechCardEditorProps {
  payload: TechCardPayload;
  rows: SpecRowOption[];
  goodNames: GoodNames;
  globalFormula: CatalogLossFormula;
  /** У специфікації є похідні рядки (рахуються на N порцій) */
  hasDerivedRows?: boolean;
  onChange: (next: TechCardPayload) => void;
  onGoodNamesChange: (next: GoodNames) => void;
}

/** Редагування рецепту: етапи, пакування, дозування, примітки, формула брутто. */
export function TechCardEditor({
  payload,
  rows,
  goodNames,
  globalFormula,
  hasDerivedRows = false,
  onChange,
  onGoodNamesChange,
}: TechCardEditorProps) {
  const set = <K extends keyof TechCardPayload>(key: K, value: TechCardPayload[K]) => onChange({ ...payload, [key]: value });
  const stageOut = stageOutputsKg(payload, rows);

  const updateStage = (idx: number, next: TechCardStage) =>
    set('stages', payload.stages.map((st, i) => (i === idx ? next : st)));

  const removeStage = (idx: number) => {
    const removed = payload.stages[idx].key;
    onChange({
      ...payload,
      stages: payload.stages
        .filter((_, i) => i !== idx)
        .map((st) => ({ ...st, inputStageKeys: st.inputStageKeys.filter((k) => k !== removed) })),
      dosing: payload.dosing.map((d) => ({ ...d, stageKeys: d.stageKeys.filter((k) => k !== removed) })),
    });
  };

  const handleStageDrag = (result: DropResult) => {
    const to = result.destination?.index;
    const from = result.source.index;
    if (to == null || to === from) return;
    const next = [...payload.stages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // вхід – лише з попередніх етапів
    set(
      'stages',
      next.map((st, i) => ({
        ...st,
        inputStageKeys: st.inputStageKeys.filter((k) => next.slice(0, i).some((p) => p.key === k)),
      })),
    );
  };

  const updatePackaging = (idx: number, patch: Partial<TechCardPackagingRow>) =>
    set('packaging', payload.packaging.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const updateFraction = (idx: number, patch: Partial<TechCardDosingFraction>) =>
    set('dosing', payload.dosing.map((d, i) => (i === idx ? { ...d, ...patch } : d)));

  return (
    <div className="flex flex-col gap-5">
      <TechCardCoverageNotice payload={payload} rows={rows} />

      <Section icon="list-ordered" title="Етапи">
        <DragDropContext onDragEnd={handleStageDrag}>
          <Droppable droppableId="techcard-stages">
            {(dropProvided) => (
              <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="flex flex-col gap-4">
                {payload.stages.map((stage, idx) => (
                  <Draggable key={stage.key} draggableId={stage.key} index={idx}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={snapshot.isDragging ? 'rounded-lg shadow-lg' : undefined}
                      >
                        <StageCard
                          stage={stage}
                          index={idx}
                          previous={payload.stages.slice(0, idx)}
                          rows={rows}
                          takenRowKeys={
                            new Set(payload.stages.filter((_, i) => i !== idx).flatMap((st) => st.inputRowKeys))
                          }
                          outputKg={stageOut.get(stage.key) ?? null}
                          dragHandle={
                            <span
                              {...dragProvided.dragHandleProps}
                              className="inline-flex h-10 w-5 shrink-0 cursor-grab items-center justify-center text-default-300 hover:text-default-500 active:cursor-grabbing"
                              title="Перетягнути для зміни порядку"
                              aria-label="Перетягнути для зміни порядку"
                            >
                              <DynamicIcon name="grip-vertical" size={16} />
                            </span>
                          }
                          onChange={(next) => updateStage(idx, next)}
                          onRemove={() => removeStage(idx)}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        <Button
          size="sm"
          color="warning"
          variant="flat"
          className="self-start"
          startContent={<DynamicIcon name="plus" size={14} />}
          onPress={() => set('stages', [...payload.stages, newStage()])}
        >
          Додати етап
        </Button>
      </Section>

      <Divider className="bg-default-200/60" />

      <Section icon="package" title="Пакування">
        <NumberInputFromNumber
          size="md"
          label="Порцій у коробці"
          className="max-w-44"
          value={payload.portionsPerBox ?? 0}
          min={0}
          decimalPlaces={0}
          classNames={INPUT_CLASS}
          onChange={(v) => set('portionsPerBox', v > 0 ? Math.round(v) : null)}
        />
        {payload.packaging.map((row, idx) => (
          <div key={`${row.goodId}-${idx}`} className="grid grid-cols-[1fr_6rem_9rem_1fr_auto] items-center gap-3">
            <span className="truncate text-sm">{goodNames[row.goodId]?.name ?? row.goodId}</span>
            <NumberInputFromNumber
              size="md"
              aria-label="Кількість"
              value={row.qty}
              min={0}
              decimalPlaces={3}
              trimTrailingZeros
              classNames={INPUT_CLASS}
              onChange={(v) => updatePackaging(idx, { qty: v })}
            />
            <Select
              size="md"
              aria-label="База"
              classNames={SELECT_CLASS}
              selectedKeys={[row.basis]}
              onSelectionChange={(keys) => {
                const basis = Array.from(keys)[0] as TechCardPackagingBasis | undefined;
                if (basis) updatePackaging(idx, { basis });
              }}
            >
              {(Object.keys(PACKAGING_BASIS_LABELS) as TechCardPackagingBasis[]).map((b) => (
                <SelectItem key={b}>{PACKAGING_BASIS_LABELS[b]}</SelectItem>
              ))}
            </Select>
            <Input
              size="md"
              aria-label="Примітка"
              placeholder="Примітка"
              value={row.note ?? ''}
              classNames={INPUT_CLASS}
              onValueChange={(v) => updatePackaging(idx, { note: textOrNull(v) })}
            />
            <Button
              size="sm"
              variant="light"
              color="danger"
              isIconOnly
              aria-label="Прибрати матеріал"
              onPress={() => set('packaging', payload.packaging.filter((_, i) => i !== idx))}
            >
              <DynamicIcon name="trash-2" size={14} />
            </Button>
          </div>
        ))}
        <PackagingGoodPicker
          onPick={(hit) => {
            onGoodNamesChange({ ...goodNames, [hit.id]: { name: hit.name, sku: hit.sku, weight: hit.weight } });
            set('packaging', [...payload.packaging, { goodId: hit.id, qty: 1, basis: 'portion', note: null }]);
          }}
        />
      </Section>

      <Divider className="bg-default-200/60" />

      <Section icon="scale" title="Дозування">
        {payload.dosing.map((fraction, idx) => (
          <div key={fraction.key} className="grid grid-cols-1 items-start gap-3 md:grid-cols-[8rem_minmax(0,2fr)_minmax(0,1fr)_5rem_auto]">
            <Input
              size="md"
              aria-label="Назва фракції"
              placeholder="М1"
              value={fraction.name}
              classNames={INPUT_CLASS}
              onValueChange={(v) => updateFraction(idx, { name: v })}
            />
            <Select
              size="md"
              aria-label="Рядки специфікації"
              placeholder="Інгредієнти"
              {...MULTI_SELECT_PROPS}
              selectedKeys={new Set(fraction.rowKeys)}
              onSelectionChange={(keys) => updateFraction(idx, { rowKeys: Array.from(keys, String) })}
            >
              {rows.map((r) => (
                <SelectItem key={r.rowKey}>{r.name}</SelectItem>
              ))}
            </Select>
            <Select
              size="md"
              aria-label="Виходи етапів"
              placeholder="Виходи етапів"
              {...MULTI_SELECT_PROPS}
              isDisabled={payload.stages.length === 0}
              selectedKeys={new Set(fraction.stageKeys)}
              onSelectionChange={(keys) => updateFraction(idx, { stageKeys: Array.from(keys, String) })}
            >
              {payload.stages.map((st, i) => (
                <SelectItem key={st.key}>{`${i + 1}. ${st.name || 'Без назви'}`}</SelectItem>
              ))}
            </Select>
            <span className="pt-2.5 text-right text-sm tabular-nums">{formatGrams(fractionKg(fraction, rows, stageOut))}</span>
            <Button
              size="sm"
              variant="light"
              color="danger"
              isIconOnly
              className="mt-1"
              aria-label="Прибрати фракцію"
              onPress={() => set('dosing', payload.dosing.filter((_, i) => i !== idx))}
            >
              <DynamicIcon name="trash-2" size={14} />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="flat"
          color="warning"
          className="self-start"
          startContent={<DynamicIcon name="plus" size={14} />}
          onPress={() =>
            set('dosing', [
              ...payload.dosing,
              { key: newRowKey(), name: `М${payload.dosing.length + 1}`, rowKeys: [], stageKeys: [] },
            ])
          }
        >
          Додати фракцію
        </Button>
      </Section>

      <Divider className="bg-default-200/60" />

      <Section icon="sticky-note" title="Примітки">
        <Textarea
          aria-label="Примітки техкарти"
          minRows={3}
          value={payload.notes ?? ''}
          classNames={INPUT_CLASS}
          onValueChange={(v) => set('notes', textOrNull(v))}
        />
      </Section>

      <Divider className="bg-default-200/60" />

      <Section icon="calculator" title="Розрахунок">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="Формула брутто">
            <Select
              size="md"
              aria-label="Формула брутто"
              classNames={SELECT_CLASS}
              selectedKeys={[payload.lossFormula ?? GLOBAL]}
              onSelectionChange={(keys) => {
                const key = String(Array.from(keys)[0] ?? GLOBAL);
                set('lossFormula', key === 'additive' || key === 'sequential' ? key : null);
              }}
            >
              {[
                <SelectItem key={GLOBAL}>{`Як у налаштуваннях (${FORMULA_LABELS[globalFormula]})`}</SelectItem>,
                <SelectItem key="additive">Адитивна</SelectItem>,
                <SelectItem key="sequential">Послідовна</SelectItem>,
              ]}
            </Select>
          </Field>
        </div>
        {hasDerivedRows && (
          <p className="text-xs text-default-500">
            Похідні рядки специфікації (кількість за формулою) рахуються на «Порцій на варку» зі складу. Якщо його змінити,
            кількість цих рядків перерахується в специфікації під час затвердження техкарти.
          </p>
        )}
      </Section>

      <Divider className="bg-transparent" />
    </div>
  );
}
