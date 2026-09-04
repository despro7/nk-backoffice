import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HR_PAY_GROUP_LABELS, type HrPayGroup, type HrPayrollLineDto, type HrPayoutDto } from '@shared/types/hr';
import type { HrTimesheetWeekDto } from '@shared/types/hr';
import { HrSpecChip, hrEmployerTokensFromName, hrPayGroupTokens } from '../hrUi';
import { HR_SEED_LEGAL_ENTITY_CODES } from '@shared/utils/hrEmploymentDedupe';
import { PayrollCellActionModal } from './PayrollCellActionModal';
import { ToastService } from '@/services/ToastService';

function formatMoney(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoney(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface WeekTotals {
  weekTotals: Record<string, number>;
  total: number;
  paidTotal: number;
}

function sumLines(lines: HrPayrollLineDto[], weeks: HrTimesheetWeekDto[], paidByEmployment: Map<number, number>): WeekTotals {
  const weekTotals = Object.fromEntries(weeks.map((week) => [week.id, 0]));
  let total = 0;
  let paidTotal = 0;

  for (const line of lines) {
    for (const item of line.weekAmounts) {
      if (weekTotals[item.weekId] != null) {
        weekTotals[item.weekId] += parseMoney(item.toPay);
      }
    }
    total += parseMoney(line.toPayAmount);
    paidTotal += paidByEmployment.get(line.employmentId) ?? 0;
  }

  return { weekTotals, total, paidTotal };
}

interface PayrollTableProps {
  weeks: HrTimesheetWeekDto[];
  lines: HrPayrollLineDto[];
  payouts: HrPayoutDto[];
  paidByEmployment: Map<number, number>;
  periodId: number | null;
  canEditPayouts: boolean;
  onSelect: (line: HrPayrollLineDto) => void;
  onPayoutsChanged: () => void;
}

type PayrollGroupRow = {
  type: 'group';
  key: string;
  payGroup: HrPayGroup;
};

type PayrollLineRow = {
  type: 'line';
  key: string;
  line: HrPayrollLineDto;
  weekRaw: Record<string, string>;
  weekValues: Record<string, string>;
  paid: string;
};

type PayrollSubtotalRow = {
  type: 'subtotal';
  key: string;
  payGroup: HrPayGroup;
  weekTotals: Record<string, number>;
  total: number;
  paidTotal: number;
};

type PayrollGrandTotalRow = {
  type: 'grandtotal';
  key: string;
  weekTotals: Record<string, number>;
  total: number;
  paidTotal: number;
};

type PayrollTableRow = PayrollGroupRow | PayrollLineRow | PayrollSubtotalRow | PayrollGrandTotalRow;

type CellActionTarget = {
  line: HrPayrollLineDto;
  week: HrTimesheetWeekDto | null;
  amount: string;
  rawAmount: string;
};

const TH_CLASS = 'bg-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white whitespace-nowrap border-b border-white/15';
const TD_CLASS = 'px-3 py-2.5 bg-white border-b border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis';
const SUBTOTAL_TD = `px-3 py-1.5 whitespace-nowrap font-bold text-sm text-right tabular-nums`;
const GRANDTOTAL_TD = `${SUBTOTAL_TD} pt-3 pb-2.5 text-neutral-50 bg-neutral-800! border-0!`;
const AMOUNT_TD = `${TD_CLASS} text-right tabular-nums`;
const PAID_CELL = 'bg-lime-100!';
const NAME_W = 220;
const WEEK_W = 96;
const TOTAL_W = 104;
const PAID_W = 104;
const TABLE_CLASS = 'w-full border-collapse text-sm table-fixed';

function payoutKey(employmentId: number, weekId: string | null): string {
  return `${employmentId}:${weekId ?? '__total__'}`;
}

export function PayrollTable({
  weeks,
  lines,
  payouts,
  paidByEmployment,
  periodId,
  canEditPayouts,
  onSelect,
  onPayoutsChanged,
}: PayrollTableProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const [isStuck, setIsStuck] = useState(false);
  const [cellAction, setCellAction] = useState<CellActionTarget | null>(null);
  const [marking, setMarking] = useState(false);

  const paidWeekKeys = useMemo(() => {
    const set = new Set<string>();
    for (const payout of payouts) {
      set.add(payoutKey(payout.employmentId, payout.weekId));
    }
    return set;
  }, [payouts]);

  const tableRows = useMemo<PayrollTableRow[]>(() => {
    const rows: PayrollTableRow[] = [];
    let lastGroup: HrPayGroup | null = null;
    let groupLines: HrPayrollLineDto[] = [];

    const pushSubtotal = (payGroup: HrPayGroup) => {
      if (groupLines.length === 0) return;
      const sums = sumLines(groupLines, weeks, paidByEmployment);
      rows.push({
        type: 'subtotal',
        key: `subtotal-${payGroup}`,
        payGroup,
        ...sums,
      });
      groupLines = [];
    };

    for (const line of lines) {
      if (line.payGroup !== lastGroup) {
        if (lastGroup) pushSubtotal(lastGroup);
        rows.push({ type: 'group', key: `group-${line.payGroup}`, payGroup: line.payGroup });
        lastGroup = line.payGroup;
      }

      const weekMap = new Map(line.weekAmounts.map((item) => [item.weekId, item]));
      const weekRaw: Record<string, string> = Object.fromEntries(
        weeks.map((week) => {
          const cell = weekMap.get(week.id);
          return [week.id, cell?.toPay ?? ''];
        }),
      );
      const weekValues: Record<string, string> = Object.fromEntries(
        weeks.map((week) => {
          const raw = weekRaw[week.id];
          return [week.id, raw ? formatMoney(raw) : '—'];
        }),
      );
      const paid = paidByEmployment.get(line.employmentId) ?? 0;

      groupLines.push(line);
      rows.push({
        type: 'line',
        key: `line-${line.employmentId}`,
        line,
        weekRaw,
        weekValues,
        paid: formatMoney(paid.toFixed(2)),
      });
    }

    if (lastGroup) pushSubtotal(lastGroup);

    if (lines.length > 0) {
      rows.push({
        type: 'grandtotal',
        key: 'grandtotal',
        ...sumLines(lines, weeks, paidByEmployment),
      });
    }

    return rows;
  }, [lines, paidByEmployment, weeks]);

  const tableMinWidth = NAME_W + weeks.length * WEEK_W + TOTAL_W + PAID_W;

  const renderColGroup = () => (
    <colgroup>
      <col style={{ width: NAME_W }} />
      {weeks.map((week) => (
        <col key={week.id} style={{ width: WEEK_W }} />
      ))}
      <col style={{ width: TOTAL_W }} />
      <col style={{ width: PAID_W }} />
    </colgroup>
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsStuck(!entry.isIntersecting);
    }, { threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [lines.length]);

  const syncHorizontalScroll = useCallback((source: 'header' | 'body') => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body || syncingScroll.current) return;
    syncingScroll.current = true;
    if (source === 'header') {
      body.scrollLeft = header.scrollLeft;
    } else {
      header.scrollLeft = body.scrollLeft;
    }
    syncingScroll.current = false;
  }, []);

  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;
    const alignGutter = () => {
      const gutter = body.offsetWidth - body.clientWidth;
      header.style.paddingRight = gutter > 0 ? `${gutter}px` : '';
    };
    alignGutter();
    window.addEventListener('resize', alignGutter);
    return () => window.removeEventListener('resize', alignGutter);
  }, [lines.length, weeks.length, tableMinWidth]);

  const isCellPaid = (employmentId: number, weekId: string | null) =>
    paidWeekKeys.has(payoutKey(employmentId, weekId));

  const openCellAction = (line: HrPayrollLineDto, week: HrTimesheetWeekDto | null, rawAmount: string) => {
    if (!rawAmount) return;
    setCellAction({
      line,
      week,
      rawAmount,
      amount: formatMoney(rawAmount),
    });
  };

  const markPaid = async (amount: string) => {
    if (!cellAction || !periodId || !canEditPayouts) return;
    setMarking(true);
    try {
      const response = await fetch(`/api/hr/payroll/${periodId}/payouts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employmentId: cellAction.line.employmentId,
          kind: 'weekly',
          weekId: cellAction.week?.id ?? null,
          amount,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося записати виплату', color: 'danger' });
        return;
      }
      ToastService.show({ title: 'Виплату відмічено', color: 'success' });
      setCellAction(null);
      onPayoutsChanged();
    } finally {
      setMarking(false);
    }
  };

  const renderAmount = (value: string, paid: boolean, onClick?: () => void) => {
    if (!value || value === '—') {
      return <span className="text-neutral-300">—</span>;
    }
    if (!onClick) {
      return <span className={paid ? 'text-emerald-800' : undefined}>{value}</span>;
    }
    return (
      <button
        type="button"
        className={`w-full text-right tabular-nums ${paid ? 'text-emerald-800' : 'text-text-primary hover:text-primary'}`}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        {value}
      </button>
    );
  };

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-text-secondary">
        Немає рядків розрахунку за ций місяць.
      </div>
    );
  }

  const headerRow = (
    <tr>
      <th className={`${TH_CLASS} text-left`}>ПІБ</th>
      {weeks.map((week) => (
        <th key={week.id} className={`${TH_CLASS} text-right`}>
          {week.label}
        </th>
      ))}
      <th className={`${TH_CLASS} text-right`}>Разом</th>
      <th className={`${TH_CLASS} text-right rounded-tr-lg!`}>Виплачено</th>
    </tr>
  );

  const renderTableBody = () => (
    <tbody>
      {tableRows.map((row) => {
        if (row.type === 'group') {
          const groupTokens = hrPayGroupTokens(row.payGroup);
          return (
            <tr key={row.key} className={`border-b ${groupTokens.border}`}>
              <td colSpan={weeks.length + 3} className={`${groupTokens.bg} px-3 py-1.5`}>
                <span className={`text-sm font-semibold uppercase tracking-wide ${groupTokens.text}`}>
                  Група: {HR_PAY_GROUP_LABELS[row.payGroup]}
                </span>
              </td>
            </tr>
          );
        }

        if (row.type === 'subtotal') {
          const groupTokens = hrPayGroupTokens(row.payGroup);
          return (
            <tr key={row.key} className="[&>td]:bg-neutral-700/90! [&>td]:text-neutral-50!">
              <td className={`${SUBTOTAL_TD} text-left! ${groupTokens.text} ${groupTokens.bg}`}>
                Разом · {HR_PAY_GROUP_LABELS[row.payGroup]}
              </td>
              {weeks.map((week) => (
                <td key={week.id} className={`${SUBTOTAL_TD} ${groupTokens.text} ${groupTokens.bg}`}>
                  {renderAmount(formatMoney(row.weekTotals[week.id] ?? 0), false)}
                </td>
              ))}
              <td className={`${SUBTOTAL_TD} ${groupTokens.text} ${groupTokens.bg}`}>
                {formatMoney(row.total)}
              </td>
              <td className={`${SUBTOTAL_TD} ${groupTokens.text} ${groupTokens.bg}`}>{formatMoney(row.paidTotal)}</td>
            </tr>
          );
        }

        if (row.type === 'grandtotal') {
          return (
            <tr key={row.key}>
              <td className={`${GRANDTOTAL_TD} text-left!`}>Загалом</td>
              {weeks.map((week) => (
                <td key={week.id} className={`${GRANDTOTAL_TD} font-medium`}>
                  {renderAmount(formatMoney(row.weekTotals[week.id] ?? 0), false)}
                </td>
              ))}
              <td className={`${GRANDTOTAL_TD} font-bold`}>{formatMoney(row.total)}</td>
              <td className={`${GRANDTOTAL_TD} font-medium`}>{formatMoney(row.paidTotal)}</td>
            </tr>
          );
        }

        const { line } = row;
        return (
          <tr key={row.key} className="group hover:bg-slate-50">
            <td
              className={`${TD_CLASS} font-medium border-r border-slate-200 cursor-pointer group-hover:bg-slate-50`}
              onClick={() => onSelect(line)}
            >
              <div className="capitalize">{line.displayName}</div>
              {line.legalEntityName && !HR_SEED_LEGAL_ENTITY_CODES.has(line.legalEntityCode) ? (
                <HrSpecChip tokens={hrEmployerTokensFromName(line.legalEntityName)} className="mt-1 h-5">
                  {line.legalEntityName}
                </HrSpecChip>
              ) : null}
            </td>
            {weeks.map((week) => {
              const raw = row.weekRaw[week.id];
              const value = row.weekValues[week.id];
              const paid = isCellPaid(line.employmentId, week.id);
              return (
                <td
                  key={week.id}
                  className={`${AMOUNT_TD} ${paid ? PAID_CELL : 'group-hover:bg-slate-50'}`}
                >
                  {renderAmount(value, paid, raw ? () => openCellAction(line, week, raw) : undefined)}
                </td>
              );
            })}
            <td
              className={`${AMOUNT_TD} font-medium group-hover:bg-slate-50 ${
                isCellPaid(line.employmentId, null) ? PAID_CELL : ''
              }`}
            >
              {renderAmount(
                formatMoney(line.toPayAmount),
                isCellPaid(line.employmentId, null),
                line.toPayAmount ? () => openCellAction(line, null, line.toPayAmount) : undefined,
              )}
            </td>
            <td className={`${AMOUNT_TD} text-neutral-500 group-hover:bg-slate-50`}>{row.paid}</td>
          </tr>
        );
      })}
    </tbody>
  );

  return (
    <>
      <div className="relative min-w-0 w-full">
        <div ref={sentinelRef} aria-hidden className="h-0" />

        <div
          className={`sticky top-0 z-20 overflow-hidden border-x-2 border-t-2 border-neutral-800 bg-neutral-800 transition-all duration-200 ${
            isStuck ? 'shadow-md' : 'rounded-tr-lg'
          }`}
        >
          <div
            ref={headerScrollRef}
            className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={() => syncHorizontalScroll('header')}
          >
            <table className={TABLE_CLASS} style={{ minWidth: tableMinWidth }}>
              {renderColGroup()}
              <thead>{headerRow}</thead>
            </table>
          </div>
        </div>

        <div
          ref={bodyScrollRef}
          className="overflow-x-auto rounded-lg rounded-t-none border-2 border-neutral-800 border-t-0 bg-white"
          onScroll={() => syncHorizontalScroll('body')}
        >
          <table className={TABLE_CLASS} style={{ minWidth: tableMinWidth }}>
            {renderColGroup()}
            {renderTableBody()}
          </table>
        </div>
      </div>

      <PayrollCellActionModal
        isOpen={Boolean(cellAction)}
        line={cellAction?.line ?? null}
        week={cellAction?.week ?? null}
        rawAmount={cellAction?.rawAmount ?? ''}
        isPaid={cellAction ? isCellPaid(cellAction.line.employmentId, cellAction.week?.id ?? null) : false}
        canMarkPaid={canEditPayouts}
        marking={marking}
        onClose={() => setCellAction(null)}
        onMarkPaid={(amount) => void markPaid(amount)}
        onOpenDrawer={() => {
          if (cellAction) onSelect(cellAction.line);
          setCellAction(null);
        }}
      />
    </>
  );
}
