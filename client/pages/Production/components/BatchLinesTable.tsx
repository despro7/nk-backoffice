import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { NumberInput } from '@/components/NumberInput';
import { cn } from '@/lib/utils';
import type { ProductionBatchIssueInput, ProductionBatchLineDto } from '@shared/types/production';
import { isIssueShortage, issuePlan, snapshotAvailable, stockShortGoodIds } from '@shared/utils/productionBatchIssue';
import { formatQty } from './batchUi';

/** plan – лише планові кількості; issue – комірник заповнює видачу; issued – видачу підтверджено. */
export type BatchLinesMode = 'plan' | 'issue' | 'issued';

const TABLE_CLASS_NAMES = {
  table: 'min-w-[520px]',
  th: 'bg-default-100 text-default-600 text-xs font-semibold first:rounded-l-md last:rounded-r-md',
  td: 'text-sm py-2 align-top border-b border-default-200/70',
};

// ── Чернетка видачі ──────────────────────────────────────────────────────────

interface IssueDraftRow {
  stockActual: string;
  issuedQty: string;
  issueNote: string;
  shortageComment: string;
}

const EMPTY_ROW: IssueDraftRow = { stockActual: '', issuedQty: '', issueNote: '', shortageComment: '' };

export function toText(value: number | null): string {
  return value == null ? '' : String(value).replace('.', ',');
}

export function parseQty(text: string): number | null {
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function rowFromLine(line: ProductionBatchLineDto): IssueDraftRow {
  return {
    stockActual: toText(line.stockActual),
    issuedQty: toText(line.issuedQty),
    issueNote: line.issueNote ?? '',
    shortageComment: line.shortageComment ?? '',
  };
}

export interface IssueDraft {
  rows: Record<number, IssueDraftRow>;
  dirty: boolean;
  set: (lineId: number, patch: Partial<IssueDraftRow>) => void;
  /** Порожні «Видано» → план видачі */
  fillFromPlan: () => void;
  reset: () => void;
  toInput: () => ProductionBatchIssueInput;
  issued: (lineId: number) => number | null;
}

/** Локальна чернетка видачі; скидається, коли сервер повертає нові значення рядків. */
export function useIssueDraft(lines: ProductionBatchLineDto[]): IssueDraft {
  const initial = useMemo(() => Object.fromEntries(lines.map((l) => [l.id, rowFromLine(l)])), [lines]);
  const [rows, setRows] = useState<Record<number, IssueDraftRow>>(initial);
  useEffect(() => setRows(initial), [initial]);

  const dirty = useMemo(
    () =>
      lines.some((l) => {
        const a = rows[l.id];
        const b = initial[l.id];
        return (
          a != null &&
          b != null &&
          (parseQty(a.stockActual) !== parseQty(b.stockActual) ||
            parseQty(a.issuedQty) !== parseQty(b.issuedQty) ||
            a.issueNote.trim() !== b.issueNote.trim() ||
            a.shortageComment.trim() !== b.shortageComment.trim())
        );
      }),
    [lines, rows, initial],
  );

  const set = useCallback((lineId: number, patch: Partial<IssueDraftRow>) => {
    setRows((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] ?? EMPTY_ROW), ...patch } }));
  }, []);

  const fillFromPlan = useCallback(() => {
    setRows((prev) => {
      const next = { ...prev };
      for (const l of lines) {
        const row = next[l.id];
        if (row && !row.issuedQty.trim()) next[l.id] = { ...row, issuedQty: toText(issuePlan(l).qty) };
      }
      return next;
    });
  }, [lines]);

  const toInput = useCallback(
    (): ProductionBatchIssueInput => ({
      lines: lines.map((l) => {
        const row = rows[l.id] ?? rowFromLine(l);
        return {
          id: l.id,
          stockActual: parseQty(row.stockActual),
          issuedQty: parseQty(row.issuedQty),
          issueNote: row.issueNote,
          shortageComment: row.shortageComment,
        };
      }),
    }),
    [lines, rows],
  );

  return {
    rows,
    dirty,
    set,
    fillFromPlan,
    reset: () => setRows(initial),
    toInput,
    issued: (lineId: number) => parseQty(rows[lineId]?.issuedQty ?? ''),
  };
}

// ── Таблиця ──────────────────────────────────────────────────────────────────

function planInRowUnits(line: ProductionBatchLineDto): string {
  return `${formatQty(line.plannedQty)}${line.unitName ? ` ${line.unitName}` : ''}`;
}

function StockCell({ line, short }: { line: ProductionBatchLineDto; short: boolean }) {
  const available = snapshotAvailable(line);
  if (available == null) return <span className="text-default-400">–</span>;
  const unit = issuePlan(line).unit;
  return (
    <Tooltip
      content={`СП ${formatQty(line.stockRawSnap ?? 0)} ${unit} · ВП ${formatQty(line.stockProdSnap ?? 0)} ${unit}`}
      classNames={{ content: 'text-xs' }}
      delay={250}
      closeDelay={0}
    >
      <span className={cn('inline-flex items-center gap-1 tabular-nums', short ? 'text-warning-600' : 'text-default-700')}>
        {short && <DynamicIcon name="triangle-alert" size={13} />}
        {formatQty(available)}
      </span>
    </Tooltip>
  );
}

interface BatchLinesTableProps {
  kind: 'raw' | 'packaging';
  lines: ProductionBatchLineDto[];
  mode: BatchLinesMode;
  draft?: IssueDraft;
}

/** Сировина / пакування варки: план, а з кроку видачі – облікові залишки і видано. */
export function BatchLinesTable({ kind, lines, mode, draft }: BatchLinesTableProps) {
  const label = kind === 'raw' ? 'Інгредієнт' : 'Матеріал';

  if (mode === 'plan') {
    return (
      <div className="-mx-1 overflow-x-auto px-1">
        <Table
          aria-label={kind === 'raw' ? 'Сировина варки' : 'Пакування варки'}
          removeWrapper
          classNames={{ ...TABLE_CLASS_NAMES, table: kind === 'raw' ? 'min-w-[520px]' : 'min-w-[360px]' }}
        >
          <TableHeader>
            {[
              <TableColumn key="name">{label}</TableColumn>,
              <TableColumn key="plan" className="text-right">
                План
              </TableColumn>,
              ...(kind === 'raw'
                ? [
                    <TableColumn key="net" className="text-right">
                      Нетто
                    </TableColumn>,
                    <TableColumn key="gross" className="text-right">
                      Брутто
                    </TableColumn>,
                  ]
                : []),
            ]}
          </TableHeader>
          <TableBody emptyContent="Немає позицій">
            {lines.map((l) => (
              <TableRow key={l.id}>
                {[
                  <TableCell key="name">{l.name}</TableCell>,
                  <TableCell key="plan" className="text-right tabular-nums">
                    {planInRowUnits(l)}
                  </TableCell>,
                  ...(kind === 'raw'
                    ? [
                        <TableCell key="net" className="text-right tabular-nums">
                          {l.plannedNetKg != null ? `${formatQty(l.plannedNetKg)} кг` : '–'}
                        </TableCell>,
                        <TableCell key="gross" className="text-right font-medium tabular-nums">
                          {l.plannedGrossKg != null ? `${formatQty(l.plannedGrossKg)} кг` : '–'}
                        </TableCell>,
                      ]
                    : []),
                ]}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const editable = mode === 'issue' && draft != null;
  const shortGoods = stockShortGoodIds(lines);

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <Table
        aria-label={kind === 'raw' ? 'Видача сировини' : 'Видача пакування'}
        removeWrapper
        classNames={{ ...TABLE_CLASS_NAMES, table: 'min-w-[860px]' }}
      >
        <TableHeader>
          <TableColumn>{label}</TableColumn>
          <TableColumn className="text-right">План видачі</TableColumn>
          <TableColumn className="text-right">Облік СП + ВП</TableColumn>
          <TableColumn className="text-right">Факт. залишок</TableColumn>
          <TableColumn className="text-right">Видано</TableColumn>
          <TableColumn>Примітка</TableColumn>
        </TableHeader>
        <TableBody emptyContent="Немає позицій">
          {lines.map((l) => {
            const plan = issuePlan(l);
            const row = draft?.rows[l.id];
            const issued = editable ? draft.issued(l.id) : l.issuedQty;
            const shortage = isIssueShortage(l, issued);
            const comment = editable ? row?.shortageComment ?? '' : l.shortageComment ?? '';
            return (
              <TableRow key={l.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{l.name}</span>
                    {kind === 'raw' && (
                      <span className="text-xs text-default-500 tabular-nums">
                        нетто {l.plannedNetKg != null ? `${formatQty(l.plannedNetKg)} кг` : planInRowUnits(l)}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                  {formatQty(plan.qty)} {plan.unit}
                </TableCell>
                <TableCell className="text-right">
                  <StockCell line={l} short={shortGoods.has(l.goodId)} />
                </TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <NumberInput
                      aria-label={`Фактичний залишок: ${l.name}`}
                      size="sm"
                      className="ml-auto w-28"
                      classNames={{ input: 'text-right' }}
                      decimalPlaces={3}
                      min={0}
                      value={row?.stockActual ?? ''}
                      onValueChange={(v) => draft.set(l.id, { stockActual: v })}
                    />
                  ) : (
                    <span className="tabular-nums">{l.stockActual != null ? formatQty(l.stockActual) : '–'}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <NumberInput
                      aria-label={`Видано: ${l.name}`}
                      size="sm"
                      className="ml-auto w-28"
                      classNames={{ input: 'text-right' }}
                      decimalPlaces={3}
                      min={0}
                      placeholder={formatQty(plan.qty)}
                      color={shortage ? 'warning' : 'default'}
                      value={row?.issuedQty ?? ''}
                      onValueChange={(v) => draft.set(l.id, { issuedQty: v })}
                    />
                  ) : (
                    <span className={cn('whitespace-nowrap font-medium tabular-nums', shortage && 'text-warning-600')}>
                      {issued != null ? `${formatQty(issued)} ${plan.unit}` : '–'}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-48 flex-col gap-1.5">
                    {editable ? (
                      <>
                        {shortage && (
                          <Input
                            size="sm"
                            aria-label={`Причина нестачі: ${l.name}`}
                            placeholder="Причина нестачі *"
                            color="warning"
                            isInvalid={!comment.trim()}
                            value={comment}
                            onValueChange={(v) => draft.set(l.id, { shortageComment: v })}
                          />
                        )}
                        <Input
                          size="sm"
                          aria-label={`Примітка: ${l.name}`}
                          placeholder="Примітка"
                          value={row?.issueNote ?? ''}
                          onValueChange={(v) => draft.set(l.id, { issueNote: v })}
                        />
                      </>
                    ) : (
                      <>
                        {shortage && (
                          <span className="inline-flex items-start gap-1 text-xs text-warning-700">
                            <DynamicIcon name="triangle-alert" size={13} className="mt-px shrink-0" />
                            Нестача {formatQty(plan.qty - (issued ?? 0))} {plan.unit}
                            {comment ? `: ${comment}` : ''}
                          </span>
                        )}
                        {l.issueNote ? (
                          <span className="text-xs text-default-600">{l.issueNote}</span>
                        ) : (
                          !shortage && <span className="text-default-400">–</span>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
