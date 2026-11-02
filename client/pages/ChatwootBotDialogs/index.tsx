import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Chip,
  Input,
  Select,
  SelectItem,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { getLocalTimeZone, today } from '@internationalized/date';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { DateRange } from '@react-types/datepicker';
import {
  CHATWOOT_BOT_TURN_OUTCOMES,
  CHATWOOT_BOT_TURN_RETENTION_DAYS,
  type ChatwootBotDialogsResponse,
  type ChatwootBotTurnOutcome,
} from '@shared/types/chatwootBotDialogs';
import { PERMISSIONS } from '@shared/constants/permissions';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import ReportDateRangeFilter from '@/pages/Reports/shared/filters/ReportDateRangeFilter';
import ReportSingleSelectFilter from '@/pages/Reports/shared/filters/ReportSingleSelectFilter';
import ReportResetFiltersButton from '@/pages/Reports/shared/filters/ReportResetFiltersButton';
import { CUSTOM_PRESET_KEY, dateRangeToIsoBounds, DEFAULT_PRESET_KEY } from '../ChatwootBotStatistics/dateRange';
import { BotToolChip } from '../ChatwootBotSettings/components/InstructionEditor';
import { useKnowledgeArticleEditor, type InstructionSource } from '../ChatwootBotSettings/components/BotTurnView';
import { DialogDrawer } from './DialogDrawer';
import { formatDateTime, TURN_OUTCOME_META } from './dialogMeta';

const ALL = 'all';

/** Журнал розмов, на які реагував бот: що відповів і чому (з trace інструментів, як у пісочниці). */
const ChatwootBotDialogs: React.FC = () => {
  const { hasPermission } = useRoleAccess();
  const canReadSettings = hasPermission(PERMISSIONS.PAGE_CHATWOOT_SETTINGS);
  const datePresets = useMemo(() => createStandardDatePresets(), []);
  const [datePresetKey, setDatePresetKey] = useState<string>(DEFAULT_PRESET_KEY);
  const [dateRange, setDateRange] = useState<DateRange | null>(
    () => datePresets.find((p) => p.key === DEFAULT_PRESET_KEY)?.getRange() ?? null,
  );
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);
  const [outcome, setOutcome] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ChatwootBotDialogsResponse | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const { openArticle, drawer: articleDrawer } = useKnowledgeArticleEditor();

  const rangeIso = useMemo(() => dateRangeToIsoBounds(dateRange), [dateRange]);
  const maxDate = useMemo(() => today(getLocalTimeZone()), []);

  // Поточні тексти інструкцій — щоб упізнати їх у відповідях інструментів (лише з доступом до налаштувань).
  useEffect(() => {
    if (!canReadSettings) return;
    chatwootBotApi
      .getSettings()
      .then((s) => setOverrides(s.aiInstructions ?? {}))
      .catch(() => setOverrides({}));
  }, [canReadSettings]);
  const instructionSource: InstructionSource = canReadSettings ? { kind: 'link', overrides } : null;

  const applyPreset = (key: string | null) => {
    const preset = datePresets.find((p) => p.key === key);
    if (!preset) return;
    setDatePresetKey(preset.key);
    setDateRange(preset.getRange());
  };

  const load = useCallback(async () => {
    if (!rangeIso) return;
    setLoading(true);
    try {
      setData(
        await chatwootBotApi.getDialogs({
          from: rangeIso.from,
          to: rangeIso.to,
          search: debouncedSearch.trim() || undefined,
          outcome: outcome === ALL ? undefined : (outcome as ChatwootBotTurnOutcome),
        }),
      );
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося завантажити діалоги',
        color: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [rangeIso, debouncedSearch, outcome]);

  useEffect(() => {
    void load();
  }, [load]);

  const dialogs = data?.dialogs ?? [];
  const filtersChanged = datePresetKey !== DEFAULT_PRESET_KEY || outcome !== ALL || search.trim() !== '';

  return (
    <div className="space-y-6">
      <p className="text-sm text-default-500">
        Розмови, на які реагував бот: що він відповів і чому — модель, інструменти, верифікація. Зберігаються{' '}
        {CHATWOOT_BOT_TURN_RETENTION_DAYS} днів.
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
            isDisabled={loading}
            startContent={
              <DynamicIcon name={loading ? 'loader-2' : 'refresh-cw'} size={16} className={loading ? 'animate-spin' : ''} />
            }
            onPress={() => void load()}
          >
            Оновити
          </Button>
          {filtersChanged && (
            <ReportResetFiltersButton
              onPress={() => {
                applyPreset(DEFAULT_PRESET_KEY);
                setOutcome(ALL);
                setSearch('');
              }}
            />
          )}
        </div>
      </div>

      <div className="p-4 bg-white rounded-xl shadow-lg">
        <h2 className="flex items-center gap-1 text-md font-semibold text-default-800 mb-1">
          <DynamicIcon name="messages-square" size={16} />
          Діалоги бота
        </h2>
        <p className="text-xs text-default-500 mb-3">
          Клік по розмові відкриває діалог з логікою кожної відповіді. Звідти можна відкрити статтю бази знань або
          інструкцію, що сформувала відповідь. Пошук — за текстом клієнта або номером розмови.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Input
            size="sm"
            isClearable
            aria-label="Пошук по діалогах"
            placeholder="Пошук по повідомленнях або № розмови…"
            className="flex-1 min-w-56"
            startContent={<DynamicIcon name="search" size={14} className="text-default-400" />}
            value={search}
            onValueChange={setSearch}
            onClear={() => setSearch('')}
          />
          <Select
            size="sm"
            aria-label="Результат"
            className="w-56"
            selectedKeys={[outcome]}
            onSelectionChange={(keys) => setOutcome(String(Array.from(keys)[0] ?? ALL))}
          >
            {[
              <SelectItem key={ALL} textValue="Усі результати">
                Усі результати
              </SelectItem>,
              ...CHATWOOT_BOT_TURN_OUTCOMES.map((key) => (
                <SelectItem key={key} textValue={TURN_OUTCOME_META[key].label}>
                  {TURN_OUTCOME_META[key].label}
                </SelectItem>
              )),
            ]}
          </Select>
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <Table
            aria-label="Діалоги бота"
            removeWrapper
            selectionMode="none"
            onRowAction={(key) => setOpenId(Number(key))}
            classNames={{ tr: 'cursor-pointer hover:bg-default-50' }}
          >
            <TableHeader>
              <TableColumn>Розмова</TableColumn>
              <TableColumn className="w-20">Ходів</TableColumn>
              <TableColumn>Результат</TableColumn>
              <TableColumn>Інструменти</TableColumn>
              <TableColumn className="w-24">Вартість</TableColumn>
              <TableColumn className="w-32">Остання</TableColumn>
              <TableColumn className="w-12">{''}</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={
                <span className="text-sm text-default-400">
                  Немає розмов за період. Журнал пишеться з моменту деплою цієї функції.
                </span>
              }
            >
              {dialogs.map((dialog) => (
                <TableRow key={dialog.conversationId}>
                  <TableCell>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-default-900 line-clamp-2">{dialog.firstQuestion}</div>
                      <div className="text-xs text-default-400">#{dialog.conversationId}</div>
                    </div>
                  </TableCell>
                  <TableCell>{dialog.turns}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {CHATWOOT_BOT_TURN_OUTCOMES.filter((key) => dialog.outcomes[key]).map((key) => (
                        <Tooltip key={key} content={TURN_OUTCOME_META[key].hint} placement="top">
                          <Chip size="sm" variant="flat" color={TURN_OUTCOME_META[key].color}>
                            {TURN_OUTCOME_META[key].label}
                            {dialog.outcomes[key]! > 1 ? ` ×${dialog.outcomes[key]}` : ''}
                          </Chip>
                        </Tooltip>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-y-1">
                      {dialog.tools.length === 0 ? (
                        <span className="text-xs text-default-400">–</span>
                      ) : (
                        dialog.tools.map((tool) => (
                          <BotToolChip key={tool.name} name={tool.name} note={`Викликів у розмові: ${tool.count}`} />
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{dialog.costUsd > 0 ? `$${dialog.costUsd.toFixed(4)}` : '–'}</TableCell>
                  <TableCell className="text-xs text-default-500">{formatDateTime(dialog.lastAt)}</TableCell>
                  <TableCell>
                    {data?.chatwootUrl ? (
                      <Tooltip content="Відкрити в Chatwoot" placement="top">
                        <Button
                          as="a"
                          href={`${data.chatwootUrl}/${dialog.conversationId}`}
                          target="_blank"
                          rel="noreferrer"
                          isIconOnly
                          size="sm"
                          variant="light"
                          aria-label="Відкрити в Chatwoot"
                        >
                          <DynamicIcon name="external-link" size={14} />
                        </Button>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <DialogDrawer
        conversationId={openId}
        instructionSource={instructionSource}
        openArticle={openArticle}
        onClose={() => setOpenId(null)}
      />
      {articleDrawer}
    </div>
  );
};

export default ChatwootBotDialogs;
