import {
  ROLE_PREVIEW_HEADER,
  ROLE_PREVIEW_APPLIED_HEADER,
  INSUFFICIENT_ROLE_HEADER,
  REQUIRED_PERMISSION_HEADER,
  ROLE_LABELS,
  isRoleValue,
  isRolePreviewExemptPath,
} from '@shared/constants/roles';
import { ToastService } from '@/services/ToastService';
import { describeInsufficientPermissionAction } from '@/lib/resolvePermissionLabel';

let previewRole: string | null = null;
let roleLabelResolver: ((slug: string) => string | null) | null = null;
let fetchPatched = false;
let originalFetch: typeof window.fetch | null = null;
let lastInsufficientRoleToastAt = 0;
const INSUFFICIENT_ROLE_TOAST_COOLDOWN_MS = 2000;

type InsufficientRoleBody = {
  message?: string;
  permissionKey?: string;
};

/**
 * Встановлює роль для попереднього перегляду при запитах fetch.
 * @param role Значення ролі, або null для скидання.
 */
export function setRolePreviewFetchRole(role: string | null): void {
  previewRole = role;
}

/** Людська назва ролі за slug (користувацькі ролі role-N тощо). */
export function setRolePreviewFetchRoleLabelResolver(
  resolver: ((slug: string) => string | null) | null,
): void {
  roleLabelResolver = resolver;
}

function resolveRoleLabel(slug: string): string {
  const resolved = roleLabelResolver?.(slug);
  if (resolved) return resolved;
  if (isRoleValue(slug)) return ROLE_LABELS[slug];
  return slug;
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

async function readInsufficientRoleBody(response: Response): Promise<InsufficientRoleBody | null> {
  try {
    const data = (await response.clone().json()) as InsufficientRoleBody;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

async function notifyInsufficientRole(response: Response): Promise<void> {
  if (response.status !== 403) return;
  if (response.headers.get(INSUFFICIENT_ROLE_HEADER) !== '1') return;

  const now = Date.now();
  if (now - lastInsufficientRoleToastAt < INSUFFICIENT_ROLE_TOAST_COOLDOWN_MS) return;
  lastInsufficientRoleToastAt = now;

  const previewApplied = response.headers.get(ROLE_PREVIEW_APPLIED_HEADER);
  const deniedRole = previewApplied || previewRole;
  const roleLabel = deniedRole ? resolveRoleLabel(deniedRole) : null;

  const body = await readInsufficientRoleBody(response);
  const permissionKey =
    body?.permissionKey?.trim()
    || response.headers.get(REQUIRED_PERMISSION_HEADER)?.trim()
    || null;
  const actionDescription = describeInsufficientPermissionAction(body?.message, permissionKey);

  let description: string;
  if (actionDescription && roleLabel) {
    description = `Роль «${roleLabel}» не має доступу. ${actionDescription}`;
  } else if (actionDescription) {
    description = actionDescription;
  } else if (roleLabel) {
    description = `Роль «${roleLabel}» не має доступу до цієї дії`;
  } else {
    description = 'У вас немає доступу до цієї дії';
  }

  ToastService.show({
    title: 'Недостатньо прав',
    description,
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
    return dispatchFetch(input, init).then(async (response) => {
      await notifyInsufficientRole(response);
      return response;
    });
  };
}
