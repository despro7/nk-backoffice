import { useCallback, useState } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { NotificationFeedItem } from '@shared/types/notifications';
import { useNotificationFeed } from '../hooks/useNotificationFeed';
import { useDebug } from '../contexts/debug-context';
import { useRolePreview } from '../contexts/role-preview-context';
import { NotificationPanel } from './notifications/NotificationPanel';
import { NotificationPrefsView } from './notifications/NotificationPrefsView';
import { NotificationDebugTools } from './notifications/NotificationDebugTools';
import { NotificationTelegramConnect } from './notifications/NotificationTelegramConnect';
import { useOrderDetailsDrawer } from './notifications/useOrderDetailsDrawer';
import { NotificationDocumentDrawer } from './notifications/NotificationDocumentDrawer';
import ResultDrawer from './ResultDrawer';
import ResizableAppDrawer from './drawer/ResizableAppDrawer';
import { useRoleAccess } from '../hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';

// ─── NotificationBell ─────────────────────────────────────────────────────────

interface NotificationBellProps {
  onNavigate?: (href: string) => void;
  size?: 'default' | 'sm';
}

export function NotificationBell({ onNavigate, size = 'default' }: NotificationBellProps) {
  const iconSize = size === 'sm' ? 22 : 24;
  const [isOpen, setIsOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [drawerItem, setDrawerItem] = useState<NotificationFeedItem | null>(null);
  const [drawerLog, setDrawerLog] = useState<any[] | null>(null);
  const feed = useNotificationFeed(isOpen);
  const { isDebugMode } = useDebug();
  const { isAdminView: isAdmin } = useRolePreview();
  const unread = feed.counts.all;
  const orderDrawer = useOrderDetailsDrawer();
  const [documentLogId, setDocumentLogId] = useState<number | null>(null);
  const [fullTextItem, setFullTextItem] = useState<NotificationFeedItem | null>(null);
  const { hasPermission } = useRoleAccess();
  const canOpenOrderDrawer = hasPermission(PERMISSIONS.ACTION_DILOVOD_EXPORT);

  const navigate = useCallback((href: string) => {
    setIsOpen(false);
    onNavigate?.(href);
  }, [onNavigate]);

  const handleOpen = useCallback((item: NotificationFeedItem) => {
    if (!item.action) return;
    const { link } = item.action;
    feed.markRead(item);
    // Складський документ: дровер із локальним записом (працює і для документів, яких немає в Діловоді).
    if (item.hasDocument) {
      setIsOpen(false);
      setDocumentLogId(item.id);
      return;
    }
    // Скріншот звіту користувача – в новій вкладці.
    if (link.startsWith('/api/')) {
      window.open(link, '_blank', 'noopener');
      return;
    }
    // Замовлення: дровер деталей поверх поточної сторінки; без доступу або не знайдено – перехід за посиланням.
    const orderNumber = /^\/orders\/([^/?#]+)$/.exec(link)?.[1];
    if (orderNumber && canOpenOrderDrawer) {
      setIsOpen(false);
      void orderDrawer.open(decodeURIComponent(orderNumber)).then((ok) => {
        if (!ok) navigate(link);
      });
      return;
    }
    navigate(link);
  }, [feed, navigate, canOpenOrderDrawer, orderDrawer]);

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
      <Popover
        isOpen={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setShowPrefs(false);
        }}
        placement="bottom-end"
        offset={20}
        showArrow={false}
        // Інакше скрол над тултіпом (портал поза дропдауном) скролить сторінку і закриває дропдаун.
        shouldCloseOnScroll={false}
      >
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

        <PopoverContent className="w-[440px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border-0 border-default-200 p-0 shadow-2xl">
          <NotificationPanel
            items={feed.items}
            counts={feed.counts}
            tab={feed.tab}
            onTabChange={(next) => {
              setShowPrefs(false);
              feed.setTab(next);
            }}
            settingsOpen={showPrefs}
            loading={feed.initialLoading}
            isAdmin={isAdmin}
            showRuleHints={isAdmin && isDebugMode}
            onOpenReport={() => navigate('/reports/meta-logs')}
            onOpenSettings={() => {
              feed.loadPrefs();
              setShowPrefs(true);
            }}
            body={
              showPrefs ? (
                <NotificationPrefsView
                  data={feed.prefs}
                  onChange={feed.savePrefs}
                  debugSlot={isDebugMode ? <NotificationDebugTools debug={feed.debug} /> : null}
                  telegramSlot={
                    feed.prefs ? <NotificationTelegramConnect telegram={feed.prefs.telegram} onRefresh={feed.loadPrefs} /> : null
                  }
                />
              ) : undefined
            }
            onOpen={handleOpen}
            onMarkRead={feed.markRead}
            onArchive={feed.archive}
            onUnarchive={feed.unarchive}
            onResolve={feed.resolve}
            onShowLog={isDebugMode ? handleShowLog : undefined}
            onShowFullText={(item) => {
              setIsOpen(false);
              feed.markRead(item);
              setFullTextItem(item);
            }}
            onEditRule={(item) => navigate(`/settings/notifications?log=${item.id}`)}
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

      <ResultDrawer
        isOpen={orderDrawer.state.isOpen}
        onOpenChange={(open) => {
          if (!open) orderDrawer.close();
        }}
        result={orderDrawer.state.result}
        title={orderDrawer.state.title}
        type="orderDetails"
        getChannelName={orderDrawer.getChannelName}
      />

      <NotificationDocumentDrawer logId={documentLogId} onClose={() => setDocumentLogId(null)} />

      <ResizableAppDrawer
        isOpen={fullTextItem !== null}
        onClose={() => setFullTextItem(null)}
        title={fullTextItem?.title ?? ''}
        initialPlacement="right"
        widthStorageKey="notification-full-text-drawer-width-v1"
        defaultWidth={640}
        minWidth={480}
        maxWidth={1000}
        resizeAriaLabel="Змінити ширину панелі сповіщення"
        footer={<Button variant="light" onPress={() => setFullTextItem(null)}>Закрити</Button>}
      >
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-default-800">{fullTextItem?.message}</p>
      </ResizableAppDrawer>
    </>
  );
}
