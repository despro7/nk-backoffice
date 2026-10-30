import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Spinner, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tooltip } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { CalendarDate, getLocalTimeZone, today, type DateValue }   from '@internationalized/date';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { DateRange } from '@react-types/datepicker';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { ToastService } from '@/services/ToastService';
import type { ChatwootBotAnalyticsOverview } from '@shared/types/chatwootBot';
import ReportDateRangeFilter from '@/pages/Reports/shared/filters/ReportDateRangeFilter';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';

/** Телефони в питаннях клієнтів не мають потрапити в базу знань. */
function stripPhones(text: string): string {
  return text.replace(/\+?\d[\d\s\-()]{7,}\d/g, '…').replace(/\s+/g, ' ').trim();
}

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

const ChatwootBotStatistics: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useRoleAccess();
  const canManageKnowledge = hasPermission(PERMISSIONS.ACTION_CHATWOOT_KNOWLEDGE_MANAGE);
  const [dateRange, setDateRange] = useState<DateRange | null>(() => defaultDateRange());
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ChatwootBotAnalyticsOverview | null>(null);

  const rangeIso = useMemo(() => dateRangeToIsoBounds(dateRange), [dateRange]);

  const load = useCallback(async () => {
    if (!rangeIso) return;
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

  return (
    <div className="space-y-6">
      <p className="text-sm text-default-500">Топ питань клієнтів і час відповіді менеджерів.</p>

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
          <div className="p-4 bg-white rounded-xl shadow-lg">
            <h2 className="flex items-center gap-1 text-md font-semibold text-default-800 mb-3">
              <DynamicIcon name="badge-question-mark" size={16} />
              Топ питань
            </h2>
            {overview.topQuestions.length === 0 ? (
              <p className="text-default-500 text-sm">За обраний період даних немає.</p>
            ) : (
              <Table aria-label="Топ питань" removeWrapper>
                <TableHeader>
                  <TableColumn>Питання</TableColumn>
                  <TableColumn width={100}>Кількість</TableColumn>
                  <TableColumn width={60}>{' '}</TableColumn>
                </TableHeader>
                <TableBody>
                  {overview.topQuestions.map((row) => (
                    <TableRow key={row.contentNorm}>
                      <TableCell>{row.contentPreview}</TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>
                        {canManageKnowledge && (
                          <Tooltip content="Додати в базу знань">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              className="text-blue-600"
                              aria-label="Додати питання в базу знань"
                              onPress={() =>
                                navigate(`/chatwoot-bot/knowledge#new=${encodeURIComponent(stripPhones(row.contentPreview))}`)
                              }
                            >
                              <DynamicIcon name="book-plus" size={16} />
                            </Button>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="p-4 bg-white rounded-xl shadow-lg">
            <h2 className="flex items-center gap-1 text-md font-semibold text-default-800 mb-3">
              <DynamicIcon name="clock-check" size={16} />
              SLA агентів
            </h2>
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
