import { useCallback, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { NotificationFeedItem } from '@shared/types/notifications';
import { useNotificationFeed } from '../hooks/useNotificationFeed';
import { useDebug } from '../contexts/debug-context';
import { useRolePreview } from '../contexts/role-preview-context';
import { NotificationPanel } from './notifications/NotificationPanel';
import ResultDrawer from './ResultDrawer';

// ─── DebugFooter ──────────────────────────────────────────────────────────────

interface DebugFooterProps {
  debug: ReturnType<typeof useNotificationFeed>['debug'];
}

function DebugFooter({ debug }: DebugFooterProps) {
  const offsetRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<string | null>(null);
  const offset = () => parseInt(offsetRef.current?.value || '0') || 0;
  const run = async (fn: () => Promise<string | null>) => setResult(await fn());

  const btn = 'flex h-full items-center gap-0.5 border-l border-orange-200 bg-orange-50 px-1.5 text-[11px] text-orange-600 transition-colors hover:bg-orange-100';
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-orange-200 bg-orange-50/50 px-4 py-2">
      {result && <span className="text-[10px] text-success-600">✓ {result}</span>}
      <div className="flex h-6 items-center overflow-hidden rounded-md border border-orange-200">
        <input
          ref={offsetRef}
          id="notification-debug-offset"
          type="number"
          min={0}
          defaultValue={0}
          className="h-full w-10 bg-white px-1 text-center text-[11px] outline-none"
          title="offset – пропустити N найновіших"
        />
        <button type="button" className={btn} onClick={() => run(() => debug.readAllGlobal(offset()))} title="Позначити прочитаними для всіх (з offset)">
          <DynamicIcon name="check-check" size={11} />
          Read all
        </button>
        <button type="button" className={btn} onClick={() => run(() => debug.hideAllGlobal(offset()))} title="Сховати для всіх (з offset)">
          <DynamicIcon name="eye-off" size={11} />
          Hide all
        </button>
      </div>
      <button
        type="button"
        className="flex h-6 items-center gap-0.5 rounded-md bg-orange-50 px-1.5 text-[11px] text-orange-600 transition-colors hover:bg-orange-100"
        onClick={() => run(debug.resetOwnRead)}
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
  size?: 'default' | 'sm';
}

export function NotificationBell({ onNavigate, size = 'default' }: NotificationBellProps) {
  const iconSize = size === 'sm' ? 22 : 24;
  const [isOpen, setIsOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<NotificationFeedItem | null>(null);
  const [drawerLog, setDrawerLog] = useState<any[] | null>(null);
  const feed = useNotificationFeed(isOpen);
  const { isDebugMode } = useDebug();
  const { isAdminView: isAdmin } = useRolePreview();
  const unread = feed.counts.all;

  const navigate = useCallback((href: string) => {
    setIsOpen(false);
    onNavigate?.(href);
  }, [onNavigate]);

  const handleOpen = useCallback((item: NotificationFeedItem) => {
    if (!item.action) return;
    feed.markRead(item);
    navigate(item.action.link);
  }, [feed, navigate]);

  const handleShowLog = useCallback(async (item: NotificationFeedItem) => {
    setIsOpen(false);
    feed.markRead(item);
    setDrawerItem(item);
    setDrawerLog(null);
    try {
      const res = await fetch(`/api/meta-logs/${item.id}`);
      const data = await res.json();
      if (data && !data.error) setDrawerLog([data]);
    } catch {
      // drawer shows what it has
    }
  }, [feed]);

  return (
    <>
      <Popover isOpen={isOpen} onOpenChange={setIsOpen} placement="bottom-end" offset={8} showArrow={false}>
        <PopoverTrigger>
          <button
            type="button"
            aria-label={`Сповіщення${unread > 0 ? `, ${unread} непрочитаних` : ''}`}
            className={`relative flex items-center justify-center rounded-sm bg-neutral-100 text-neutral-600 transition-all duration-200 ${size === 'sm' ? 'p-1.5' : 'p-2'}`}
          >
            <DynamicIcon name="bell" size={iconSize} strokeWidth={2} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 h-[18px] min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-[440px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-default-200 p-0 shadow-xl">
          <NotificationPanel
            items={feed.items}
            counts={feed.counts}
            tab={feed.tab}
            onTabChange={feed.setTab}
            loading={feed.initialLoading}
            isAdmin={isAdmin}
            showRuleHints={isAdmin && isDebugMode}
            onOpenReport={() => navigate('/reports/meta-logs')}
            onOpen={handleOpen}
            onMarkRead={feed.markRead}
            onArchive={feed.archive}
            onUnarchive={feed.unarchive}
            onResolve={feed.resolve}
            onShowLog={isDebugMode ? handleShowLog : undefined}
            onEditRule={(item) => navigate(`/settings/notifications?log=${item.id}`)}
            footer={isDebugMode ? <DebugFooter debug={feed.debug} /> : null}
          />
        </PopoverContent>
      </Popover>

      {/* ResultDrawer поза Popover, щоб він не закривався при відкритті */}
      <ResultDrawer
        isOpen={drawerItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDrawerItem(null);
            setDrawerLog(null);
          }
        }}
        result={drawerLog ?? (drawerItem ? [drawerItem] : null)}
        title={drawerItem?.title ?? ''}
        type="logs"
      />
    </>
  );
}
