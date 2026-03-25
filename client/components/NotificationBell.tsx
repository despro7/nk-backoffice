import { useState, useCallback, useRef } from 'react';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollShadow,
  Chip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { AppNotification, NotificationSeverity } from '../../shared/types/notifications';
import { useNotifications } from '../hooks/useNotifications';
import { useDebug } from '../contexts/DebugContext';
import ResultDrawer from './ResultDrawer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  NotificationSeverity,
  { icon: string; chipColor: 'danger' | 'warning' | 'primary' | 'success'; dotClass: string; rowClass: string }
> = {
  error:   { icon: 'alert-circle',   chipColor: 'danger',  dotClass: 'bg-danger',   rowClass: 'border-l-danger-300   bg-danger-50/80'   },
  warning: { icon: 'alert-triangle', chipColor: 'warning', dotClass: 'bg-warning',  rowClass: 'border-l-warning-300  bg-warning-50/80'  },
  info:    { icon: 'info',           chipColor: 'primary', dotClass: 'bg-primary',  rowClass: 'border-l-primary-300  bg-primary-50/80'  },
  success: { icon: 'check-circle',   chipColor: 'success', dotClass: 'bg-success',  rowClass: 'border-l-success-300  bg-success-50/80'  },
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'щойно';
  if (mins < 60) return `${mins} хв тому`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} год тому`;
  const days = Math.floor(hrs / 24);
  return `${days} дн тому`;
}

// ─── Category / title translations ────────────────────────────────────────────

const TITLE_LABELS: Record<string, string> = {
  // Manual export (dilovod.ts)
	'Export failed':                                           				'Помилка експорту замовлення в Діловод',
  'Dilovod export result':                                          'Експорт замовлення в Діловод',
  'Dilovod shipment export result':                                 'Відвантаження замовлення в Діловод',
  // DilovodExportBuilder
  'Експорт замовлення заблоковано - немає товарів для відправки':   'Експорт заблоковано — немає товарів',
  // DilovodAutoExportService
  'Auto export result (saleOrder)':                                 'Авто-експорт замовлення',
  'Auto export error (saleOrder)':                                  'Помилка авто-експорту замовлення',
  'Auto shipment export result (sale)':                             'Авто-відвантаження замовлення',
  'Auto shipment error (sale)':                                     'Помилка авто-відвантаження',
};

const CATEGORY_LABELS: Record<string, string> = {
  'dilovod':     		'Діловод',
  'dilovod-export': 'Експорт у Діловод',
  'orders_sync': 		'Синхронізація замовлень',
  'webhook':     		'Webhook',
  'cron':        		'Планове завдання',
  'sync':        		'Синхронізація',
  'system':      		'Система',
  'manual':      		'Ручна дія',
  'default':     		'Загальне',
};

function translateTitle(notification: AppNotification): string {
  if (notification.title && TITLE_LABELS[notification.title]) {
    return TITLE_LABELS[notification.title];
  }
  return notification.title || 'Лог';
}

function translateCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

// ─── NotificationRow ──────────────────────────────────────────────────────────

interface NotificationRowProps {
  notification: AppNotification;
  onMarkRead: (id: number) => void;
  onOpenLog: (n: AppNotification) => void;
}

function NotificationRow({ notification, onMarkRead, onOpenLog }: NotificationRowProps) {
  const cfg = SEVERITY_CONFIG[notification.severity];

  return (
    <div
      className={`
        relative flex flex-col border-l-3 rounded-lg
        ${cfg.rowClass}
        ${notification.read ? 'opacity-60' : ''}
      `}
    >
      {/* Header */}
      <div className="flex gap-3 px-3 pt-3 pb-2">
        {/* Severity icon */}
        <div className="flex-shrink-0 mt-0.5">
          <DynamicIcon name={cfg.icon as any} size={16} className={`text-${cfg.chipColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              {translateTitle(notification)}
            </p>
            <span className="text-[11px] text-gray-400 flex-shrink-0">
              {formatRelativeTime(notification.createdAt)}
            </span>
          </div>
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
            {notification.message}
          </p>
					{notification.orderNumber && (
						<span className="text-xs">
							Замовлення: <span className="font-medium text-gray-600">{notification.orderNumber}</span>
						</span>
					)}
					<div className="flex items-center gap-2 mt-2 flex-wrap">
						{notification.tag && (
							<Chip size="sm" variant="flat" color={cfg.chipColor} className="h-4 text-[10px] px-1">
								{notification.tag}
							</Chip>
						)}
            {notification.category && (
              <Chip size="sm" variant="flat" color="default" className="h-4 text-[10px] px-1">
                {translateCategory(notification.category)}
              </Chip>
            )}
          </div>
        </div>

        {/* Unread dot */}
        {!notification.read && (
          <span className={`absolute top-2 right-2 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotClass}`} />
        )}
      </div>

      {/* Footer: кнопки по краях */}
      <div className="flex items-center justify-between pl-10 pr-3 py-2 border-t border-black/5">
        <button
          onClick={() => { onOpenLog(notification); if (!notification.read) onMarkRead(notification.id); }}
          className="flex items-center gap-1 text-[11px] text-primary hover:text-primary-600 transition-colors"
        >
          <DynamicIcon name="external-link" size={11} />
          Показати лог
        </button>
        {!notification.read && (
          <button
            onClick={(e) => { e.stopPropagation(); onMarkRead(notification.id); }}
            title="Позначити прочитаним"
            className={`flex items-center gap-1 text-[11px] text-${cfg.chipColor} hover:opacity-70 transition-opacity`}
          >
            <DynamicIcon name="check" size={11} />
            Прочитано
          </button>
        )}
      </div>
    </div>
  );
}

// ─── DebugFooter ──────────────────────────────────────────────────────────────

interface DebugFooterProps {
  clearAll: () => Promise<void>;
  markAllReadGlobal: (offset?: number) => Promise<{ markedCount: number; skipped: number } | null>;
  hideAllGlobal: (offset?: number) => Promise<{ hiddenCount: number; skipped: number } | null>;
}

function DebugFooter({ clearAll, markAllReadGlobal, hideAllGlobal }: DebugFooterProps) {
  const offsetRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<string | null>(null);

  const getOffset = () => parseInt(offsetRef.current?.value || '0') || 0;

  const handleReadGlobal = useCallback(async () => {
    const res = await markAllReadGlobal(getOffset());
    if (res) setResult(`✓ read: ${res.markedCount}, skip: ${res.skipped}`);
  }, [markAllReadGlobal]);

  const handleHideGlobal = useCallback(async () => {
    const res = await hideAllGlobal(getOffset());
    if (res) setResult(`✓ hidden: ${res.hiddenCount}, skip: ${res.skipped}`);
  }, [hideAllGlobal]);

  return (
    <div className="flex items-center gap-1 flex-wrap justify-end">
      {result && <span className="text-[10px] text-green-600">{result}</span>}
      {/* Offset input + глобальні дії */}
      <div className="flex items-center gap-0.5 border border-orange-200 rounded-md overflow-hidden h-6">
        <input
          ref={offsetRef}
          type="number"
          min={0}
          defaultValue={0}
          className="w-10 text-[11px] text-center bg-white outline-none px-1 h-full"
          title="offset — пропустити N найновіших"
        />
        <button
          className="flex items-center gap-0.5 px-1.5 h-full bg-orange-50 hover:bg-orange-100 text-orange-500 text-[11px] transition-colors border-l border-orange-200"
          onClick={handleReadGlobal}
          title="Позначити прочитаними для всіх (з offset)"
        >
          <DynamicIcon name="check-check" size={11} />
          Read all
        </button>
        <button
          className="flex items-center gap-0.5 px-1.5 h-full bg-orange-50 hover:bg-orange-100 text-orange-500 text-[11px] transition-colors border-l border-orange-200"
          onClick={handleHideGlobal}
          title="Сховати для всіх (з offset)"
        >
          <DynamicIcon name="eye-off" size={11} />
          Hide all
        </button>
      </div>
      <button
        className="flex items-center gap-0.5 px-1.5 h-6 rounded-md bg-orange-50 hover:bg-orange-100 text-orange-400 text-[11px] transition-colors"
        onClick={() => clearAll()}
        title="Скинути всі власні read-позначки"
      >
        <DynamicIcon name="rotate-ccw" size={11} />
        Reset read
      </button>
    </div>
  );
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

interface NotificationBellProps {
  onNavigate?: (href: string) => void;
}

export function NotificationBell({ onNavigate: _onNavigate }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [drawerNotification, setDrawerNotification] = useState<AppNotification | null>(null);
  const [drawerLog, setDrawerLog] = useState<any[] | null>(null);
  const { notifications, unreadCount, markRead, markAllRead, markAllReadGlobal, hideAll, hideAllGlobal, clearAll } = useNotifications();
  const { isDebugMode } = useDebug();

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const handleMarkRead = useCallback((id: number) => {
    markRead(id);
  }, [markRead]);

  const handleMarkAllRead = useCallback(() => {
    markAllRead();
  }, [markAllRead]);

  const handleClearAll = useCallback(() => {
    hideAll();
  }, [hideAll]);

  const handleOpenLog = useCallback(async (n: AppNotification) => {
    setIsOpen(false);
    setDrawerNotification(n);
    setDrawerLog(null); // показуємо drawer одразу, лог підвантажиться
    try {
      const res = await fetch(`/api/meta-logs/${n.id}`);
      const data = await res.json();
      if (data && !data.error) {
        setDrawerLog([data]);
      }
    } catch {
      // fallback — залишаємо drawerLog = null, drawer покаже що є
    }
  }, []);

  return (
    <>
    <Popover
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      placement="bottom-end"
      offset={8}
      showArrow={false}
    >
      <PopoverTrigger>
        <button
          type="button"
          aria-label={`Сповіщення${unreadCount > 0 ? `, ${unreadCount} непрочитаних` : ''}`}
          className="relative flex items-center justify-center rounded-sm transition-all duration-200 bg-neutral-100 text-neutral-600 p-2"
        >
          <DynamicIcon name="bell" size={24} strokeWidth={2} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold leading-[18px] text-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="p-0 w-[400px] shadow-xl rounded-xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between w-full px-4 py-3 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2">
            <DynamicIcon name="bell" size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-800">Сповіщення</span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="light"
                className="text-xs text-primary h-7 px-2 min-w-0"
                onPress={handleMarkAllRead}
              >
                Прочитати все
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                size="sm"
                variant="light"
                className="text-xs text-gray-400 h-7 px-2 min-w-0"
                onPress={handleClearAll}
              >
                Очистити
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <ScrollShadow className="max-h-[460px] w-full" hideScrollBar>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
              <DynamicIcon name="bell-off" size={36} strokeWidth={1.5} />
              <p className="text-sm">Немає нових сповіщень</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onMarkRead={handleMarkRead}
                  onOpenLog={handleOpenLog}
                />
              ))}
            </div>
          )}
        </ScrollShadow>

        {/* Footer */}
        {(notifications.length > 0 || isDebugMode) && (
          <div className="w-full px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex flex-col items-center justify-between gap-2">
            <span className="text-xs text-gray-400 shrink-0">
              {notifications.length > 0
                ? unreadCount > 0
                  ? `${unreadCount} непрочитаних із ${notifications.length}`
                  : `Усі ${notifications.length} прочитані`
                : ''}
            </span>
            {isDebugMode && <DebugFooter clearAll={clearAll} markAllReadGlobal={markAllReadGlobal} hideAllGlobal={hideAllGlobal} />}
          </div>
        )}
      </PopoverContent>
    </Popover>

    {/* ResultDrawer — поза Popover щоб не закривався при відкритті */}
    <ResultDrawer
      isOpen={drawerNotification !== null}
      onOpenChange={(open) => { if (!open) { setDrawerNotification(null); setDrawerLog(null); } }}
      result={drawerLog ?? (drawerNotification ? [drawerNotification] : null)}
      title={drawerNotification ? translateTitle(drawerNotification) : ''}
      type="logs"
    />
    </>
  );
}
