import { DynamicIcon } from 'lucide-react/dynamic';
import type { NotificationFeedItem, NotificationServiceId } from '@shared/types/notifications';

const SERVICE_STYLE: Record<NotificationServiceId, { icon: string; className: string }> = {
  dilovod: { icon: 'book-open', className: 'bg-sky-50 text-sky-700' },
  salesdrive: { icon: 'shopping-cart', className: 'bg-violet-50 text-violet-700' },
  sync: { icon: 'refresh-cw', className: 'bg-teal-50 text-teal-700' },
  warehouse: { icon: 'warehouse', className: 'bg-amber-50 text-amber-700' },
  products: { icon: 'package', className: 'bg-lime-50 text-lime-700' },
  assembly: { icon: 'package-check', className: 'bg-orange-50 text-orange-700' },
  cron: { icon: 'clock', className: 'bg-default-100 text-default-600' },
  webhook: { icon: 'webhook', className: 'bg-default-100 text-default-600' },
  system: { icon: 'server', className: 'bg-default-100 text-default-600' },
};

/** Тони для ініціалів: стабільні за userId. */
const USER_TONES = [
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-fuchsia-100 text-fuchsia-700',
];

export function notificationDotClass(item: Pick<NotificationFeedItem, 'kind' | 'level'>): string {
  if (item.kind === 'task') return 'bg-sky-500';
  switch (item.level) {
    case 'error':
      return 'bg-danger';
    case 'warning':
      return 'bg-warning';
    case 'success':
      return 'bg-success';
    default:
      return 'bg-default-400';
  }
}

interface NotificationAvatarProps {
  item: Pick<NotificationFeedItem, 'source' | 'kind' | 'level'>;
  /** Колір рамки точки = фон рядка. */
  ringClassName?: string;
}

export function NotificationAvatar({ item, ringClassName = 'ring-white' }: NotificationAvatarProps) {
  const { source } = item;
  const isUser = source.type === 'user';
  const style = isUser
    ? USER_TONES[source.userId % USER_TONES.length]
    : SERVICE_STYLE[source.id]?.className ?? SERVICE_STYLE.system.className;

  return (
    <div
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold ${style}`}
      title={isUser ? source.name : source.label}
    >
      {isUser ? source.initials : <DynamicIcon name={(SERVICE_STYLE[source.id]?.icon ?? 'server') as any} size={19} />}
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ${ringClassName} ${notificationDotClass(item)}`}
        aria-hidden
      />
    </div>
  );
}
