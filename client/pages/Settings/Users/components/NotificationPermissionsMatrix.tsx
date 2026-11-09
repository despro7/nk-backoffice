import { Checkbox, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  NOTIFICATION_DIRECT_EVENTS,
  NOTIFICATION_GROUPS,
  NOTIFICATION_LEVELS,
  directNotifyPermissionKey,
  notifyPermissionKey,
  type NotificationChannel,
  type NotificationGroupId,
  type NotificationLevel,
} from '@shared/constants/notifications';
import { HR_TABLE_CLASS_NAMES } from '@/pages/Hr/hrUi';

const LEVEL_DOT: Record<NotificationLevel, string> = {
  error: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
  info: 'bg-default-400',
};

const CHANNELS: Array<{ id: NotificationChannel; icon: string; label: string }> = [
  { id: 'app', icon: 'bell', label: 'Backoffice' },
  { id: 'tg', icon: 'send', label: 'Telegram' },
];

/**
 * Коли в ролі вмикається право, з яким вона стає адресатом (напр. затвердження специфікацій),
 * одразу вмикаємо обидва канали цієї адресної події – інакше нова роль мовчки нічого не отримає.
 */
export function withDirectEventDefaults(prev: ReadonlySet<string>, next: Set<string>): Set<string> {
  for (const event of NOTIFICATION_DIRECT_EVENTS) {
    if (next.has(event.requires) && !prev.has(event.requires)) {
      CHANNELS.forEach((ch) => next.add(directNotifyPermissionKey(event.id, ch.id)));
    }
  }
  return next;
}

const TH_CLASS = 'px-3 py-2.5 text-xs font-semibold text-default-500 bg-default-200/75 first:rounded-s-sm last:rounded-e-sm';

/**
 * Матриця «група × рівень × канал» для ролі. Кожна галочка – право
 * action.notify.<group>.<level>.<app|tg> у role_permissions.
 */
export function NotificationPermissionsMatrix({
  selected,
  disabled,
  onChange,
}: {
  selected: Set<string>;
  disabled: boolean;
  onChange: (next: Set<string>) => void;
}) {
  const has = (group: NotificationGroupId, level: NotificationLevel, channel: NotificationChannel) =>
    disabled || selected.has(notifyPermissionKey(group, level, channel));

  const setKeys = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    onChange(next);
  };

  const columnKeys = (level: NotificationLevel, channel: NotificationChannel) =>
    NOTIFICATION_GROUPS.map((g) => notifyPermissionKey(g.id, level, channel));
  const rowKeys = (group: NotificationGroupId, channel: NotificationChannel) =>
    NOTIFICATION_LEVELS.map((l) => notifyPermissionKey(group, l.id, channel));

  const state = (keys: string[]) => {
    const on = keys.filter((k) => disabled || selected.has(k)).length;
    return { all: on === keys.length, some: on > 0 && on < keys.length };
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-default-900">
          <DynamicIcon name="bell-ring" size={14} className="shrink-0 text-default-500" />
          Сповіщення
        </h3>
        <p className="pl-5 text-xs leading-relaxed text-default-500">
          Які сповіщення роль отримує в дзвіночку і в Telegram. Що належить до груп, налаштовується в «Налаштування → Сповіщення».
          Адресні сповіщення приходять конкретним людям (кому – визначає подія), тут їх можна вимкнути для ролі.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={`${TH_CLASS} text-left`}>Група</th>
              {NOTIFICATION_LEVELS.map((level) => (
                <th key={level.id} className={`${TH_CLASS} text-center`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[level.id]}`} aria-hidden />
                    {level.label}
                  </span>
                  <div className="mt-1 flex justify-center gap-3 font-normal">
                    {CHANNELS.map((ch) => {
                      const s = state(columnKeys(level.id, ch.id));
                      return (
                        <Tooltip key={ch.id} content={`${ch.label}: усі групи`} delay={300}>
                          <span className="inline-flex items-center gap-0.5">
                            <DynamicIcon name={ch.icon as any} size={11} className="text-default-400" />
                            <Checkbox
                              size="sm"
                              isSelected={s.all}
                              isIndeterminate={s.some}
                              isDisabled={disabled}
                              aria-label={`${level.label}, ${ch.label}: усі групи`}
                              onValueChange={(v) => setKeys(columnKeys(level.id, ch.id), v)}
                            />
                          </span>
                        </Tooltip>
                      );
                    })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_GROUPS.map((group) => (
              <tr key={group.id} className={HR_TABLE_CLASS_NAMES.tr}>
                <td className="rounded-s-md px-3 py-2">
                  <div className="font-medium text-default-900">{group.label}</div>
                  <div className="text-xs text-default-500">{group.hint}</div>
                  <div className="mt-1 flex gap-3">
                    {CHANNELS.map((ch) => {
                      const s = state(rowKeys(group.id, ch.id));
                      return (
                        <Checkbox
                          key={ch.id}
                          size="sm"
                          isSelected={s.all}
                          isIndeterminate={s.some}
                          isDisabled={disabled}
                          onValueChange={(v) => setKeys(rowKeys(group.id, ch.id), v)}
                          classNames={{ label: 'text-[11px] text-default-500' }}
                        >
                          {ch.id === 'app' ? 'усе в застосунку' : 'усе в Telegram'}
                        </Checkbox>
                      );
                    })}
                  </div>
                </td>
                {NOTIFICATION_LEVELS.map((level) => (
                  <td key={level.id} className="px-3 py-2 text-center last:rounded-e-md">
                    <div className="flex justify-center gap-3">
                      {CHANNELS.map((ch) => (
                        <Tooltip key={ch.id} content={ch.label} delay={500}>
                          <span className="inline-flex items-center gap-0.5">
                            <DynamicIcon name={ch.icon as any} size={11} className="text-default-400" />
                            <Checkbox
                              size="sm"
                              isSelected={has(group.id, level.id, ch.id)}
                              isDisabled={disabled}
                              aria-label={`${group.label}, ${level.label}: ${ch.label}`}
                              onValueChange={(v) => setKeys([notifyPermissionKey(group.id, level.id, ch.id)], v)}
                            />
                          </span>
                        </Tooltip>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DirectEventsSection selected={selected} disabled={disabled} setKeys={setKeys} />
    </div>
  );
}

/** Адресні події: рядок показується, лише якщо роль може бути адресатом (має `requires`). */
function DirectEventsSection({
  selected,
  disabled,
  setKeys,
}: {
  selected: Set<string>;
  disabled: boolean;
  setKeys: (keys: string[], on: boolean) => void;
}) {
  const events = NOTIFICATION_DIRECT_EVENTS.filter((e) => disabled || selected.has(e.requires));
  const channelKeys = (channel: NotificationChannel) => events.map((e) => directNotifyPermissionKey(e.id, channel));
  const state = (keys: string[]) => {
    const on = keys.filter((k) => disabled || selected.has(k)).length;
    return { all: keys.length > 0 && on === keys.length, some: on > 0 && on < keys.length };
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={`${TH_CLASS} text-left`}>
              Адресні
              <span className="ml-1.5 font-normal text-default-400">кому – визначає подія</span>
            </th>
            {CHANNELS.map((ch) => {
              const s = state(channelKeys(ch.id));
              return (
                <th key={ch.id} className={`${TH_CLASS} w-[140px] text-center`}>
                  {/* Чекбокс «усі» в одному рядку з назвою колонки. */}
                  <span className="inline-flex items-center gap-1">
                    <DynamicIcon name={ch.icon as any} size={12} className="text-default-400" />
                    {ch.label}
                    {events.length > 0 && (
                      <Checkbox
                        size="sm"
                        className="-ml-1.5"
                        isSelected={s.all}
                        isIndeterminate={s.some}
                        isDisabled={disabled}
                        aria-label={`${ch.label}: усі адресні`}
                        onValueChange={(v) => setKeys(channelKeys(ch.id), v)}
                      />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={1 + CHANNELS.length} className="px-3 py-3 text-xs text-default-500">
                Роль не отримує адресних сповіщень. Вони зʼявляться тут, коли роль отримає право затверджувати або редагувати специфікації.
              </td>
            </tr>
          ) : (
            events.map((event) => (
              <tr key={event.id} className={HR_TABLE_CLASS_NAMES.tr}>
                <td className="rounded-s-md px-3 py-2">
                  <div className="font-medium text-default-900">{event.label}</div>
                  <div className="text-xs text-default-500">{event.hint}</div>
                </td>
                {CHANNELS.map((ch) => {
                  const key = directNotifyPermissionKey(event.id, ch.id);
                  return (
                    <td key={ch.id} className="px-3 py-2 text-center last:rounded-e-md">
                      <span className="inline-flex items-center gap-0.5">
                        <DynamicIcon name={ch.icon as any} size={11} className="text-default-400" />
                        <Checkbox
                          size="sm"
                          isSelected={disabled || selected.has(key)}
                          isDisabled={disabled}
                          aria-label={`${event.label}: ${ch.label}`}
                          onValueChange={(v) => setKeys([key], v)}
                        />
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
