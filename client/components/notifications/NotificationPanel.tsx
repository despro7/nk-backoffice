import type { ReactNode } from 'react';
import { Button, ScrollShadow, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type {
  NotificationFeedCounts,
  NotificationFeedItem,
  NotificationTab,
} from '@shared/types/notifications';
import { NotificationRow, type NotificationRowHandlers } from './NotificationRow';

const TABS: Array<{ id: NotificationTab; label: string }> = [
  { id: 'all', label: 'Всі' },
  { id: 'mine', label: 'Мої' },
  { id: 'errors', label: 'Помилки' },
  { id: 'archive', label: 'Архів' },
];

const EMPTY_TEXT: Record<NotificationTab, string> = {
  all: 'Нових сповіщень немає',
  mine: 'Немає сповіщень для вас',
  errors: 'Помилок немає',
  archive: 'Архів порожній',
};

interface NotificationPanelProps extends NotificationRowHandlers {
  items: NotificationFeedItem[];
  counts: NotificationFeedCounts;
  tab: NotificationTab;
  onTabChange: (tab: NotificationTab) => void;
  loading?: boolean;
  isAdmin?: boolean;
  showRuleHints?: boolean;
  onOpenReport?: () => void;
  onOpenSettings?: () => void;
  /** Замінює список (напр. персональні налаштування під шестернею). */
  body?: ReactNode;
  title?: string;
  footer?: ReactNode;
  /** Висота списку. */
  listClassName?: string;
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-[40px_1fr] gap-3 border-b border-default-100 px-5 py-4" aria-hidden>
      <div className="h-10 w-10 rounded-xl bg-default-100" />
      <div className="flex flex-col gap-2 pt-1">
        <div className="h-2.5 w-3/4 rounded bg-default-100" />
        <div className="h-2 w-2/5 rounded bg-default-100" />
      </div>
    </div>
  );
}

export function NotificationPanel({
  items,
  counts,
  tab,
  onTabChange,
  loading,
  isAdmin,
  showRuleHints,
  onOpenReport,
  onOpenSettings,
  body,
  title = 'Сповіщення',
  footer,
  listClassName = 'max-h-[560px]',
  ...handlers
}: NotificationPanelProps) {
  return (
    <div className="flex w-full flex-col bg-white">
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
        <h3 className="text-lg font-semibold tracking-tight text-default-900">{title}</h3>
        {onOpenReport && (
          <button
            type="button"
            onClick={onOpenReport}
            className="text-[13px] font-medium text-default-900 underline underline-offset-4 hover:text-default-600"
          >
            Детальний звіт
          </button>
        )}
      </div>

      {!body && (
        <div className="flex items-center gap-1 border-b border-default-200 pl-5 pr-3" role="tablist">
          {TABS.map((t) => {
            const active = t.id === tab;
            const count = counts[t.id];
            const isErrors = t.id === 'errors';
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(t.id)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-2 pb-2.5 pt-3 text-sm transition-colors ${
                  active ? 'border-default-900 font-medium text-default-900' : 'border-transparent text-default-500 hover:text-default-800'
                }`}
              >
                {t.label}
                {count > 0 && (t.id !== 'archive' || active) && (
                  <span
                    className={`inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] px-1 text-[11px] font-semibold tabular-nums ${
                      active
                        ? isErrors
                          ? 'bg-danger text-white'
                          : 'bg-default-900 text-white'
                        : isErrors
                          ? 'bg-danger-50 text-danger'
                          : 'bg-default-100 text-default-600'
                    }`}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
          <span className="flex-1" />
          {onOpenSettings && (
            <Tooltip content="Налаштування сповіщень" delay={400} closeDelay={0}>
              <Button isIconOnly size="sm" variant="light" aria-label="Налаштування сповіщень" onPress={onOpenSettings}>
                <DynamicIcon name="settings" size={18} className="text-default-500" />
              </Button>
            </Tooltip>
          )}
        </div>
      )}

      <ScrollShadow className={`w-full ${listClassName}`} hideScrollBar>
        {body ?? (
          loading && items.length === 0 ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
              <DynamicIcon name={tab === 'archive' ? 'archive' : 'bell-off'} size={34} strokeWidth={1.5} />
              <p className="text-sm">{EMPTY_TEXT[tab]}</p>
            </div>
          ) : (
            items.map((item) => (
              <NotificationRow key={item.id} item={item} isAdmin={isAdmin} showRuleHints={showRuleHints} {...handlers} />
            ))
          )
        )}
      </ScrollShadow>

      {footer}
    </div>
  );
}
