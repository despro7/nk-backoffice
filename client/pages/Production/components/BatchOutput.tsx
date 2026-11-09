import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Textarea,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { BaseModal } from '@/components/modals/BaseModal';
import { NumberInput } from '@/components/NumberInput';
import { cn } from '@/lib/utils';
import type {
  ProductionBatchDetailDto,
  ProductionBatchFact,
  ProductionBatchLeftoverAction,
  ProductionBatchLineDto,
  ProductionBatchOutputInput,
} from '@shared/types/production';
import { issuePlan } from '@shared/utils/productionBatchIssue';
import {
  EMPTY_FACT,
  PORTIONS_DEVIATION_PCT,
  consumedQty,
  consumptionDeviationPct,
  deviationPct,
  factBoxes,
  factTotalPortions,
  isDeviationNotable,
} from '@shared/utils/productionBatchOutput';
import { useProductionBatchActions } from '../useProductionBatches';
import { formatQty } from './batchUi';
import { parseQty, toText } from './BatchLinesTable';
import { BusyIcon, run } from './BatchStepPanels';

const TABLE_CLASS_NAMES = {
  table: 'min-w-[900px]',
  th: 'bg-default-100 text-default-600 text-xs font-semibold first:rounded-l-md last:rounded-r-md',
  td: 'text-sm py-2 align-top border-b border-default-200/70',
};

export const LEFTOVER_ACTION_LABELS: Record<ProductionBatchLeftoverAction, string> = {
  keep_vp: 'Лишити на ВП',
  return_sp: 'Повернути на СП',
};

type FactKey = Exclude<keyof ProductionBatchFact, 'comment'>;

const FACT_FIELDS: Array<{ key: FactKey; label: string; required?: boolean }> = [
  { key: 'portionsGood', label: 'Порцій на ГП', required: true },
  { key: 'portionsReject', label: 'Брак, порцій' },
  { key: 'portionsSample', label: 'На пробу, порцій' },
  { key: 'labelRejects', label: 'Брак термоналіпок, шт' },
  { key: 'portionsPerBox', label: 'Порцій у коробці' },
  { key: 'boxes', label: 'Коробок' },
  { key: 'pallets', label: 'Піддонів' },
];

// ── Чернетка факту ───────────────────────────────────────────────────────────

interface OutputLineDraft {
  leftoverQty: string;
  leftoverAction: ProductionBatchLeftoverAction | null;
  note: string;
}

type FactDraft = Record<FactKey, string> & { comment: string };

function factDraftOf(batch: ProductionBatchDetailDto | null): FactDraft {
  const fact = batch?.fact ?? { ...EMPTY_FACT, portionsPerBox: batch?.snapshot.payload.portionsPerBox ?? null };
  const out = { comment: fact.comment ?? '' } as FactDraft;
  for (const f of FACT_FIELDS) out[f.key] = toText(fact[f.key]);
  return out;
}

function lineDraftOf(line: ProductionBatchLineDto): OutputLineDraft {
  return { leftoverQty: toText(line.leftoverQty), leftoverAction: line.leftoverAction, note: line.note ?? '' };
}

function intOf(text: string): number | null {
  const n = parseQty(text);
  return n == null ? null : Math.round(n);
}

export interface OutputDraft {
  fact: FactDraft;
  lines: Record<number, OutputLineDraft>;
  dirty: boolean;
  setFact: (patch: Partial<FactDraft>) => void;
  setLine: (lineId: number, patch: Partial<OutputLineDraft>) => void;
  factValue: () => ProductionBatchFact;
  leftover: (lineId: number) => number | null;
  toInput: () => ProductionBatchOutputInput;
}

/** Локальна чернетка факту виходу; скидається, коли сервер повертає нову варку. */
export function useOutputDraft(batch: ProductionBatchDetailDto | null): OutputDraft {
  const batchLines = useMemo(() => batch?.lines ?? [], [batch]);
  const initialFact = useMemo(() => (batch ? factDraftOf(batch) : factDraftOf(null)), [batch]);
  const initialLines = useMemo(() => Object.fromEntries(batchLines.map((l) => [l.id, lineDraftOf(l)])), [batchLines]);
  const [fact, setFactState] = useState(initialFact);
  const [lines, setLines] = useState<Record<number, OutputLineDraft>>(initialLines);
  useEffect(() => setFactState(initialFact), [initialFact]);
  useEffect(() => setLines(initialLines), [initialLines]);

  const dirty = useMemo(
    () =>
      JSON.stringify(fact) !== JSON.stringify(initialFact) ||
      batchLines.some((l) => {
        const a = lines[l.id];
        const b = initialLines[l.id];
        return (
          a != null &&
          b != null &&
          (parseQty(a.leftoverQty) !== parseQty(b.leftoverQty) ||
            a.leftoverAction !== b.leftoverAction ||
            a.note.trim() !== b.note.trim())
        );
      }),
    [fact, initialFact, lines, initialLines, batchLines],
  );

  const factValue = useCallback((): ProductionBatchFact => {
    const out = { ...EMPTY_FACT, comment: fact.comment.trim() || null };
    for (const f of FACT_FIELDS) out[f.key] = intOf(fact[f.key]);
    return out;
  }, [fact]);

  return {
    fact,
    lines,
    dirty,
    setFact: (patch) => setFactState((prev) => ({ ...prev, ...patch })),
    setLine: (lineId, patch) =>
      setLines((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] ?? { leftoverQty: '', leftoverAction: null, note: '' }), ...patch } })),
    factValue,
    leftover: (lineId) => parseQty(lines[lineId]?.leftoverQty ?? ''),
    toInput: () => ({
      fact: factValue(),
      lines: batchLines.map((l) => {
        const d = lines[l.id] ?? lineDraftOf(l);
        const leftoverQty = parseQty(d.leftoverQty);
        return {
          id: l.id,
          leftoverQty,
          leftoverAction: (leftoverQty ?? 0) > 0 ? d.leftoverAction : null,
          note: d.note,
        };
      }),
    }),
  };
}

// ── Таблиця залишків ─────────────────────────────────────────────────────────

function DeviationText({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-default-400">–</span>;
  const notable = isDeviationNotable(pct);
  return (
    <span className={cn('whitespace-nowrap tabular-nums', notable ? 'font-medium text-warning-600' : 'text-default-500')}>
      {pct > 0 ? '+' : ''}
      {pct.toLocaleString('uk-UA', { maximumFractionDigits: 1 })}%
    </span>
  );
}

interface OutputLinesTableProps {
  kind: 'raw' | 'packaging';
  lines: ProductionBatchLineDto[];
  /** null – лише перегляд */
  draft: OutputDraft | null;
}

/** Факт по рядках: видано, залишок після варки (і куди його), витрачено, відхилення від плану. */
export function OutputLinesTable({ kind, lines, draft }: OutputLinesTableProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <Table
        aria-label={kind === 'raw' ? 'Факт по сировині' : 'Факт по пакуванню'}
        removeWrapper
        classNames={TABLE_CLASS_NAMES}
      >
        <TableHeader>
          <TableColumn>{kind === 'raw' ? 'Інгредієнт' : 'Матеріал'}</TableColumn>
          <TableColumn className="text-right">План</TableColumn>
          <TableColumn className="text-right">Видано</TableColumn>
          <TableColumn className="text-right">Залишок</TableColumn>
          <TableColumn>Залишок куди</TableColumn>
          <TableColumn className="text-right">Витрачено</TableColumn>
          <TableColumn className="text-right">Від плану</TableColumn>
          <TableColumn>Примітка</TableColumn>
        </TableHeader>
        <TableBody emptyContent="Немає позицій">
          {lines.map((l) => {
            const plan = issuePlan(l);
            const d = draft?.lines[l.id];
            const leftover = draft ? draft.leftover(l.id) : l.leftoverQty;
            const consumed = consumedQty(l, leftover);
            const pct = consumptionDeviationPct(l, leftover);
            const overIssued = l.issuedQty != null && leftover != null && leftover > l.issuedQty;
            const action = draft ? d?.leftoverAction ?? null : l.leftoverAction;
            const needAction = (leftover ?? 0) > 0;
            return (
              <TableRow key={l.id}>
                <TableCell>
                  <span className="block min-w-40">{l.name}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums text-default-600">
                  {formatQty(plan.qty)} {plan.unit}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                  {l.issuedQty != null ? `${formatQty(l.issuedQty)} ${plan.unit}` : '–'}
                </TableCell>
                <TableCell className="text-right">
                  {draft ? (
                    <NumberInput
                      aria-label={`Залишок: ${l.name}`}
                      size="sm"
                      className="ml-auto w-24"
                      classNames={{ input: 'text-right' }}
                      decimalPlaces={3}
                      min={0}
                      placeholder="0"
                      color={overIssued ? 'danger' : 'default'}
                      value={d?.leftoverQty ?? ''}
                      onValueChange={(v) => draft.setLine(l.id, { leftoverQty: v })}
                    />
                  ) : (
                    <span className="whitespace-nowrap tabular-nums">{leftover ? `${formatQty(leftover)} ${plan.unit}` : '–'}</span>
                  )}
                </TableCell>
                <TableCell>
                  {needAction ? (
                    draft ? (
                      <Select
                        aria-label={`Залишок куди: ${l.name}`}
                        size="sm"
                        className="w-44"
                        placeholder="Оберіть *"
                        isInvalid={action == null}
                        selectedKeys={action ? [action] : []}
                        onSelectionChange={(keys) => {
                          const v = Array.from(keys)[0];
                          draft.setLine(l.id, { leftoverAction: (v as ProductionBatchLeftoverAction) ?? null });
                        }}
                      >
                        {(Object.keys(LEFTOVER_ACTION_LABELS) as ProductionBatchLeftoverAction[]).map((k) => (
                          <SelectItem key={k}>{LEFTOVER_ACTION_LABELS[k]}</SelectItem>
                        ))}
                      </Select>
                    ) : (
                      <span className="whitespace-nowrap text-xs">{action ? LEFTOVER_ACTION_LABELS[action] : '–'}</span>
                    )
                  ) : (
                    <span className="text-default-400">–</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {consumed != null ? `${formatQty(consumed)} ${plan.unit}` : '–'}
                </TableCell>
                <TableCell className="text-right">
                  <DeviationText pct={pct} />
                </TableCell>
                <TableCell>
                  {draft ? (
                    <Input
                      size="sm"
                      aria-label={`Примітка: ${l.name}`}
                      placeholder="Примітка"
                      className="min-w-40"
                      value={d?.note ?? ''}
                      onValueChange={(v) => draft.setLine(l.id, { note: v })}
                    />
                  ) : (
                    <span className="text-xs text-default-600">{l.note || '–'}</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Підсумок факту ───────────────────────────────────────────────────────────

function PortionsSummary({ fact, planned }: { fact: ProductionBatchFact; planned: number }) {
  const total = factTotalPortions(fact);
  const pct = deviationPct(total, planned);
  if (total == null) return null;
  const notable = isDeviationNotable(pct, PORTIONS_DEVIATION_PCT);
  return (
    <p className={cn('text-xs tabular-nums', notable ? 'text-warning-700' : 'text-default-500')}>
      {notable && <DynamicIcon name="triangle-alert" size={13} className="mr-1 inline align-[-2px]" />}
      Усього зварено {total} з {planned} за планом
      {pct != null ? ` (${pct > 0 ? '+' : ''}${pct.toLocaleString('uk-UA', { maximumFractionDigits: 1 })}%)` : ''}
    </p>
  );
}

/** Факт виходу в пройденому кроці. */
export function FactSummary({ batch }: { batch: ProductionBatchDetailDto }) {
  const fact = batch.fact;
  if (!fact) return null;
  const parts = FACT_FIELDS.filter((f) => fact[f.key] != null).map((f) => `${f.label}: ${fact[f.key]}`);
  return (
    <div className="mt-1.5 flex flex-col gap-0.5">
      <p className="text-xs text-default-700">{parts.join(' · ')}</p>
      <PortionsSummary fact={fact} planned={batch.plannedPortions} />
      {fact.comment && <p className="text-xs text-default-500">{fact.comment}</p>}
    </div>
  );
}

// ── Крок 5: факт виходу ──────────────────────────────────────────────────────

export function OutputStepPanel({ batch, draft }: { batch: ProductionBatchDetailDto; draft: OutputDraft }) {
  const actions = useProductionBatchActions();
  const [busy, setBusy] = useState<'save' | 'sign' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fact = draft.factValue();
  const autoBoxes = factBoxes(fact.portionsGood, fact.portionsPerBox);
  const unfinished = batch.stages.filter((s) => !s.finishedAt).length;
  const missingAction = batch.lines.filter((l) => (draft.leftover(l.id) ?? 0) > 0 && !draft.lines[l.id]?.leftoverAction);
  const overIssued = batch.lines.filter((l) => {
    const left = draft.leftover(l.id);
    return l.issuedQty != null && left != null && left > l.issuedQty;
  });
  const deviations = batch.lines.filter((l) => isDeviationNotable(consumptionDeviationPct(l, draft.leftover(l.id))));
  const blockers = [
    fact.portionsGood == null ? 'вкажіть порції на ГП' : null,
    missingAction.length > 0 ? `оберіть, куди залишок: ${missingAction.map((l) => l.name).join(', ')}` : null,
    overIssued.length > 0 ? `залишок більший за видане: ${overIssued.map((l) => l.name).join(', ')}` : null,
  ].filter(Boolean);

  const save = async () => {
    setBusy('save');
    await run(() => actions.saveOutput(batch.id, draft.toInput()), 'Чернетку факту збережено', 'Не вдалося зберегти');
    setBusy(null);
  };

  const sign = async () => {
    setBusy('sign');
    const ok = await run(() => actions.signOutput(batch.id, draft.toInput()), 'Факт виходу підтверджено', 'Не вдалося підтвердити');
    setBusy(null);
    if (ok) setConfirmOpen(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {unfinished > 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-warning-700">
          <DynamicIcon name="triangle-alert" size={13} />
          Не завершено етапів: {unfinished}. Факт можна внести, але перевірте готування.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FACT_FIELDS.map((f) => (
          <NumberInput
            key={f.key}
            label={f.label}
            isRequired={f.required}
            decimalPlaces={0}
            min={0}
            placeholder={f.key === 'boxes' && autoBoxes != null ? String(autoBoxes) : undefined}
            value={draft.fact[f.key]}
            onValueChange={(v) => draft.setFact({ [f.key]: v } as Partial<FactDraft>)}
          />
        ))}
      </div>
      <PortionsSummary fact={fact} planned={batch.plannedPortions} />
      <Textarea
        label="Коментар"
        minRows={1}
        value={draft.fact.comment}
        onValueChange={(v) => draft.setFact({ comment: v })}
        className="md:max-w-xl"
      />
      <p className="text-xs text-default-500">
        Залишки по сировині й пакуванню – у таблицях нижче: витрачено = видано − залишок. Порожній залишок = 0.
      </p>
      <div className="flex flex-wrap gap-2">
        {draft.dirty && (
          <Button
            variant="flat"
            isDisabled={busy != null}
            startContent={<BusyIcon busy={busy === 'save'} icon="save" />}
            onPress={() => void save()}
          >
            Зберегти чернетку
          </Button>
        )}
        <Button
          color="primary"
          isDisabled={busy != null}
          startContent={<DynamicIcon name="signature" size={14} />}
          onPress={() => setConfirmOpen(true)}
        >
          Підтвердити факт виходу
        </Button>
      </div>

      <BaseModal
        isOpen={confirmOpen}
        title="Підтвердити факт виходу"
        message={
          <div className="flex flex-col gap-2 text-sm text-default-700">
            {blockers.length > 0 ? (
              <p className="text-danger-600">Щоб підписати: {blockers.join('; ')}.</p>
            ) : (
              <>
                <p>
                  Порцій на ГП: <span className="font-semibold">{fact.portionsGood}</span>
                  {fact.portionsReject ? `, брак ${fact.portionsReject}` : ''}
                  {fact.portionsSample ? `, на пробу ${fact.portionsSample}` : ''}; коробок{' '}
                  {fact.boxes ?? autoBoxes ?? '–'}. Після підпису продукцію приймають на склад ГП.
                </p>
                {deviations.length > 0 && (
                  <p className="text-xs text-warning-700">
                    Витрата відрізняється від плану більш як на 5%: {deviations.map((l) => l.name).join(', ')}.
                  </p>
                )}
              </>
            )}
          </div>
        }
        confirmText={blockers.length > 0 ? 'Зрозуміло' : 'Підписати'}
        cancelText="Назад"
        confirmLoading={busy === 'sign'}
        onConfirm={() => {
          if (blockers.length > 0) setConfirmOpen(false);
          else void sign();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── Крок 6: прийом на склад ГП ───────────────────────────────────────────────

export function FinishedStepPanel({ batch }: { batch: ProductionBatchDetailDto }) {
  const actions = useProductionBatchActions();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    await run(() => actions.acceptFinished(batch.id, comment), 'Прийнято на склад ГП', 'Не вдалося прийняти');
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-default-500">
        Порцій до прийому: <span className="font-semibold text-default-800">{batch.fact?.portionsGood ?? '–'}</span>
        {batch.fact?.boxes != null ? `, коробок ${batch.fact.boxes}` : ''}
        {batch.fact?.pallets != null ? `, піддонів ${batch.fact.pallets}` : ''}. Підпис підтверджує прийом продукції на склад ГП.
      </p>
      <Textarea label="Коментар" minRows={1} value={comment} onValueChange={setComment} className="md:max-w-xl" />
      <div className="flex">
        <Button color="primary" isDisabled={busy} startContent={<BusyIcon busy={busy} icon="signature" />} onPress={() => void accept()}>
          Прийняти на склад ГП
        </Button>
      </div>
    </div>
  );
}

// ── Крок 7: закриття ─────────────────────────────────────────────────────────

export function CloseStepPanel({ batch }: { batch: ProductionBatchDetailDto }) {
  const actions = useProductionBatchActions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = async () => {
    setBusy(true);
    const ok = await run(() => actions.close(batch.id), 'Варку закрито', 'Не вдалося закрити варку');
    setBusy(false);
    if (ok) setOpen(false);
  };
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-xs text-default-500">Після закриття варка доступна лише для перегляду, підписи вже не відкликаються.</p>
      <div className="flex">
        <Button color="primary" startContent={<DynamicIcon name="lock" size={14} />} onPress={() => setOpen(true)}>
          Закрити варку
        </Button>
      </div>
      <BaseModal
        isOpen={open}
        title="Закрити варку"
        message={<p className="text-sm text-default-700">Закрити варку {batch.number}? Змінити її після цього не можна.</p>}
        confirmText="Закрити"
        cancelText="Назад"
        confirmLoading={busy}
        onConfirm={() => void close()}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
