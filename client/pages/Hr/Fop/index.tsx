import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardBody,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  HR_PAY_GROUP_LABELS,
  type HrFopSummaryDto,
  type HrPayGroup,
} from '@shared/types/hr';
import { formatMoney } from '@/lib/formatUtils';
import { ToastService } from '@/services/ToastService';
import { ReportsFilterBuilder } from '@/pages/Reports/shared/filters';
import { useHrWorkWeekPeriodFilter } from '../shared/useHrWorkWeekPeriodFilter';
import { HR_TABLE_CLASS_NAMES, HrSpecChip, hrKindTokens, hrPayGroupTokens, hrStatusTokens } from '../hrUi';

export default function HrFopPage() {
  const { hasPermission } = useRoleAccess();
  const canView = hasPermission(PERMISSIONS.PAGE_HR_FOP);

  const { dateFrom, dateTo, initialized, filters } = useHrWorkWeekPeriodFilter();
  const [summary, setSummary] = useState<HrFopSummaryDto | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      setSummary(null);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      const response = await fetch(`/api/hr/fop?${params.toString()}`, { credentials: 'include' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося завантажити зведення ФОП', color: 'danger' });
        setSummary(null);
        return;
      }
      setSummary(json.data ?? null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!initialized) return;
    void fetchSummary();
  }, [fetchSummary, initialized]);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-default-900 mb-4">Доступ заборонено</h2>
          <p className="text-default-500">У вас немає прав доступу до зведення фонду оплати праці.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-default-500 max-w-md">
          Зведення витрат роботодавця за період – база для майбутньої калькуляції собівартості
        </p>
        <ReportsFilterBuilder filters={filters} className="flex flex-wrap gap-2 items-end" />
      </div>

      <Card shadow="none" className="border border-default-200">
        <CardBody className="flex flex-col gap-4 p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : summary ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-3xl font-semibold tabular-nums text-default-900">
                  {formatMoney(summary.totalEmployerCost)} ₴
                </div>
                <HrSpecChip
                  tokens={summary.source === 'snapshot' ? hrStatusTokens('active') : hrKindTokens('amber')}
                >
                  {summary.source === 'snapshot' ? 'Зі знімка розрахунку' : 'Попередній перегляд'}
                </HrSpecChip>
              </div>

              {summary.warnings.length > 0 ? (
                <ul className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                  {summary.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(Object.keys(summary.byPayGroup) as HrPayGroup[]).map((group) => (
                  <Card key={group} shadow="none" className="border border-default-200 bg-default-50">
                    <CardBody className="py-3">
                      <div className="text-xs text-default-500">{HR_PAY_GROUP_LABELS[group]}</div>
                      <div className="text-lg font-semibold tabular-nums">{formatMoney(summary.byPayGroup[group])}</div>
                    </CardBody>
                  </Card>
                ))}
              </div>

              <Table aria-label="Фонд оплати праці по працівниках" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
                <TableHeader>
                  <TableColumn>Працівник</TableColumn>
                  <TableColumn>Група</TableColumn>
                  <TableColumn>ЄСВ</TableColumn>
                  <TableColumn>Премія</TableColumn>
                  <TableColumn>Дні періоду</TableColumn>
                  <TableColumn>Сума</TableColumn>
                </TableHeader>
                <TableBody emptyContent="Немає даних">
                  {summary.lines.map((line) => (
                    <TableRow key={line.employmentId}>
                      <TableCell className="capitalize">{line.displayName}</TableCell>
                      <TableCell>
                        <HrSpecChip tokens={hrPayGroupTokens(line.payGroup)} rounded="sm">
                          {HR_PAY_GROUP_LABELS[line.payGroup]}
                        </HrSpecChip>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatMoney(line.esvAmount)}</TableCell>
                      <TableCell className="tabular-nums">{formatMoney(line.bonusAmount)}</TableCell>
                      <TableCell>{line.includedDays}</TableCell>
                      <TableCell className="tabular-nums font-medium">{formatMoney(line.employerTotalCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
