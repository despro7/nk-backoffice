import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Chip,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  type Selection,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { SectionTitle } from '@/components/SectionTitle';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useApi } from '@/hooks/useApi';
import { ToastService } from '@/services/ToastService';
import type {
  AuthLoginAttemptDto,
  AuthLoginAttemptsResponse,
  AuthSessionDto,
  AuthSessionsResponse,
  RevokeSessionsResponse,
} from '@shared/types/authSessions';
import { DateCell, DeviceCell, LocationCell } from './SessionCells';
import { FailedAttempts } from './FailedAttempts';
import { REVOKED_REASON_LABELS, deviceLabel, formatShortDate, locationLabel } from './sessionUtils';

interface UserSessionsTableProps {
  /** 'self': власні сесії; число: сесії користувача (режим адміністратора) */
  source: 'self' | number;
}

/** one: кнопка в рядку; selected: чекбокси; all: усі (у профілі всі, крім поточної) */
type PendingRevoke =
  | { kind: 'one'; session: AuthSessionDto }
  | { kind: 'selected'; ids: string[] }
  | { kind: 'all' };

const pluralRules = new Intl.PluralRules('uk-UA');

const sessionsCount = (count: number): string => {
  const form = pluralRules.select(count);
  const noun = form === 'one' ? 'сесію' : form === 'few' ? 'сесії' : 'сесій';
  return `${count} ${noun}`;
};

/** «Chrome (Mac OS) · Kryvyi Rih»; невідоме місце не показуємо */
const sessionDescription = (session: AuthSessionDto): string => {
  const device = deviceLabel(session.browser, session.os);
  const place = session.isLocalNetwork ? locationLabel(session) : session.city ?? locationLabel(session);
  return place === 'Невідомо' ? device : `${device} · ${place}`;
};

const targetIds = (target: PendingRevoke): string[] | null => {
  if (target.kind === 'all') return null;
  return target.kind === 'one' ? [target.session.id] : target.ids;
};

const TABLE_CLASS_NAMES = {
  table: 'table-fixed min-w-[36rem]',
  th: 'bg-transparent border-b border-default-200 text-default-500 font-medium',
  tr: 'border-b border-default-100 last:border-b-0',
  td: 'align-middle',
};

/** Додає сторінку без дублів: між запитами список міг зсунутись */
const appendUnique = <T extends { id: string | number }>(current: T[], page: T[]): T[] => {
  const known = new Set(current.map((item) => item.id));
  return [...current, ...page.filter((item) => !known.has(item.id))];
};

export function UserSessionsTable({ source }: UserSessionsTableProps) {
  const { apiCall } = useApi();
  const isAdmin = source !== 'self';
  const baseUrl = source === 'self' ? '/api/auth/sessions' : `/api/auth/users/${source}/sessions`;

  const [sessions, setSessions] = useState<AuthSessionDto[]>([]);
  const [attempts, setAttempts] = useState<AuthLoginAttemptDto[]>([]);
  const [hasMoreSessions, setHasMoreSessions] = useState(false);
  const [hasMoreAttempts, setHasMoreAttempts] = useState(false);
  const [loadingMore, setLoadingMore] = useState<'sessions' | 'attempts' | null>(null);
  const [selected, setSelected] = useState<Selection>(new Set<string>());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<PendingRevoke | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const fetchJson = async <T,>(url: string): Promise<T> => {
    const response = await apiCall(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };

  const fetchAttempts = (offset: number) =>
    fetchJson<AuthLoginAttemptsResponse>(`/api/auth/users/${source}/login-attempts?offset=${offset}`);

  const load = useCallback(async () => {
    try {
      const sessionsData = await fetchJson<AuthSessionsResponse>(baseUrl);

      if (source !== 'self') {
        const attemptsData = await fetchAttempts(0);
        setAttempts(attemptsData.attempts);
        setHasMoreAttempts(attemptsData.hasMore);
      }

      setSessions(sessionsData.sessions);
      setHasMoreSessions(sessionsData.hasMore);
      setSelected(new Set<string>());
      setLoadError(false);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
    // apiCall змінюється на кожен рендер провайдера, перезавантажувати через це не треба
  }, [baseUrl, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = sessions.filter((session) => session.isActive);
  const ended = sessions.filter((session) => !session.isActive);
  const selectedIds = selected === 'all' ? active.map((session) => session.id) : [...selected].map(String);

  const loadMore = async (kind: 'sessions' | 'attempts') => {
    setLoadingMore(kind);
    try {
      if (kind === 'sessions') {
        const data = await fetchJson<AuthSessionsResponse>(`${baseUrl}?endedOffset=${ended.length}`);
        setSessions((current) => appendUnique(current, data.sessions));
        setHasMoreSessions(data.hasMore);
      } else {
        const data = await fetchAttempts(attempts.length);
        setAttempts((current) => appendUnique(current, data.attempts));
        setHasMoreAttempts(data.hasMore);
      }
    } catch (error) {
      console.error('Error loading more:', error);
      ToastService.show({ title: 'Не вдалося завантажити ще', color: 'danger' });
    } finally {
      setLoadingMore(null);
    }
  };

  const sendRevoke = (target: PendingRevoke) => {
    const ids = targetIds(target);
    if (source !== 'self') {
      return apiCall(`${baseUrl}/revoke`, {
        method: 'POST',
        body: JSON.stringify(ids ? { sessionIds: ids } : {}),
      });
    }
    return ids
      ? apiCall(`${baseUrl}/${ids[0]}`, { method: 'DELETE' })
      : apiCall(`${baseUrl}/revoke-others`, { method: 'POST' });
  };

  const confirmRevoke = async () => {
    if (!pending || isRevoking) return;
    setIsRevoking(true);
    try {
      const response = await sendRevoke(pending);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не вдалося завершити сесії');
      ToastService.show({ title: `Завершено сесій: ${(data as RevokeSessionsResponse).revoked}`, color: 'success' });
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося завершити сесії';
      ToastService.show({ title: message, color: 'danger' });
    } finally {
      setIsRevoking(false);
      setPending(null);
    }
  };

  // Під час анімації закриття pending вже null: тексти беремо з останнього значення
  const shownRef = useRef<PendingRevoke | null>(null);
  if (pending) shownRef.current = pending;
  const shown = shownRef.current;

  const includesCurrent = isAdmin && shown !== null && active.some(
    (session) => session.isCurrent && (targetIds(shown)?.includes(session.id) ?? true),
  );

  const confirm = (() => {
    const texts = (() => {
      if (shown?.kind === 'one') {
        return {
          title: 'Завершити сесію?',
          message: `${sessionDescription(shown.session)} вийде з системи.`,
          confirmText: 'Вийти',
          icon: 'log-out' as const,
        };
      }
      if (shown?.kind === 'selected') {
        return {
          title: `Завершити ${sessionsCount(shown.ids.length)}?`,
          message: 'Вибрані пристрої вийдуть з системи.',
          confirmText: 'Завершити',
          icon: 'list-x' as const,
        };
      }
      return isAdmin
        ? { title: 'Завершити всі сесії?', message: 'Користувач вийде з системи на всіх пристроях.', confirmText: 'Завершити', icon: 'power' as const }
        : { title: 'Вийти з усіх інших пристроїв?', message: 'Усі пристрої, крім цього, вийдуть з системи.', confirmText: 'Вийти', icon: 'log-out' as const };
    })();
    return includesCurrent
      ? { ...texts, message: 'Серед них ваша поточна сесія: ви теж вийдете з системи.' }
      : texts;
  })();

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev === 'all' ? active.map((session) => session.id) : [...prev].map(String));
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const canRevokeAll = isAdmin ? active.length > 0 : active.some((session) => !session.isCurrent);

  return (
    <section className="@container space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon="monitor-smartphone" size={isAdmin ? 'default' : 'compact'}>Пристрої, на яких виконано вхід</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {isAdmin && selectedIds.length > 0 && (
            <Button
              size="sm"
              variant="flat"
              startContent={<DynamicIcon name="list-x" size={14} />}
              onPress={() => setPending({ kind: 'selected', ids: selectedIds })}
            >
              Завершити вибрані
            </Button>
          )}
          {canRevokeAll && (
            <Button
              size="sm"
              variant="flat"
              color="danger"
              startContent={<DynamicIcon name={isAdmin ? 'power' : 'log-out'} size={14} />}
              onPress={() => setPending({ kind: 'all' })}
            >
              {isAdmin ? 'Завершити всі сесії' : 'Вийти з усіх інших пристроїв'}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Spinner size="sm" className="py-4" />
      ) : loadError ? (
        <p className="py-3 text-sm text-danger">Не вдалося завантажити сесії</p>
      ) : (
        <>
          {/* Вузький контейнер (телефон, вузький drawer): список карток замість таблиці */}
          <ul className="divide-y divide-default-100 @2xl:hidden">
            {[...active, ...ended].map((session) => {
              const isSelected = selected === 'all' ? session.isActive : selected.has(session.id);
              return (
                <li key={session.id} className={`flex items-start gap-3 py-3 ${session.isActive ? '' : 'opacity-60'}`}>
                  {isAdmin && (
                    <Checkbox
                      size="sm"
                      className="mt-0.5"
                      aria-label="Вибрати сесію"
                      isDisabled={!session.isActive}
                      isSelected={isSelected}
                      onValueChange={(checked) => toggleSelected(session.id, checked)}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <DeviceCell
                      deviceType={session.deviceType}
                      label={deviceLabel(session.browser, session.os)}
                      badge={session.isCurrent && session.isActive && (
                        <Chip size="sm" variant="flat" color="success" className="h-5">Поточний</Chip>
                      )}
                      note={(
                        <div className="mt-0.5 space-y-0.5">
                          <div className="truncate">{locationLabel(session)}</div>
                          <div>Вхід: {formatShortDate(session.createdAt)}</div>
                          <div>
                            {session.isActive
                              ? `Активність: ${formatShortDate(session.lastUsedAt)}`
                              : `Завершено ${formatShortDate(session.revokedAt)} · ${
                                session.revokedReason ? REVOKED_REASON_LABELS[session.revokedReason] : '–'
                              }`}
                          </div>
                        </div>
                      )}
                    />
                  </div>
                  {session.isActive && !session.isCurrent && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      aria-label="Вийти"
                      onPress={() => setPending({ kind: 'one', session })}
                    >
                      <DynamicIcon name="log-out" size={16} />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto @2xl:block">
            <Table
              aria-label="Пристрої, на яких виконано вхід"
              removeWrapper
              classNames={TABLE_CLASS_NAMES}
              selectionMode={isAdmin ? 'multiple' : 'none'}
              selectedKeys={selected}
              onSelectionChange={setSelected}
              disabledKeys={isAdmin ? ended.map((session) => session.id) : []}
              disabledBehavior="selection"
            >
              <TableHeader>
                <TableColumn className="w-[30%]">Пристрій</TableColumn>
                <TableColumn className="w-[20%]">Місцезнаходження</TableColumn>
                <TableColumn className="w-[15%]">Час входу</TableColumn>
                <TableColumn className="w-[22%]">Остання активність</TableColumn>
                <TableColumn aria-label="Дії" className="w-20">{' '}</TableColumn>
              </TableHeader>
              <TableBody emptyContent="–">
                {[...active, ...ended].map((session) => (
                  <TableRow key={session.id} className={session.isActive ? undefined : 'opacity-60'}>
                    <TableCell>
                      <DeviceCell
                        deviceType={session.deviceType}
                        label={deviceLabel(session.browser, session.os)}
                        badge={session.isCurrent && session.isActive && (
                          <Chip size="sm" variant="flat" color="success" className="h-5">Поточний</Chip>
                        )}
                      />
                    </TableCell>
                    <TableCell><LocationCell session={session} /></TableCell>
                    <TableCell><DateCell value={session.createdAt} /></TableCell>
                    <TableCell>
                      {session.isActive ? (
                        <DateCell value={session.lastUsedAt} />
                      ) : (
                        <span className="text-sm text-default-500">
                          Завершено {formatShortDate(session.revokedAt)}
                          {' · '}
                          {session.revokedReason ? REVOKED_REASON_LABELS[session.revokedReason] : '–'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {session.isActive && !session.isCurrent && (
                        <Button
                          size="sm"
                          variant="light"
                          color="danger"
                          startContent={<DynamicIcon name="log-out" size={14} />}
                          onPress={() => setPending({ kind: 'one', session })}
                        >
                          Вийти
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {isAdmin && (
            <>
              {hasMoreSessions && (
                <Button
                  size="sm"
                  variant="light"
                  isLoading={loadingMore === 'sessions'}
                  onPress={() => void loadMore('sessions')}
                >
                  Показати ще
                </Button>
              )}
              <FailedAttempts
                attempts={attempts}
                hasMore={hasMoreAttempts}
                isLoadingMore={loadingMore === 'attempts'}
                onLoadMore={() => void loadMore('attempts')}
              />
            </>
          )}
        </>
      )}

      <ConfirmModal
        isOpen={pending !== null}
        title={confirm.title}
        message={confirm.message}
        confirmText={confirm.confirmText}
        cancelText="Скасувати"
        confirmStartContent={(
          <DynamicIcon
            name={isRevoking ? 'loader-2' : confirm.icon}
            className={isRevoking ? 'animate-spin' : ''}
            size={16}
          />
        )}
        overlayZClassName="z-[2000]"
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
