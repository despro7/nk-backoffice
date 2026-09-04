import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input, Spinner, Tab } from '@heroui/react';
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
  type HrPayrollLoadDto,
  type HrTimesheetGroupFilter,
} from '@shared/types/hr';
import { getSpecColorByHue } from '@shared/utils/specColorPalette';
import { formatYearMonth, parseYearMonth } from '@shared/utils/hrTimesheetCalendar';
import { PayrollTable } from './Payroll/PayrollTable';
import { PayrollLineDrawer } from './Payroll/PayrollLineDrawer';
import { PayrollHelpDrawer } from './Payroll/PayrollHelpDrawer';
import { PayrollFormulaDrawer } from './Payroll/PayrollFormulaDrawer';
import { HR_BTN_NEUTRAL, HR_BTN_PRIMARY, HR_BTN_WARNING, HrSpecChip } from './hrUi';

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
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<HrPayrollLineDto | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [formulaSaving, setFormulaSaving] = useState(false);

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

  const load = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/hr/payroll?month=${encodeURIComponent(key)}`, {
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
  }, []);

  useEffect(() => {
    if (!canView) return;
    void load(monthKey);
  }, [canView, load, monthKey]);

  useEffect(() => {
    setSelected((current) => {
      if (!current || !data) return current;
      return data.lines.find((line) => line.employmentId === current.employmentId) ?? null;
    });
  }, [data]);

  const visibleLines = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.lines.filter((line) => {
      if (groupFilter && HR_PAY_GROUP_TO_FILTER[line.payGroup] !== groupFilter) return false;
      if (q && !line.displayName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, groupFilter, search]);

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
        body: JSON.stringify({ month: monthKey, version: data?.period?.version }),
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
        body: JSON.stringify({ version: data.period.version }),
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

  const saveFormula = async (extraRate: string, grossDivisor: string) => {
    if (!canCalculate || locked) return;
    setFormulaSaving(true);
    try {
      const response = await fetch('/api/hr/payroll/formula', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthKey,
          extraRate,
          grossDivisor,
          version: data?.period?.version,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 409) {
        ToastService.show({ title: json.message || 'Розрахунок змінено. Оновіть дані.', color: 'warning' });
        await load(monthKey);
        return;
      }
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося зберегти формулу', color: 'danger' });
        return;
      }
      setData(json.data as HrPayrollLoadDto);
      setFormulaOpen(false);
      ToastService.show({ title: 'Налаштування формули збережено', color: 'success' });
    } finally {
      setFormulaSaving(false);
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
        <Input
          size="sm"
          placeholder="Пошук за ПІБ"
          value={search}
          onValueChange={setSearch}
          className="w-full sm:w-56"
          startContent={<DynamicIcon name="search" size={14} className="text-default-400" />}
        />
        <MonthSwitcher value={monthDate} onChange={setMonthParam} disableFuture={false} size="sm" />
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
            variant="flat"
            className={HR_BTN_NEUTRAL}
            onPress={() => setFormulaOpen(true)}
            startContent={<DynamicIcon name="calculator" size={14} />}
          >
            Формула
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

      <p className="text-sm text-gray-600 px-1">
        Внутрішній розрахунок як у файлі Табель 2026. Це не податковий облік. Зміна годин – лише в табелі.
      </p>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : data ? (
        <div className="flex flex-col min-w-0">
          <div className="flex flex-row items-center justify-between gap-2">
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
            {data ? (
              <div className="flex flex-wrap gap-2 px-1">
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
          <PayrollTable
            weeks={data.weeks}
            lines={visibleLines}
            payouts={data.payouts}
            paidByEmployment={paidByEmployment}
            periodId={data.period?.id ?? null}
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
      <PayrollFormulaDrawer
        isOpen={formulaOpen}
        formula={data?.formula ?? { formulaId: 'tabell-2026-v1', extraRate: '0.23', grossDivisor: '0.77' }}
        locked={locked}
        canEdit={canCalculate}
        saving={formulaSaving}
        onClose={() => setFormulaOpen(false)}
        onSave={(extraRate, grossDivisor) => void saveFormula(extraRate, grossDivisor)}
      />

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
