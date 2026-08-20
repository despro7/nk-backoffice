import {
  ROLE_PREVIEW_HEADER,
  ROLE_PREVIEW_APPLIED_HEADER,
  INSUFFICIENT_ROLE_HEADER,
  ROLE_LABELS,
  isRoleValue,
  isRolePreviewExemptPath,
} from '@shared/constants/roles';
import { ToastService } from '@/services/ToastService';

let previewRole: string | null = null;
let fetchPatched = false;
let originalFetch: typeof window.fetch | null = null;
let lastInsufficientRoleToastAt = 0;
const INSUFFICIENT_ROLE_TOAST_COOLDOWN_MS = 2000;

/**
 * Встановлює роль для попереднього перегляду при запитах fetch.
 * @param role Значення ролі, або null для скидання.
 */
export function setRolePreviewFetchRole(role: string | null): void {
  previewRole = role;
}

/**
 * Перетворює RequestInfo/URL у рядок URL.
 * @param input RequestInfo або URL
 * @returns Рядковий URL
 */
function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Отримує pathname з повного URL або рядка шляху.
 * @param url Рядок URL або шлях
 * @returns Pathname без параметрів запиту
 */
function toPathname(url: string): string {
  if (url.startsWith('/')) return url.split('?')[0];
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.split('?')[0];
  }
}

/**
 * Перевіряє, чи є url API-запитом того ж походження.
 * @param url Рядок URL
 * @returns Чи є той самий origin та шлях починається на /api/
 */
function isSameOriginApiUrl(url: string): boolean {
  const pathname = toPathname(url);
  if (!pathname.startsWith('/api/')) return false;
  if (url.startsWith('/')) return true;
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

function notifyInsufficientRole(response: Response): void {
  if (response.status !== 403) return;
  if (response.headers.get(INSUFFICIENT_ROLE_HEADER) !== '1') return;

  const now = Date.now();
  if (now - lastInsufficientRoleToastAt < INSUFFICIENT_ROLE_TOAST_COOLDOWN_MS) return;
  lastInsufficientRoleToastAt = now;

  const previewApplied = response.headers.get(ROLE_PREVIEW_APPLIED_HEADER);
  const deniedRole = previewApplied || previewRole;
  const roleLabel = deniedRole
    ? (isRoleValue(deniedRole) ? ROLE_LABELS[deniedRole] : deniedRole)
    : null;

  ToastService.show({
    title: 'Недостатньо прав',
    description: roleLabel
      ? `Роль «${roleLabel}» не має доступу до цієї дії`
      : 'У вас немає доступу до цієї дії',
    color: previewApplied ? 'warning' : 'danger',
    settingKey: 'apiErrors',
  });
}

function dispatchFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!originalFetch) {
    return Promise.reject(new Error('fetch unavailable'));
  }

  const role = previewRole;
  if (!role) {
    return originalFetch(input, init);
  }

  const url = resolveUrl(input);
  if (!isSameOriginApiUrl(url) || isRolePreviewExemptPath(toPathname(url))) {
    return originalFetch(input, init);
  }

  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );
  if (!headers.has(ROLE_PREVIEW_HEADER)) {
    headers.set(ROLE_PREVIEW_HEADER, role);
  }

  if (input instanceof Request) {
    return originalFetch(new Request(input, { ...init, headers }));
  }

  return originalFetch(input, { ...init, headers });
}

/**
 * Патчить глобальний window.fetch, щоб додавати хедер ROLE_PREVIEW_HEADER для вибраної ролі на API шляхи.
 */
export function installRolePreviewFetch(): void {
  if (fetchPatched || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  fetchPatched = true;
  originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    return dispatchFetch(input, init).then((response) => {
      notifyInsufficientRole(response);
      return response;
    });
  };
}
