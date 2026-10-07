import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, DateRangePicker, Select, SelectItem, Spinner, Tab } from '@heroui/react';
import { parseDate, type DateValue } from '@internationalized/date';
import { I18nProvider } from '@react-aria/i18n';
import type { DateRange } from '@react-types/datepicker';
import PageTabs from '@/components/PageTabs';
import { DynamicIcon } from 'lucide-react/dynamic';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { ToastService } from '@/services/ToastService';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  HR_PAY_GROUP_LABELS,
  HR_TIMESHEET_GROUP_FILTERS,
  HR_TIMESHEET_GROUP_TO_PAY,
  HR_PAY_GROUP_TO_FILTER,
  type HrPayrollLineDto,
  HR_PAYROLL_PERIOD_MODES,
  type HrPayrollLoadDto,
  type HrPayrollPeriodMode,
  type HrPayrollPeriodOptions,
  type HrTimesheetGroupFilter,
} from '@shared/types/hr';
import { useHrSettings } from '@/hooks/useHrSettings';
import { TableBuilder } from '@/components/table/TableBuilder';
import { getSpecColorByHue } from '@shared/utils/specColorPalette';
import { formatYearMonth, parseYearMonth } from '@shared/utils/hrTimesheetCalendar';
import { PayrollTable } from './Payroll/PayrollTable';
import { PayrollLineDrawer } from './Payroll/PayrollLineDrawer';
import { PayrollHelpDrawer } from './Payroll/PayrollHelpDrawer';
import { HR_BTN_PRIMARY, HR_BTN_WARNING } from '@/lib/buttonStyles';
import { HR_BTN_NEUTRAL, HrSpecChip } from './hrUi';

function parseGroupParam(raw: string | null): HrTimesheetGroupFilter | null {
  if (!raw) return null;
  return (HR_TIMESHEET_GROUP_FILTERS as readonly string[]).includes(raw)
    ? (raw as HrTimesheetGroupFilter)
    : null;
}

function formatMoney(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ymdToDateValue(value: string): DateValue | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

function dateValueToYmd(value: DateValue): string {
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

export default function HrPayrollPage() {
  const { hasPermission } = useRoleAccess();
  const canView = hasPermission(PERMISSIONS.PAGE_HR_PAYROLL);
  const canCalculate = hasPermission(PERMISSIONS.ACTION_HR_PAYROLL_VIEW);
  const canRevealCard = hasPermission(PERMISSIONS.ACTION_HR_PAYOUTS_VIEW);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<HrPayrollLoadDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<HrPayrollLineDto | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const monthKey = (() => {
    const raw = params.get('month');
    try {
      const parsed = parseYearMonth(raw ?? undefined);
      return formatYearMonth(parsed.year, parsed.month);
    } catch {
      const now = new Date();
      return formatYearMonth(now.getFullYear(), now.getMonth() + 1);
    }
  })();
  const { year, month } = parseYearMonth(monthKey);
  const monthDate = new Date(year, month - 1, 1);
  const groupFilter = parseGroupParam(params.get('group'));
  const periodMode = (() => {
    const raw = params.get('periodMode');
    return raw && (HR_PAYROLL_PERIOD_MODES as readonly string[]).includes(raw)
      ? (raw as HrPayrollPeriodMode)
      : 'production';
  })();
  const dateFrom = params.get('dateFrom') ?? '';
  const dateTo = params.get('dateTo') ?? '';

  const periodOptionsPayload = useMemo((): HrPayrollPeriodOptions => {
    const payload: HrPayrollPeriodOptions = { periodMode };
    if (periodMode === 'custom' && dateFrom && dateTo) {
      payload.dateFrom = dateFrom;
      payload.dateTo = dateTo;
    }
    return payload;
  }, [periodMode, dateFrom, dateTo]);

  const {
    effectiveSettings,
    canSaveGlobal,
    saveGlobal,
    saving: savingSettings,
    setLocalOverrides,
  } = useHrSettings('payroll');

  const load = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ month: key, periodMode });
      if (periodMode === 'custom' && dateFrom && dateTo) {
        query.set('dateFrom', dateFrom);
        query.set('dateTo', dateTo);
      }
      const response = await fetch(`/api/hr/payroll?${query.toString()}`, {
        credentials: 'include',
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося завантажити розрахунок', color: 'danger' });
        return;
      }
      setData(json.data as HrPayrollLoadDto);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, periodMode]);

  useEffect(() => {
    if (!canView) return;
    void load(monthKey);
  }, [canView, load, monthKey, periodMode, dateFrom, dateTo]);

  useEffect(() => {
    setSelected((current) => {
      if (!current || !data) return current;
      return data.lines.find((line) => line.employmentId === current.employmentId) ?? null;
    });
  }, [data]);

  const visibleLines = useMemo(() => {
    if (!data) return [];
    return data.lines.filter((line) => {
      if (groupFilter && HR_PAY_GROUP_TO_FILTER[line.payGroup] !== groupFilter) return false;
      return true;
    });
  }, [data, groupFilter]);

  const paidByEmployment = useMemo(() => {
    const map = new Map<number, number>();
    if (!data) return map;
    for (const payout of data.payouts) {
      map.set(payout.employmentId, (map.get(payout.employmentId) ?? 0) + Number(payout.amount));
    }
    return map;
  }, [data]);

  const setMonthParam = (next: Date) => {
    const key = formatYearMonth(next.getFullYear(), next.getMonth() + 1);
    const nextParams = new URLSearchParams(params);
    nextParams.set('month', key);
    setParams(nextParams);
  };

  const setPeriodMode = (next: HrPayrollPeriodMode) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('periodMode', next);
    if (next !== 'custom') {
      nextParams.delete('dateFrom');
      nextParams.delete('dateTo');
    } else if (!dateFrom || !dateTo) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const from = `${year}-${String(month).padStart(2, '0')}-01`;
      const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      nextParams.set('dateFrom', from);
      nextParams.set('dateTo', to);
    }
    setParams(nextParams);
  };

  const customDateRange = useMemo((): DateRange | null => {
    const start = ymdToDateValue(dateFrom);
    const end = ymdToDateValue(dateTo);
    if (start && end) return { start, end };
    return null;
  }, [dateFrom, dateTo]);

  const setCustomDateRange = (range: DateRange | null) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('periodMode', 'custom');
    if (range?.start && range?.end) {
      const from = dateValueToYmd(range.start);
      const to = dateValueToYmd(range.end);
      nextParams.set('dateFrom', from);
      nextParams.set('dateTo', to);
      nextParams.set('month', formatYearMonth(range.start.year, range.start.month));
    } else {
      nextParams.delete('dateFrom');
      nextParams.delete('dateTo');
    }
    setParams(nextParams);
  };

  const setGroup = (next: HrTimesheetGroupFilter | null) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('month', monthKey);
    if (next) nextParams.set('group', next);
    else nextParams.delete('group');
    setParams(nextParams);
  };

  const calculate = async () => {
    if (!canCalculate) return;
    setBusy(true);
    try {
      const response = await fetch('/api/hr/payroll/calculate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthKey, version: data?.period?.version, ...periodOptionsPayload }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 409) {
        ToastService.show({ title: json.message || 'Розрахунок змінено. Оновіть дані.', color: 'warning' });
        await load(monthKey);
        return;
      }
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося розрахувати', color: 'danger' });
        return;
      }
      setData(json.data as HrPayrollLoadDto);
      ToastService.show({ title: 'Знімок розрахунку збережено', color: 'success' });
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    if (!data?.period || !canCalculate) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/hr/payroll/${data.period.id}/lock`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: data.period.version, ...periodOptionsPayload }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося заблокувати', color: 'danger' });
        return;
      }
      setData(json.data as HrPayrollLoadDto);
      setLockOpen(false);
      ToastService.show({ title: 'Розрахунок заблоковано', color: 'success' });
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Доступ заборонено</h2>
          <p className="text-gray-600">У вас немає прав доступу до розрахунку виплат.</p>
        </div>
      </div>
    );
  }

  const locked = data?.period?.status === 'locked';
  const canEditPayouts = Boolean(canCalculate && data?.period && data.period.status !== 'draft');
  const timesheetHref = `/hr/timesheet?month=${monthKey}${groupFilter ? `&group=${groupFilter}` : ''}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-xl p-3 md:p-4 flex flex-wrap items-center gap-3">
        <Select
          size="sm"
          className="w-52"
          aria-label="Режим періоду"
          selectedKeys={[periodMode]}
          onSelectionChange={(keys) => {
            const value = Array.from(keys)[0];
            if (typeof value === 'string') setPeriodMode(value as HrPayrollPeriodMode);
          }}
        >
          <SelectItem key="production">По виробничих тижнях</SelectItem>
          <SelectItem key="month">По місяцях</SelectItem>
          <SelectItem key="custom">Довільний період</SelectItem>
        </Select>
        {periodMode === 'custom' ? (
          <I18nProvider locale="uk-UA">
            <DateRangePicker
              aria-label="Довільний період"
              size="sm"
              value={customDateRange}
              onChange={setCustomDateRange}
              selectorButtonPlacement="start"
              selectorIcon={<DynamicIcon name="calendar" size={16} />}
              classNames={{
                base: 'w-auto',
                inputWrapper: 'h-8 min-h-8',
                segment: 'rounded-[4px]',
              }}
            />
          </I18nProvider>
        ) : (
          <MonthSwitcher value={monthDate} onChange={setMonthParam} disableFuture={false} size="sm" />
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {locked ? (
            <HrSpecChip tokens={getSpecColorByHue('amber', 'light', 'soft')}>Заблоковано</HrSpecChip>
          ) : data?.source === 'preview' ? (
            <HrSpecChip tokens={getSpecColorByHue('slate', 'light', 'soft')}>Попередній перегляд</HrSpecChip>
          ) : (
            <HrSpecChip tokens={getSpecColorByHue('emerald', 'light', 'soft')}>Знімок</HrSpecChip>
          )}
          <Button
            size="sm"
            variant="flat"
            className={HR_BTN_NEUTRAL}
            onPress={() => setHelpOpen(true)}
            startContent={<DynamicIcon name="circle-question-mark" size={14} />}
          >
            Довідка
          </Button>
          <Button
            size="sm"
            className={HR_BTN_PRIMARY}
            onPress={() => void calculate()}
            isDisabled={!canCalculate || locked}
            isLoading={busy}
          >
            Розрахувати
          </Button>
          <Button
            size="sm"
            className={HR_BTN_WARNING}
            onPress={() => setLockOpen(true)}
            isDisabled={!canCalculate || !data?.period || locked || data.period.status !== 'calculated'}
          >
            Заблокувати
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-sm text-gray-600">
          Розрахунок за ставкою, годинами табеля та правилами податків. Це не податковий облік. Зміна годин – лише в табелі.
        </p>
        {data ? (
          <div className="flex flex-wrap gap-2">
            <HrSpecChip tokens={getSpecColorByHue('blue', 'light', 'medium')} className="rounded-sm">
              До виплати: {formatMoney(data.summary.toPay)}
            </HrSpecChip>
            <HrSpecChip tokens={getSpecColorByHue('lime', 'light', 'medium')} className="rounded-sm">
              Виплачено: {formatMoney(data.summary.paid)}
            </HrSpecChip>
            <HrSpecChip tokens={getSpecColorByHue('orange', 'light', 'medium')} className="rounded-sm">
              Готівкою: {formatMoney(data.summary.cash)}
            </HrSpecChip>
          </div>
        ) : null}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : data ? (
        <div className="flex flex-col min-w-0">
          <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <PageTabs
              selectedKey={groupFilter ?? 'all'}
              onSelectionChange={(key) => {
                const next = String(key);
                setGroup(next === 'all' ? null : (next as HrTimesheetGroupFilter));
              }}
              className="self-start"
              classNames={{
                tabList: "gap-2 p-[6px] bg-neutral-700 rounded-t-lg rounded-b-none",
                cursor: "bg-neutral-600 text-white shadow-sm rounded-md",
                tab: "px-3 py-1.5 h-6 text-sm font-normal data-[hover-unselected=true]:opacity-100 text-neutral-500",
                tabContent: "group-data-[selected=true]:text-white text-neutral-400",
              }}
            >
              <Tab key="all" title="Усі" />
              {HR_TIMESHEET_GROUP_FILTERS.map((key) => (
                <Tab key={key} title={HR_PAY_GROUP_LABELS[HR_TIMESHEET_GROUP_TO_PAY[key]]} />
              ))}
            </PageTabs>
            {periodMode !== 'custom' ? (
              <TableBuilder
                config={effectiveSettings.tableBuilder}
                onChange={(config) => setLocalOverrides({ tableBuilder: config })}
                canSaveGlobal={canSaveGlobal}
                savingGlobal={savingSettings}
                onSaveGlobal={() => void saveGlobal({ tableBuilder: effectiveSettings.tableBuilder })}
              />
            ) : null}
          </div>
          <PayrollTable
            weeks={data.weeks}
            lines={visibleLines}
            payouts={data.payouts}
            paidByEmployment={paidByEmployment}
            periodId={data.period?.id ?? null}
            periodMode={data.periodMode ?? periodMode}
            tableConfig={effectiveSettings.tableBuilder}
            canEditPayouts={canEditPayouts}
            onSelect={setSelected}
            onPayoutsChanged={() => void load(monthKey)}
          />
        </div>
      ) : null}

      <PayrollLineDrawer
        line={selected}
        weeks={data?.weeks ?? []}
        payouts={data?.payouts ?? []}
        periodId={data?.period?.id ?? null}
        canEditPayouts={canEditPayouts}
        canRevealCard={canRevealCard}
        onClose={() => setSelected(null)}
        onPayoutsChanged={() => void load(monthKey)}
      />

      <PayrollHelpDrawer isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <ConfirmModal
        isOpen={lockOpen}
        title="Заблокувати розрахунок?"
        message="Після блокування знімок рядків не можна перерахувати з живих ставок."
        confirmText="Заблокувати"
        confirmColor="warning"
        confirmLoading={busy}
        onConfirm={() => void lock()}
        onCancel={() => setLockOpen(false)}
      />
    </div>
  );
}
