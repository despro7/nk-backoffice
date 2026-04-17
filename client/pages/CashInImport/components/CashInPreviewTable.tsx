import React from 'react';
import { Chip, Switch, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CashInRow } from '@shared/types/cashIn';
import CashInRowEditor from './CashInRowEditor';

interface CashInPreviewTableProps {
  rows: CashInRow[];
  onResolve: (rowIndex: number, patch: Partial<CashInRow>) => void;
}

// Конфіг статусів: колір рядка, іконка, підпис
const STATUS_CONFIG: Record<
  CashInRow['status'],
  { rowClass: string; chipColor: 'success' | 'warning' | 'danger'; label: string; icon: string }
> = {
  ok: {
    rowClass: 'bg-success-50/40',
    chipColor: 'success',
    label: 'OK',
    icon: 'circle-check',
  },
  amount_mismatch: {
    rowClass: 'bg-warning-50/60',
    chipColor: 'warning',
    label: 'Розбіжність суми',
    icon: 'circle-alert',
  },
  ambiguous: {
    rowClass: 'bg-warning-50/60',
    chipColor: 'warning',
    label: 'Кілька замовлень',
    icon: 'git-branch',
  },
  not_found: {
    rowClass: 'bg-danger-50/60',
    chipColor: 'danger',
    label: 'Не знайдено',
    icon: 'search-x',
  },
  duplicate_cash_in: {
    rowClass: 'bg-warning-50/60',
    chipColor: 'warning',
    label: 'Можливий дублікат',
    icon: 'copy-x',
  },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

const formatMoney = (n: number) =>
  n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CashInPreviewTable({ rows, onResolve }: CashInPreviewTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide border-b border-gray-200">
            <th className="px-3 py-2.5 text-left w-8">#</th>
            <th className="px-3 py-2.5 text-left">Статус</th>
            <th className="px-3 py-2.5 text-left">№ замовлення</th>
            <th className="px-3 py-2.5 text-left">Дата</th>
            <th className="px-3 py-2.5 text-left">Сума отримана</th>
            <th className="px-3 py-2.5 text-left">Комісія</th>
            <th className="px-3 py-2.5 text-left">Покупець</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const cfg = STATUS_CONFIG[row.status];
            const displayOrderNumber = row.resolvedOrderNumber ?? row.orderNumber ?? '—';
            const isDuplicate = row.status === 'duplicate_cash_in';
            const needsEditor = row.status !== 'ok' && !isDuplicate;

            return (
              <React.Fragment key={row.rowIndex}>
                {/* Основний рядок */}
                <tr className={`${cfg.rowClass} transition-colors ${isDuplicate || needsEditor ? 'border-b-0' : ''}`}>
                  <td className="px-3 py-2.5 text-gray-400">{row.rowIndex}</td>
                  <td className="px-3 py-2.5">
                    <Chip
                      color={cfg.chipColor}
                      size="sm"
                      variant="flat"
                      startContent={
                        <DynamicIcon name={cfg.icon as any} size={14} className="ml-1 mr0.5 shrink-0" />
                      }
                    >
                      {cfg.label}
                    </Chip>
                  </td>
									<td className="px-3 py-2.5 font-medium">
                    {displayOrderNumber}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                    {formatDate(row.transferDate)}
                  </td>
                  <td className="px-3 py-2.5 font-medium tabular-nums">
                    {formatMoney(row.amountReceived)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-500">
                    {formatMoney(row.commissionAmount)}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 max-w-[200px] truncate" title={row.buyerName}>
                    {row.buyerName}
                  </td>
                </tr>

                {/* Рядок попередження про дублікат */}
                {isDuplicate && (
                  <tr className={`${cfg.rowClass} border-b border-gray-200`}>
                    <td />
                    <td colSpan={6} className="px-3 pb-3 pt-0">
                      <div className="flex items-center gap-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2">
                        <DynamicIcon name="triangle-alert" size={15} className="text-warning-600 shrink-0" />
                        <span className="text-xs text-warning-700 flex-1">{row.errorMessage}</span>
                        <Tooltip
                          content="Підтверджую, що документ треба відправити повторно"
                          placement="top"
                          color="warning"
                        >
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-warning-700 whitespace-nowrap">Все одно відправити</span>
                            <Switch
                              size="sm"
                              color="warning"
                              isSelected={row.allowDuplicate ?? false}
                              onValueChange={(val) => onResolve(row.rowIndex, { allowDuplicate: val })}
                              aria-label="Дозволити відправку дубліката"
                            />
                          </div>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Рядок редагування (лише для рядків з помилкою, крім duplicate_cash_in) */}
                {needsEditor && (
                  <tr className={cfg.rowClass}>
                    <td />
                    <td colSpan={6} className="px-3 pb-3 pt-0">
                      <CashInRowEditor row={row} onResolve={onResolve} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
