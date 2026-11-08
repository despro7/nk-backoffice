import { DynamicIcon } from 'lucide-react/dynamic';
import type { NotificationFeedItem, NotificationServiceId, NotificationSource } from '@shared/types/notifications';

const SERVICE_STYLE: Record<NotificationServiceId, { icon: string; className: string }> = {
  dilovod: { icon: 'book-open', className: 'bg-gray-700' },
  salesdrive: { icon: 'shopping-cart', className: 'bg-[#2A6CAA]' },
  sync: { icon: 'refresh-cw', className: 'bg-teal-100 text-teal-700' },
  warehouse: { icon: 'warehouse', className: 'bg-amber-100 text-amber-700' },
  products: { icon: 'package', className: 'bg-lime-100 text-lime-700' },
  assembly: { icon: 'package-check', className: 'bg-orange-100 text-orange-700' },
  cron: { icon: 'clock', className: 'bg-default-100 text-default-600' },
  webhook: { icon: 'webhook', className: 'bg-default-100 text-default-600' },
  system: { icon: 'server', className: 'bg-default-100 text-default-600' },
};

/** Піктограма Діловода (фірмовий жовтий знак). */
function DilovodMark({ width }: { width: number }) {
  return (
    <svg viewBox="184 2 92 49" width={width} height={Math.round((width * 49) / 92)}aria-hidden>
      <path
        fill="#FFE501"
        d="M199.964 25c1.583 1.497 2.376 3.486 2.376 5.967 0 1.113-.15 2.225-.449 3.336-.299 1.113-.984 2.803-2.052 5.07l-4.284 9.117a.766.766 0 0 1-.698.443h-7.464a.77.77 0 0 1-.739-.988l2.737-9.254a.767.767 0 0 0-.352-.883 7.006 7.006 0 0 1-2.549-2.51c-.73-1.219-1.091-2.663-1.091-4.33 0-2.482.791-4.47 2.374-5.969 1.582-1.496 3.616-2.246 6.098-2.246 2.483 0 4.512.75 6.095 2.247h-.002Zm12.927 13.163c-2.582-1.469-4.598-3.597-6.061-6.384-1.463-2.787-2.193-6.106-2.193-9.956 0-3.85.73-7.17 2.193-9.957 1.463-2.786 3.479-4.914 6.061-6.384 2.582-1.47 5.547-2.204 8.901-2.204s6.323.735 8.901 2.204c2.578 1.47 4.602 3.597 6.061 6.384 1.46 2.787 2.189 6.106 2.189 9.957 0 3.85-.729 7.17-2.189 9.956-1.459 2.786-3.479 4.915-6.061 6.384-2.581 1.47-5.547 2.204-8.901 2.204s-6.323-.734-8.901-2.204Zm36.049 0c-2.577-1.47-4.598-3.598-6.061-6.384-1.463-2.787-2.192-6.106-2.192-9.957 0-3.85.729-7.17 2.192-9.956 1.463-2.786 3.48-4.915 6.061-6.384 2.582-1.47 5.547-2.204 8.901-2.204 3.357 0 6.324.734 8.901 2.204 2.582 1.47 4.603 3.597 6.062 6.384 1.459 2.787 2.188 6.105 2.188 9.956 0 3.85-.729 7.17-2.188 9.957-1.459 2.786-3.48 4.915-6.062 6.384-2.577 1.47-5.544 2.204-8.901 2.204-3.354 0-6.323-.735-8.901-2.204Z"
      />
    </svg>
  );
}

/** Логотип SalesDrive (займає всю плитку аватара). */
function SalesDriveMark() {
  return (
    <svg viewBox="0 0 220 220" className="h-full w-full p-1 overflow-hidden rounded-[inherit]" aria-hidden>
      <g fill="none" stroke="#fff" strokeLinecap="round">
        <path strokeWidth={14} d="M200 62c0 15.464-40.294 28-90 28S20 77.464 20 62s40.294-28 90-28 90 12.536 90 28Z" />
        <path strokeWidth={13} d="M36 101c6.027 4.218 16.28 7.827 29.457 10.366s28.68 3.895 44.543 3.895 31.367-1.356 44.543-3.895c13.177-2.539 23.43-6.148 29.457-10.366" />
        <path strokeWidth={12} d="M52 130c5.668 2.847 14.048 5.224 24.256 6.88s21.866 2.53 33.744 2.53 23.536-.874 33.744-2.53S162.332 132.847 168 130" />
        <path strokeWidth={11} d="M78 160c3.726 1.49 8.557 2.7 14.112 3.533S103.79 164.8 110 164.8s12.334-.434 17.889-1.267S138.274 161.49 142 160" />
        <path strokeWidth={10} d="M90 185c2.19 1.1 5.161 2.003 8.65 2.627 3.491.624 7.39.951 11.35.951s7.859-.327 11.349-.951S127.811 186.1 130 185" />
      </g>
    </svg>
  );
}

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

const SIZES = {
  md: { box: 'h-10 w-10 rounded-xl text-[13px]', icon: 19, dilovod: 28 },
  sm: { box: 'h-6 w-6 rounded-md text-[10px]', icon: 13, dilovod: 17 },
} as const;

/** Аватар джерела без індикатора: користувач (ініціали) або сервіс (логотип / іконка). */
export function SourceAvatar({ source, size = 'md', className = '' }: { source: NotificationSource; size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  const isUser = source.type === 'user';
  const style = isUser
    ? USER_TONES[source.userId % USER_TONES.length]
    : SERVICE_STYLE[source.id]?.className ?? SERVICE_STYLE.system.className;
  return (
    <div
      className={`flex shrink-0 items-center justify-center font-semibold ${s.box} ${style} ${className}`}
      title={isUser ? source.name : source.label}
    >
      {isUser ? (
        source.initials
      ) : source.id === 'dilovod' ? (
        <DilovodMark width={s.dilovod} />
      ) : source.id === 'salesdrive' ? (
        <SalesDriveMark />
      ) : (
        <DynamicIcon name={(SERVICE_STYLE[source.id]?.icon ?? 'server') as any} size={s.icon} />
      )}
    </div>
  );
}

interface NotificationAvatarProps {
  item: Pick<NotificationFeedItem, 'source' | 'kind' | 'level'>;
  /** Колір рамки точки = фон рядка. */
  ringClassName?: string;
}

export function NotificationAvatar({ item, ringClassName = 'ring-white' }: NotificationAvatarProps) {
  return (
    <div className="relative h-10 w-10 shrink-0">
      <SourceAvatar source={item.source} />
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ${ringClassName} ${notificationDotClass(item)}`}
        aria-hidden
      />
    </div>
  );
}
