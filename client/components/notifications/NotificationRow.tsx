import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Chip, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { NotificationFeedItem } from '@shared/types/notifications';
import { NotificationAvatar, SourceAvatar } from './NotificationAvatar';

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins} хв тому`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} год тому`;
  return `${Math.floor(hrs / 24)} дн тому`;
}

function formatAttemptTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function MetaDot() {
  return <span className="h-[3px] w-[3px] rounded-full bg-default-300" aria-hidden />;
}

/** Хто запускав дію: останній ініціатор, а при повторах – іконка з переліком усіх запусків. */
function InitiatorMeta({ attempts }: { attempts: NotificationFeedItem['attempts'] }) {
  const last = attempts[0];
  if (!last) return null;
  if (attempts.length < 2) return <span>{last.label}</span>;
  return (
    <Tooltip
      placement="bottom"
      delay={200}
      content={
        <div className="py-1">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-default-400">Хто і коли запускав дію</div>
          <table className="text-xs">
            <tbody>
              {attempts.map((a, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-1">
                    <SourceAvatar source={a.source} size="sm" />
                  </td>
                  <td className="py-0.5 pr-3 text-default-800">{a.label}</td>
                  <td className="py-0.5 text-[11px] text-default-500/80 tabular-nums">{formatAttemptTime(a.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    >
      <span className="flex cursor-default items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {last.label}
        <DynamicIcon name="users" size={13} className="text-default-400" />
      </span>
    </Tooltip>
  );
}

/** Дата • хто запускав • номер документа. Категорію не показуємо: її видно з аватара. */
function NotificationMeta({ item }: { item: NotificationFeedItem }) {
  const parts = [
    <span key="time">{formatRelativeTime(item.createdAt)}</span>,
    item.attempts.length > 0 ? <InitiatorMeta key="who" attempts={item.attempts} /> : null,
    item.docNumber ? <span key="doc">{item.docNumber.replace(/^№\s*/, '')}</span> : null,
  ].filter(Boolean);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-default-400">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <MetaDot />}
          {part}
        </span>
      ))}
    </div>
  );
}

const COLLAPSED_LINES = 2;
const EXPANDED_LINES = 5;

/**
 * Текст сповіщення: 2 рядки; клік розгортає до 5. Якщо й 5 замало – кнопка «Повний текст» (дровер).
 */
function ExpandableMessage({ text, onShowFull }: { text: string; onShowFull?: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    // scrollHeight з line-clamp – висота всього тексту.
    setLines(Math.round(el.scrollHeight / lineHeight));
  }, [text]);

  const canExpand = lines > COLLAPSED_LINES;
  const needsDrawer = lines > EXPANDED_LINES;

  return (
    <>
      <p
        ref={ref}
        onClick={(e) => {
          if (!canExpand) return;
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        title={canExpand ? (expanded ? 'Згорнути' : 'Показати більше') : undefined}
        className={`mt-1.5 whitespace-pre-line break-words text-[13px] leading-snug text-default-700 ${
          expanded ? 'line-clamp-5' : 'line-clamp-2'
        } ${canExpand ? 'cursor-pointer hover:text-default-900' : ''}`}
      >
        {text}
      </p>
      {expanded && needsDrawer && onShowFull && (
        <Button
          size="sm"
          variant="bordered"
          className="mt-1.5 h-7 border-1"
          startContent={<DynamicIcon name="text" size={14} />}
          onPress={onShowFull}
        >
          Повний текст
        </Button>
      )}
    </>
  );
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
  /** Повний текст сповіщення в дровері (коли не вміщається в 5 рядків). */
  onShowFullText?: (item: NotificationFeedItem) => void;
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
  onShowFullText,
}: NotificationRowProps) {
  const unread = !item.read && item.archived === null;
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
          : 'border-default-200/75 bg-white hover:bg-default-100/75'
      }`}
    >
      <NotificationAvatar item={item} ringClassName={unread ? 'ring-orange-50' : 'ring-white'} />

      <div className="min-w-0">
        <p className="pr-16 text-sm leading-snug text-default-900">
          <span className="font-semibold">{item.title}</span>
          {item.count > 1 && (
            <span className="inline-block ml-1.5 px-[5px_6px] py-[1px] rounded-full bg-default-200/75 align-middle text-[11px] font-semibold text-default-900">
              ×{item.count}
            </span>
          )}
          {item.archived === 'resolved' && (
            <Chip size="sm" variant="flat" color="success" className="inline-flex ml-1.5 h-4.5 align-middle text-[11px]">Вирішено</Chip>
          )}
          {item.archived === 'mine' && (
            <Chip size="sm" variant="flat" className="inline-block ml-1.5 h-4.5 align-middle text-[11px]">Архівовано вами</Chip>
          )}
        </p>
        <NotificationMeta item={item} />

        {showRuleHints && item.ruleId === null && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
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

        {item.message && <ExpandableMessage text={item.message} onShowFull={onShowFullText ? () => onShowFullText(item) : undefined} />}

        {(item.action || onShowLog || canResolve) && (
          <div className="mt-2.5 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            {item.action && onOpen && (
              <Button
                size="sm"
                color="primary"
                // variant="flat"
                className="h-8 bg-primary-600"
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
