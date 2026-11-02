import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Spinner, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { CalendarDate, getLocalTimeZone, today, type DateValue }   from '@internationalized/date';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { DateRange } from '@react-types/datepicker';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { chatwootKnowledgeApi } from '@/services/ChatwootKnowledgeService';
import type { ChatwootBotKnowledgeEntry } from '@shared/types/chatwootBotKnowledge';
import { ToastService } from '@/services/ToastService';
import type { ChatwootBotAnalyticsOverview, ChatwootBotQuestionClusterDto } from '@shared/types/chatwootBot';
import ReportDateRangeFilter from '@/pages/Reports/shared/filters/ReportDateRangeFilter';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import { QuestionTopicsCard } from './components/QuestionTopicsCard';
import { clusterPhrasings, KnowledgeAttachModal, KnowledgeCoverage } from './components/KnowledgeCoverage';

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return '–';
  if (seconds < 60) return `${Math.round(seconds)} с`;
  const min = Math.round(seconds / 60);
  return `${min} хв`;
}

function isCompleteCalendarDate(value: DateValue): boolean {
  const { year, month, day } = value;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year
    && probe.getMonth() === month - 1
    && probe.getDate() === day
  );
}

function dateRangeToIsoBounds(range: DateRange | null): { from: string; to: string } | null {
  if (!range?.start || !range?.end) return null;
  if (!isCompleteCalendarDate(range.start) || !isCompleteCalendarDate(range.end)) {
    return null;
  }

  const tz = getLocalTimeZone();
  const fromDate = (range.start as CalendarDate).toDate(tz);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = (range.end as CalendarDate).toDate(tz);
  toDate.setHours(23, 59, 59, 999);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }

  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

function defaultDateRange(): DateRange {
  const end = today(getLocalTimeZone());
  return {
    start: end.subtract({ days: 7 }),
    end,
  };
}

type KnowledgeMissesCardProps = {
  description: string;
  rows: ChatwootBotQuestionClusterDto[];
  canManageKnowledge: boolean;
  onKnowledgeAction: (row: ChatwootBotQuestionClusterDto) => void;
  onOpenKnowledge: () => void;
};

/** Запити бота до бази знань без відповіді; якщо стаття вже є — показуємо її. */
function KnowledgeMissesCard({
  description,
  rows,
  canManageKnowledge,
  onKnowledgeAction,
  onOpenKnowledge,
}: KnowledgeMissesCardProps) {
  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      <h2 className="flex items-center gap-1 text-md font-semibold text-default-800 mb-1">
        <DynamicIcon name="search-x" size={16} />
        Бот шукав у базі знань і не знайшов
      </h2>
      <p className="text-xs text-default-500 mb-3">{description}</p>
      {rows.length === 0 ? (
        <p className="text-default-500 text-sm">За обраний період даних немає.</p>
      ) : (
        <Table aria-label="Бот шукав у базі знань і не знайшов" removeWrapper>
          <TableHeader>
            <TableColumn>Тема</TableColumn>
            <TableColumn width={100}>Кількість</TableColumn>
            <TableColumn width={260}>Стаття зараз</TableColumn>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const otherPhrasings = row.examples.filter((e) => e !== row.label);
              return (
                <TableRow key={row.label}>
                  <TableCell>
                    <p className="text-sm font-medium">{row.label}</p>
                    {otherPhrasings.length > 0 && (
                      <p className="text-xs text-default-500">{otherPhrasings.join(' · ')}</p>
                    )}
                  </TableCell>
                  <TableCell>{row.count}</TableCell>
                  <TableCell>
                    <KnowledgeCoverage
                      row={row}
                      canManage={canManageKnowledge}
                      onOpenKnowledge={onOpenKnowledge}
                      onAction={onKnowledgeAction}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

const ChatwootBotStatistics: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useRoleAccess();
  const canManageKnowledge = hasPermission(PERMISSIONS.ACTION_CHATWOOT_KNOWLEDGE_MANAGE);
  const canManageTopics = hasPermission(PERMISSIONS.ACTION_CHATWOOT_TOPICS_MANAGE);
  /** Нова стаття з усіма формулюваннями теми як варіантами питання (без телефонів). */
  const createKnowledgeEntry = (row: ChatwootBotQuestionClusterDto): void => {
    navigate(`/chatwoot-bot/knowledge#new=${encodeURIComponent(clusterPhrasings(row).join('\n'))}`);
  };
  const [knowledgeEntries, setKnowledgeEntries] = useState<ChatwootBotKnowledgeEntry[]>([]);
  const [attachRow, setAttachRow] = useState<ChatwootBotQuestionClusterDto | null>(null);
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    if (!canManageKnowledge) return;
    chatwootKnowledgeApi
      .list()
      .then(setKnowledgeEntries)
      .catch(() => setKnowledgeEntries([]));
  }, [canManageKnowledge]);

  /** Без статей вибирати нема з чого — одразу нова стаття. */
  const onKnowledgeAction = (row: ChatwootBotQuestionClusterDto): void => {
    if (knowledgeEntries.length === 0) createKnowledgeEntry(row);
    else setAttachRow(row);
  };
  const [dateRange, setDateRange] = useState<DateRange | null>(() => defaultDateRange());
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ChatwootBotAnalyticsOverview | null>(null);

  const rangeIso = useMemo(() => dateRangeToIsoBounds(dateRange), [dateRange]);

  /** silent — без спінера (після правок тем), помилка летить у викликача. */
  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!rangeIso) return;
    if (silent) {
      setOverview(await chatwootBotApi.getAnalyticsOverview(rangeIso.from, rangeIso.to));
      return;
    }
    setLoading(true);
    try {
      const data = await chatwootBotApi.getAnalyticsOverview(rangeIso.from, rangeIso.to);
      setOverview(data);
    } catch (error) {
      console.error('ChatwootBotStatistics load error:', error);
      ToastService.show({
        title: 'Помилка',
        description: 'Не вдалося завантажити статистику',
        color: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [rangeIso]);

  useEffect(() => {
    void load();
  }, [load]);

  const attachToEntry = async (entryId: number, questions: string[]) => {
    setAttaching(true);
    try {
      const { added, entry } = await chatwootKnowledgeApi.addQuestions(entryId, questions);
      setKnowledgeEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
      ToastService.show({
        title: added > 0 ? `Додано в «${entry.title}»: ${added}` : 'Ці питання вже є в статті',
        color: added > 0 ? 'success' : 'default',
      });
      setAttachRow(null);
      await load({ silent: true }).catch(() => undefined);
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося додати питання',
        color: 'danger',
      });
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-default-500">Теми питань клієнтів, прогалини бази знань і час відповіді менеджерів.</p>

      <div className="p-4 bg-white rounded-xl shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-4">
          <div className="flex flex-wrap items-end gap-3">
            <ReportDateRangeFilter
              value={dateRange}
              onChange={setDateRange}
            />
            <Button color="primary" onPress={() => void load()} isLoading={loading}>
              Оновити
            </Button>
          </div>
          {overview && (
            <div className="flex flex-wrap items-center gap-y-1 text-sm font-medium text-gray-700">
              <span>
                Клієнтів: <strong>{overview.totals.customerMessages}</strong>
              </span>
              <span className="pl-4 ml-4 border-l border-gray-200">
                Відповіді: <strong>{overview.totals.agentMessages}</strong>
              </span>
              <span className="pl-4 ml-4 border-l border-gray-200">
                Reclaim: <strong>{overview.totals.reclaims}</strong>
              </span>
              <span className="pl-4 ml-4 border-l border-gray-200">
                Вирішено: <strong>{overview.totals.resolved}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {loading && !overview ? (
        <div className="p-4 bg-white rounded-xl shadow-lg flex justify-center py-12">
          <Spinner />
        </div>
      ) : overview ? (
        <>
          <QuestionTopicsCard
            rows={overview.questionClusters}
            topics={overview.topics ?? []}
            ignoredQuestions={overview.ignoredQuestions ?? []}
            canManageTopics={canManageTopics}
            canManageKnowledge={canManageKnowledge}
            onKnowledgeAction={onKnowledgeAction}
            onOpenKnowledge={() => navigate('/chatwoot-bot/knowledge')}
            onChanged={() => load({ silent: true })}
          />

          <KnowledgeMissesCard
            description={`Звернень до бази знань: ${overview.knowledgeLookups.total}, знайдено відповідь: ${overview.knowledgeLookups.found}. «Стаття зараз» – що бот знайде тепер (статтю могли додати пізніше).`}
            rows={overview.knowledgeMisses}
            canManageKnowledge={canManageKnowledge}
            onKnowledgeAction={onKnowledgeAction}
            onOpenKnowledge={() => navigate('/chatwoot-bot/knowledge')}
          />

          <KnowledgeAttachModal
            row={attachRow}
            entries={knowledgeEntries}
            busy={attaching}
            onAttach={(entryId, questions) => void attachToEntry(entryId, questions)}
            onCreate={(row) => {
              setAttachRow(null);
              createKnowledgeEntry(row);
            }}
            onClose={() => setAttachRow(null)}
          />

          <div className="p-4 bg-white rounded-xl shadow-lg">
            <h2 className="flex items-center gap-1 text-md font-semibold text-default-800 mb-1">
              <DynamicIcon name="clock-check" size={16} />
              SLA агентів
            </h2>
            <p className="text-xs text-default-500 mb-3">
              Як швидко оператори (не бот) відповідають клієнтам: кожна відповідь агента рахується від найранішого ще
              не відповіденого повідомлення клієнта в тій самій розмові; медіана й середнє – за період. «Діалогів» – у
              скількох розмовах агент відповідав. Reclaim – скільки разів бот забирав розмову в агента, бо той був
              офлайн або довго мовчав.
            </p>
            {overview.agentSla.length === 0 ? (
              <p className="text-default-500 text-sm">Немає пар «клієнт → агент» за період.</p>
            ) : (
              <Table aria-label="SLA агентів" removeWrapper>
                <TableHeader>
                  <TableColumn>Agent ID</TableColumn>
                  <TableColumn>Діалогів</TableColumn>
                  <TableColumn>Медіана відповіді</TableColumn>
                  <TableColumn>Середня відповідь</TableColumn>
                  <TableColumn>Reclaim</TableColumn>
                </TableHeader>
                <TableBody>
                  {overview.agentSla.map((row) => (
                    <TableRow key={row.agentId}>
                      <TableCell>#{row.agentId}</TableCell>
                      <TableCell>{row.conversations}</TableCell>
                      <TableCell>{formatSeconds(row.medianResponseSeconds)}</TableCell>
                      <TableCell>{formatSeconds(row.avgResponseSeconds)}</TableCell>
                      <TableCell>{row.reclaimCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default ChatwootBotStatistics;
