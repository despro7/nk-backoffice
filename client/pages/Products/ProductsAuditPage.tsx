import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, SelectItem } from '@heroui/react';
import { getLocalTimeZone, today } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useNavigate } from 'react-router-dom';
import { AUDIT_SOURCES, AUDIT_SOURCE_LABELS } from '@shared/constants/auditEntities';
import { CATALOG_AUDIT_ACTION_LABELS } from '@shared/utils/catalogGoodAuditFormat';
import type { CatalogDictionariesDto } from '@shared/types/catalog';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import ReportDateRangeFilter from '@/pages/Reports/shared/filters/ReportDateRangeFilter';
import ReportSingleSelectFilter from '@/pages/Reports/shared/filters/ReportSingleSelectFilter';
import ReportResetFiltersButton from '@/pages/Reports/shared/filters/ReportResetFiltersButton';
import { CUSTOM_PRESET_KEY, dateRangeToIsoBounds, DEFAULT_PRESET_KEY } from '@/pages/ChatwootBotStatistics/dateRange';
import { catalogApi } from './catalogApi';
import { CatalogAuditFeed } from './components/audit/CatalogAuditFeed';
import { useCatalogAuditFeed } from './components/audit/useCatalogAuditFeed';

const ALL = '__all__';

/** Журнал змін каталогу: хто, що і коли змінював у товарах. */
export default function ProductsAuditPage() {
  const navigate = useNavigate();
  const datePresets = useMemo(() => createStandardDatePresets(), []);
  const maxDate = useMemo(() => today(getLocalTimeZone()), []);
  const [datePresetKey, setDatePresetKey] = useState<string>(DEFAULT_PRESET_KEY);
  const [dateRange, setDateRange] = useState<DateRange | null>(
    () => datePresets.find((p) => p.key === DEFAULT_PRESET_KEY)?.getRange() ?? null,
  );
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [userId, setUserId] = useState<string>(ALL);
  const [action, setAction] = useState<string>(ALL);
  const [source, setSource] = useState<string>(ALL);
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [dictionaries, setDictionaries] = useState<CatalogDictionariesDto | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    catalogApi.fetchAuditUsers().then(setUsers).catch(() => setUsers([]));
    fetch('/api/catalog/dictionaries', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => (json?.success ? setDictionaries(json.data as CatalogDictionariesDto) : undefined))
      .catch(() => undefined);
  }, []);

  const rangeIso = useMemo(() => dateRangeToIsoBounds(dateRange), [dateRange]);

  const load = useCallback(
    (cursor: number | null) =>
      catalogApi.fetchAudit(
        {
          from: rangeIso?.from,
          to: rangeIso?.to,
          q: debouncedSearch.trim() || undefined,
          userId: userId === ALL ? undefined : Number(userId),
          action: action === ALL ? undefined : action,
          source: source === ALL ? undefined : source,
        },
        cursor,
      ),
    [rangeIso, debouncedSearch, userId, action, source],
  );
  const feed = useCatalogAuditFeed(load, [load]);

  const applyPreset = (key: string | null) => {
    const preset = datePresets.find((p) => p.key === key);
    if (!preset) return;
    setDatePresetKey(preset.key);
    setDateRange(preset.getRange());
  };

  const filtersChanged =
    datePresetKey !== DEFAULT_PRESET_KEY || userId !== ALL || action !== ALL || source !== ALL || search.trim() !== '';

  return (
    <div className="space-y-6">
      <p className="text-sm text-default-500">
        Усі зміни товарів каталогу: дії користувачів, масові операції та зміни, що прийшли з Dilovod. Клік по назві
        товару відкриває його картку.
      </p>

      <div className="p-4 bg-white rounded-xl shadow-lg">
        <div className="flex flex-wrap items-end gap-3">
          <ReportSingleSelectFilter
            ariaLabel="Швидкий вибір періоду"
            placeholder="Оберіть період"
            iconName="calendar-check"
            className="w-48"
            selectedKey={datePresetKey}
            onChange={applyPreset}
            options={[
              ...datePresets.map(({ key, label }) => ({ key, label })),
              ...(datePresetKey === CUSTOM_PRESET_KEY ? [{ key: CUSTOM_PRESET_KEY, label: 'Обраний період' }] : []),
            ]}
          />
          <ReportDateRangeFilter
            value={dateRange}
            onChange={(range) => {
              setDateRange(range);
              setDatePresetKey(CUSTOM_PRESET_KEY);
            }}
            maxValue={maxDate}
          />
          <Button
            variant="flat"
            isDisabled={feed.loading}
            startContent={
              <DynamicIcon
                name={feed.loading ? 'loader-2' : 'refresh-cw'}
                size={16}
                className={feed.loading ? 'animate-spin' : ''}
              />
            }
            onPress={feed.reload}
          >
            Оновити
          </Button>
          {filtersChanged && (
            <ReportResetFiltersButton
              onPress={() => {
                applyPreset(DEFAULT_PRESET_KEY);
                setUserId(ALL);
                setAction(ALL);
                setSource(ALL);
                setSearch('');
              }}
            />
          )}
        </div>
      </div>

      <div className="p-4 bg-white rounded-xl shadow-lg">
        <h2 className="flex items-center gap-1 text-md font-semibold text-default-800 mb-1">
          <DynamicIcon name="history" size={16} />
          Журнал змін каталогу
        </h2>
        <p className="text-xs text-default-500 mb-3">Нові записи зверху. Пошук – за назвою або артикулом товару.</p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Input
            size="sm"
            isClearable
            aria-label="Пошук товару"
            placeholder="Назва або артикул…"
            className="flex-1 min-w-56"
            startContent={<DynamicIcon name="search" size={14} className="text-default-400" />}
            value={search}
            onValueChange={setSearch}
            onClear={() => setSearch('')}
          />
          <Select
            size="sm"
            aria-label="Користувач"
            className="w-52"
            selectedKeys={[userId]}
            onSelectionChange={(keys) => setUserId(String(Array.from(keys)[0] ?? ALL))}
          >
            {[
              <SelectItem key={ALL} textValue="Усі користувачі">
                Усі користувачі
              </SelectItem>,
              ...users.map((u) => (
                <SelectItem key={String(u.id)} textValue={u.name}>
                  {u.name}
                </SelectItem>
              )),
            ]}
          </Select>
          <Select
            size="sm"
            aria-label="Дія"
            className="w-56"
            selectedKeys={[action]}
            onSelectionChange={(keys) => setAction(String(Array.from(keys)[0] ?? ALL))}
          >
            {[
              <SelectItem key={ALL} textValue="Усі дії">
                Усі дії
              </SelectItem>,
              ...Object.entries(CATALOG_AUDIT_ACTION_LABELS).map(([key, label]) => (
                <SelectItem key={key} textValue={label}>
                  {label}
                </SelectItem>
              )),
            ]}
          </Select>
          <Select
            size="sm"
            aria-label="Джерело"
            className="w-44"
            selectedKeys={[source]}
            onSelectionChange={(keys) => setSource(String(Array.from(keys)[0] ?? ALL))}
          >
            {[
              <SelectItem key={ALL} textValue="Усі джерела">
                Усі джерела
              </SelectItem>,
              ...AUDIT_SOURCES.map((key) => (
                <SelectItem key={key} textValue={AUDIT_SOURCE_LABELS[key]}>
                  {AUDIT_SOURCE_LABELS[key]}
                </SelectItem>
              )),
            ]}
          </Select>
        </div>

        <CatalogAuditFeed
          items={feed.items}
          loading={feed.loading}
          error={feed.error}
          hasMore={feed.hasMore}
          onLoadMore={feed.loadMore}
          dictionaries={dictionaries}
          showGood
          onGoodClick={(goodId) => navigate(`/products#good=${encodeURIComponent(goodId)}`)}
          emptyText="За обраними фільтрами змін немає."
        />
      </div>
    </div>
  );
}
