import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input, Spinner, Tab } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import PageTabs from '@/components/PageTabs';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { ToastService } from '@/services/ToastService';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  HR_PAY_GROUP_LABELS,
  HR_TIMESHEET_GROUP_FILTERS,
  HR_TIMESHEET_GROUP_TO_PAY,
  HR_PAY_GROUP_TO_FILTER,
  type HrTimesheetGroupFilter,
  type HrTimesheetLoadDto,
  type HrTimesheetEntryWrite,
} from '@shared/types/hr';
import { formatYearMonth, parseYearMonth } from '@shared/utils/hrTimesheetCalendar';
import {
  cellsEqual,
  codeCell,
  emptyCell,
  type HrTimesheetCellValue,
} from '@shared/utils/hrTimesheetCell';
import { TimesheetGrid } from './Timesheet/TimesheetGrid';
import { TimesheetKindLegend } from './Timesheet/TimesheetKindLegend';
import { useHrTimesheetKindColors } from './useHrTimesheetKindColors';
import { HR_BTN_NEUTRAL, HR_BTN_PRIMARY, HrSpecChip, hrPayGroupTokens } from './hrUi';

const COLOR_SETTINGS_STORAGE_KEY = 'hr.timesheet.colorSettingsOpen';

function entriesToMap(rows: HrTimesheetLoadDto['rows']): Record<string, HrTimesheetCellValue> {
  const map: Record<string, HrTimesheetCellValue> = {};
  for (const row of rows) {
    for (const entry of row.entries) {
      map[`${row.employmentId}:${entry.date}`] = {
        kind: entry.kind,
        hours: entry.hours,
      };
    }
  }
  return map;
}

function parseGroupParam(raw: string | null): HrTimesheetGroupFilter | null {
  if (!raw) return null;
  return (HR_TIMESHEET_GROUP_FILTERS as readonly string[]).includes(raw)
    ? (raw as HrTimesheetGroupFilter)
    : null;
}

export default function HrTimesheetPage() {
  const { hasPermission } = useRoleAccess();
  const canView = hasPermission(PERMISSIONS.PAGE_HR_TIMESHEET);
  const canEditPerm = hasPermission(PERMISSIONS.ACTION_HR_TIMESHEET_EDIT);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<HrTimesheetLoadDto | null>(null);
  const [draft, setDraft] = useState<Record<string, HrTimesheetCellValue>>({});
  const [original, setOriginal] = useState<Record<string, HrTimesheetCellValue>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [colorSettingsOpen, setColorSettingsOpen] = useState(() => {
    try {
      return localStorage.getItem(COLOR_SETTINGS_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [liveMessage, setLiveMessage] = useState('');
  const saveInFlight = useRef(false);
  const kindColors = useHrTimesheetKindColors();

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

  const canEdit = Boolean(canEditPerm && data?.month.status === 'draft');
  const isDirty = useMemo(() => {
    const keys = new Set([...Object.keys(draft), ...Object.keys(original)]);
    for (const key of keys) {
      if (!cellsEqual(draft[key] ?? emptyCell(), original[key] ?? emptyCell())) return true;
    }
    return false;
  }, [draft, original]);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/hr/timesheet?month=${encodeURIComponent(key)}`, {
        credentials: 'include',
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося завантажити табель', color: 'danger' });
        return;
      }
      const payload = json.data as HrTimesheetLoadDto;
      const map = entriesToMap(payload.rows);
      setData(payload);
      setDraft(map);
      setOriginal(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    void load(monthKey);
  }, [canView, load, monthKey]);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (groupFilter && HR_PAY_GROUP_TO_FILTER[row.payGroup] !== groupFilter) return false;
      if (q && !row.displayName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, groupFilter, search]);

  const save = useCallback(async () => {
    if (!data || !canEdit || saveInFlight.current) return;
    const entries: HrTimesheetEntryWrite[] = [];
    const keys = new Set([...Object.keys(draft), ...Object.keys(original)]);
    for (const key of keys) {
      const current = draft[key] ?? emptyCell();
      const base = original[key] ?? emptyCell();
      if (cellsEqual(current, base)) continue;
      const [employmentIdRaw, date] = key.split(':');
      const employmentId = Number(employmentIdRaw);
      entries.push({
        employmentId,
        date,
        kind: current.kind,
        hours: current.hours,
      });
    }
    saveInFlight.current = true;
    setSaving(true);
    try {
      const response = await fetch(`/api/hr/timesheet/${data.month.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: data.month.version, entries }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 409) {
        ToastService.show({
          title: json.message || 'Табель змінено. Оновіть дані.',
          color: 'warning',
        });
        await load(monthKey);
        throw new Error(json.message || 'conflict');
      }
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося зберегти табель', color: 'danger' });
        throw new Error(json.message || 'save failed');
      }
      await load(monthKey);
      ToastService.show({ title: 'Табель збережено', color: 'success' });
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }, [canEdit, data, draft, load, monthKey, original]);

  const guard = useUnsavedGuard({ isDirty, onSaveDraft: save });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (isDirty && canEdit) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, isDirty, save]);

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

  const onChangeCell = (employmentId: number, date: string, value: HrTimesheetCellValue) => {
    setDraft((current) => {
      const next = { ...current };
      const key = `${employmentId}:${date}`;
      if (value.kind == null) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const fillWeekends = () => {
    if (!data || !canEdit) return;
    setDraft((current) => {
      const next = { ...current };
      for (const row of visibleRows) {
        for (const day of data.days) {
          if (!day.isWeekend) continue;
          const key = `${row.employmentId}:${day.date}`;
          const value = next[key] ?? emptyCell();
          if (value.kind == null) next[key] = codeCell('В');
        }
      }
      return next;
    });
  };

  const toggleColorSettings = () => {
    setColorSettingsOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLOR_SETTINGS_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Доступ заборонено</h2>
          <p className="text-gray-600">У вас немає прав доступу до табеля.</p>
        </div>
      </div>
    );
  }

  const payrollHref = `/hr/payroll?month=${monthKey}${groupFilter ? `&group=${groupFilter}` : ''}`;

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
          {data?.month.status === 'closed' ? (
            <HrSpecChip tokens={hrPayGroupTokens('unofficial_cash')}>Закрито</HrSpecChip>
          ) : null}
          {!canEditPerm ? (
            <span className="text-xs font-medium text-rose-700 bg-rose-100 border border-rose-200 rounded-full px-2 py-0.5">
              Немає права редагувати табель
            </span>
          ) : null}
          {data ? (
            <span className="text-xs text-slate-500">Норма {data.month.normWorkDays} дн. / {data.month.normHours} год</span>
          ) : null}
          <Button size="sm" className={HR_BTN_NEUTRAL} onPress={fillWeekends} isDisabled={!canEdit}>
            Заповнити вихідні В
          </Button>
          <Button
            size="sm"
            className={HR_BTN_PRIMARY}
            onPress={() => void save()}
            isDisabled={!canEdit || !isDirty}
            isLoading={saving}
            startContent={!saving ? <DynamicIcon name="save" size={14} /> : undefined}
          >
            Зберегти
          </Button>
        </div>
      </div>

      <TimesheetKindLegend
        colorSettingsOpen={colorSettingsOpen}
        onToggleColorSettings={toggleColorSettings}
        hueFor={kindColors.hueFor}
        onHueChange={kindColors.setHue}
      />

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : data ? (
        <div className="flex flex-col min-w-0 mt-6">
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
          <TimesheetGrid
          days={data.days}
          weeks={data.weeks}
          rows={visibleRows}
          draft={draft}
          original={original}
          readOnly={!canEdit}
          canEdit={canEdit}
          onChangeCell={onChangeCell}
          liveMessage={liveMessage}
          onLiveMessage={setLiveMessage}
          kindHues={kindColors.overrides}
        />
        </div>
      ) : null}

      <UnsavedChangesModal {...guard.modalProps} />
    </div>
  );
}
