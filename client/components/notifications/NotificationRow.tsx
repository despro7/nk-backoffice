import { Button, Chip, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { notificationGroupLabel } from '@shared/constants/notifications';
import type { NotificationFeedItem } from '@shared/types/notifications';
import { NotificationAvatar } from './NotificationAvatar';

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins} хв тому`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} год тому`;
  return `${Math.floor(hrs / 24)} дн тому`;
}

export interface NotificationRowHandlers {
  onOpen?: (item: NotificationFeedItem) => void;
  onMarkRead?: (item: NotificationFeedItem) => void;
  onArchive?: (item: NotificationFeedItem) => void;
  onUnarchive?: (item: NotificationFeedItem) => void;
  onResolve?: (item: NotificationFeedItem) => void;
  /** Лише в debug-режимі. */
  onShowLog?: (item: NotificationFeedItem) => void;
  /** Адмін: перейти до правила / створити правило в налаштуваннях. */
  onEditRule?: (item: NotificationFeedItem) => void;
}

interface NotificationRowProps extends NotificationRowHandlers {
  item: NotificationFeedItem;
  isAdmin?: boolean;
  /** Показувати позначку «Без шаблону» для рядків без правила (адмін). */
  showRuleHints?: boolean;
}

export function NotificationRow({
  item,
  isAdmin,
  showRuleHints,
  onOpen,
  onMarkRead,
  onArchive,
  onUnarchive,
  onResolve,
  onShowLog,
  onEditRule,
}: NotificationRowProps) {
  const unread = !item.read && item.archived === null;
  const meta = [
    item.source.type === 'user' ? item.source.name : null,
    formatRelativeTime(item.createdAt),
    notificationGroupLabel(item.group),
    item.source.type === 'service' && item.source.label !== notificationGroupLabel(item.group) ? item.source.label : null,
    item.via ? `через ${item.via}` : null,
  ].filter(Boolean) as string[];
  const canResolve = isAdmin && item.archived === null && item.kind === 'alert' && !!onResolve;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => unread && onMarkRead?.(item)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && unread) {
          e.preventDefault();
          onMarkRead?.(item);
        }
      }}
      className={`group relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b px-5 py-3.5 outline-none transition-colors focus-visible:bg-default-100 ${
        unread
          ? 'border-orange-100 bg-orange-50/70 hover:bg-orange-50'
          : 'border-default-100 bg-white hover:bg-default-50'
      }`}
    >
      <NotificationAvatar item={item} ringClassName={unread ? 'ring-orange-50' : 'ring-white'} />

      <div className="min-w-0">
        <p className="pr-16 text-sm leading-snug text-default-900">
          <span className="font-semibold">{item.title}</span>
          {item.count > 1 && (
            <span className="ml-1.5 rounded bg-default-100 px-1.5 py-px align-middle text-[11px] font-semibold text-default-600">
              ×{item.count}
            </span>
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-default-500">
          {meta.map((m, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="h-[3px] w-[3px] rounded-full bg-default-300" aria-hidden />}
              {m}
            </span>
          ))}
          {item.orderNumber && (
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-[3px] rounded-full bg-default-300" aria-hidden />
              №{item.orderNumber}
            </span>
          )}
        </div>

        {(item.archived || (showRuleHints && item.ruleId === null)) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.archived === 'resolved' && (
              <Chip size="sm" variant="flat" color="success" className="h-5 text-[11px]">Вирішено</Chip>
            )}
            {item.archived === 'mine' && (
              <Chip size="sm" variant="flat" className="h-5 text-[11px]">Архівовано вами</Chip>
            )}
            {showRuleHints && item.ruleId === null && (
              <Chip
                size="sm"
                variant="flat"
                color="warning"
                className="h-5 cursor-pointer text-[11px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditRule?.(item);
                }}
              >
                Без шаблону
              </Chip>
            )}
          </div>
        )}

        {item.message && (
          <p className="mt-1.5 line-clamp-2 whitespace-pre-line break-words text-[13px] leading-relaxed text-default-700">
            {item.message}
          </p>
        )}

        {(item.action || onShowLog || canResolve) && (
          <div className="mt-2.5 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            {item.action && onOpen && (
              <Button
                size="sm"
                color="primary"
                className="h-8 font-medium"
                endContent={<DynamicIcon name="arrow-up-right" size={14} />}
                onPress={() => onOpen(item)}
              >
                {item.action.label}
              </Button>
            )}
            {onShowLog && (
              <Button
                size="sm"
                variant="bordered"
                className="h-8 border-1"
                startContent={<DynamicIcon name="file-text" size={14} />}
                onPress={() => onShowLog(item)}
              >
                Показати лог
              </Button>
            )}
            {canResolve && (
              <Button
                size="sm"
                variant="flat"
                color="success"
                className="h-8"
                startContent={<DynamicIcon name="check-check" size={14} />}
                onPress={() => onResolve!(item)}
              >
                Вирішено
              </Button>
            )}
          </div>
        )}
      </div>

      {unread && (
        <span className="absolute right-5 top-5 h-2 w-2 rounded-full bg-danger transition-opacity group-hover:opacity-0 group-focus-within:opacity-0" aria-label="Непрочитане" />
      )}

      <div
        className="absolute right-3 top-2.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {item.archived === null ? (
          <>
            {unread && onMarkRead && (
              <Tooltip content="Позначити прочитаним" delay={400} closeDelay={0}>
                <Button isIconOnly size="sm" variant="bordered" className="h-7 w-7 min-w-7 border-1 bg-white" aria-label="Позначити прочитаним" onPress={() => onMarkRead(item)}>
                  <DynamicIcon name="check" size={14} />
                </Button>
              </Tooltip>
            )}
            {onArchive && (
              <Tooltip content="В архів" delay={400} closeDelay={0}>
                <Button isIconOnly size="sm" variant="bordered" className="h-7 w-7 min-w-7 border-1 bg-white" aria-label="В архів" onPress={() => onArchive(item)}>
                  <DynamicIcon name="archive" size={14} />
                </Button>
              </Tooltip>
            )}
          </>
        ) : (
          item.archived === 'mine' && onUnarchive && (
            <Tooltip content="Повернути з архіву" delay={400} closeDelay={0}>
              <Button isIconOnly size="sm" variant="bordered" className="h-7 w-7 min-w-7 border-1 bg-white" aria-label="Повернути з архіву" onPress={() => onUnarchive(item)}>
                <DynamicIcon name="rotate-ccw" size={14} />
              </Button>
            </Tooltip>
          )
        )}
      </div>
    </div>
  );
}
