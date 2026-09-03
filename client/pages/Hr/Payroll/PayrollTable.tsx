import { Fragment } from 'react';
import { HR_PAY_GROUP_LABELS, type HrPayGroup, type HrPayrollLineDto, type HrPayrollWeekAmount } from '@shared/types/hr';
import type { HrTimesheetWeekDto } from '@shared/types/hr';
import { specColorToClassNames } from '@shared/utils/specColorPalette';
import { HrSpecChip, hrLegalEntityTokens, hrPayGroupTokens } from '../hrUi';

function formatMoney(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PayrollTableProps {
  weeks: HrTimesheetWeekDto[];
  lines: HrPayrollLineDto[];
  paidByEmployment: Map<number, number>;
  onSelect: (line: HrPayrollLineDto) => void;
}

export function PayrollTable({ weeks, lines, paidByEmployment, onSelect }: PayrollTableProps) {
  if (lines.length === 0) {
    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <p className="p-8 text-sm text-gray-500 text-center">Немає рядків розрахунку за цей місяць.</p>
      </div>
    );
  }

  let lastGroup: HrPayGroup | null = null;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide border-b border-gray-200">
            <th className="px-3 py-2.5 text-left sticky left-0 bg-gray-50 z-10 min-w-48">ПІБ</th>
            {weeks.map((week) => (
              <th key={week.id} className="px-3 py-2.5 text-right whitespace-nowrap">
                {week.label}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right whitespace-nowrap">Разом</th>
            <th className="px-3 py-2.5 text-right whitespace-nowrap">Виплачено</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((line) => {
            const showGroup = line.payGroup !== lastGroup;
            lastGroup = line.payGroup;
            const weekMap = new Map(line.weekAmounts.map((item: HrPayrollWeekAmount) => [item.weekId, item]));
            const paid = paidByEmployment.get(line.employmentId) ?? 0;
            const groupTokens = hrPayGroupTokens(line.payGroup);
            const groupBar = specColorToClassNames(groupTokens, { border: false, intensity: 'medium' });
            return (
              <Fragment key={line.employmentId}>
                {showGroup ? (
                  <tr>
                    <td
                      className={`px-3 py-1.5 text-xs font-semibold sticky left-0 ${groupBar}`}
                      colSpan={weeks.length + 3}
                    >
                      {HR_PAY_GROUP_LABELS[line.payGroup]}
                    </td>
                  </tr>
                ) : null}
                <tr
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => onSelect(line)}
                >
                  <td className="px-3 py-2.5 sticky left-0 bg-white font-medium whitespace-nowrap">
                    <div>{line.displayName}</div>
                    <HrSpecChip tokens={hrLegalEntityTokens(line.legalEntityCode)} className="mt-1 h-5">
                      {line.legalEntityName}
                    </HrSpecChip>
                  </td>
                  {weeks.map((week) => {
                    const cell = weekMap.get(week.id);
                    return (
                      <td key={week.id} className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {cell ? formatMoney(cell.toPay) : '—'}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium whitespace-nowrap">
                    {formatMoney(line.toPayAmount)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600 whitespace-nowrap">
                    {formatMoney(paid.toFixed(2))}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
