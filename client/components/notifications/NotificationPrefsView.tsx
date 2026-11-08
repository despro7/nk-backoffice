import { useEffect, useState, type ReactNode } from 'react';
import { Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { NOTIFICATION_GROUPS, type NotificationGroupId } from '@shared/constants/notifications';
import type { NotificationPrefsResponse, NotificationUserPrefsData } from '@shared/types/notifications';
import { playNotificationSound } from './notificationSound';

interface NotificationPrefsViewProps {
  data: NotificationPrefsResponse | null;
  onChange: (prefs: NotificationUserPrefsData) => void;
  onBack: () => void;
  /** Блок Telegram (підключення бота), якщо налаштовано. */
  telegramSlot?: ReactNode;
}

function Row({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-default-100 py-2.5">
      <div className="min-w-0">
        <div className={`text-sm ${disabled ? 'text-default-400' : 'text-default-900'}`}>{title}</div>
        <div className="text-xs text-default-500">{hint}</div>
      </div>
      <Switch size="sm" aria-label={title} isSelected={checked} isDisabled={disabled} onValueChange={onChange} />
    </div>
  );
}

const SECTION = 'mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wider text-default-500';

export function NotificationPrefsView({ data, onChange, onBack, telegramSlot }: NotificationPrefsViewProps) {
  const [prefs, setPrefs] = useState<NotificationUserPrefsData | null>(data?.prefs ?? null);
  useEffect(() => setPrefs(data?.prefs ?? null), [data]);

  if (!data || !prefs) {
    return <div className="px-5 py-10 text-center text-sm text-default-400">Завантаження…</div>;
  }

  const update = (patch: Partial<NotificationUserPrefsData>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    onChange(next);
  };

  const toggleIn = (list: NotificationGroupId[], group: NotificationGroupId, on: boolean) =>
    on ? list.filter((g) => g !== group) : [...list, group];

  return (
    <div className="px-5 pb-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1 pt-3 text-[13px] text-default-500 hover:text-default-800">
        <DynamicIcon name="chevron-left" size={15} />
        До сповіщень
      </button>

      <div className={SECTION}>Групи в дзвіночку</div>
      {NOTIFICATION_GROUPS.map((g) => {
        const allowed = data.allowed.app.includes(g.id);
        return (
          <Row
            key={g.id}
            title={g.label}
            hint={allowed ? g.hint : 'Вимкнено для вашої ролі'}
            checked={allowed && !prefs.mutedGroups.includes(g.id)}
            disabled={!allowed}
            onChange={(on) => update({ mutedGroups: toggleIn(prefs.mutedGroups, g.id, on) })}
          />
        );
      })}
      <p className="mt-2 text-xs text-default-500">Адресні сповіщення (наприклад, специфікація на затвердження) приходять завжди.</p>

      <div className={SECTION}>Сигнали</div>
      <Row
        title="Звук"
        hint="Короткий сигнал, коли з’являється нове непрочитане"
        checked={prefs.sound}
        onChange={(sound) => {
          update({ sound });
          if (sound) playNotificationSound();
        }}
      />

      {telegramSlot && (
        <>
          <div className={SECTION}>Telegram</div>
          {telegramSlot}
          {data.telegram.linked &&
            NOTIFICATION_GROUPS.filter((g) => data.allowed.tg.includes(g.id)).map((g) => (
              <Row
                key={g.id}
                title={g.label}
                hint="Дублювати в Telegram"
                checked={!prefs.mutedTgGroups.includes(g.id)}
                onChange={(on) => update({ mutedTgGroups: toggleIn(prefs.mutedTgGroups, g.id, on) })}
              />
            ))}
          {data.telegram.linked && data.allowed.tg.length === 0 && (
            <p className="mt-2 text-xs text-default-500">Ваша роль поки не отримує сповіщень у Telegram.</p>
          )}
        </>
      )}
    </div>
  );
}
