import { collectPagePermissions, parseRequiredPermissionKeys } from '@shared/constants/permissions';
import { appRoutes } from '@/routes.config';

const pageLabelByKey = new Map(
  collectPagePermissions(appRoutes).map((item) => [item.key, item.label]),
);

/** Людська назва page.* з маршрутів; action.* — лише якщо сервер уже надіслав label у message. */
export function resolveClientPermissionLabel(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const first = trimmed.split('|')[0]?.trim();
  if (!first) return null;
  return pageLabelByKey.get(first) ?? null;
}

export function describeInsufficientPermissionAction(
  serverMessage: string | undefined,
  permissionKey: string | null,
): string | null {
  const trimmedMessage = serverMessage?.trim() ?? '';
  if (trimmedMessage && !trimmedMessage.startsWith('Required permission:')) {
    return trimmedMessage;
  }

  const keysFromMessage = trimmedMessage ? parseRequiredPermissionKeys(trimmedMessage) : [];
  const keys = permissionKey
    ? permissionKey.split('|').map((k) => k.trim()).filter(Boolean)
    : keysFromMessage;

  if (keys.length === 0) return null;

  const labels = keys
    .map((key) => resolveClientPermissionLabel(key))
    .filter((label): label is string => Boolean(label));

  if (labels.length === 1) return `Дія: «${labels[0]}»`;
  if (labels.length > 1) {
    return `Потрібне одне з прав: ${labels.map((l) => `«${l}»`).join(', ')}`;
  }

  if (keys.length === 1) return `Потрібне право (${keys[0]})`;
  return `Потрібне одне з прав (${keys.join(', ')})`;
}
