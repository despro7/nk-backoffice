export type ReleaseSendErrorSource = 'dilovod' | 'validation' | 'internal';

export type ReleaseSendErrorInfo = {
  /** Пояснення для користувача */
  message: string;
  /** Сира відповідь Dilovod API (JSON/текст). Не дублювати локальну валідацію. */
  raw?: string | null;
  source?: ReleaseSendErrorSource;
};

const GOOD_PART_USER_MESSAGE =
  'Обрана партія не є реальною партією Dilovod (catalogs.goodParts). '
  + 'Оберіть іншу партію або створіть нову — Dilovod відхиляє такий goodPart.';

function humanizeKnownRaw(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (
    lower.includes('cant set value of tpgoods.goodpart')
    || lower.includes('tpgoods.goodpart: bad value')
  ) {
    return GOOD_PART_USER_MESSAGE;
  }
  return null;
}

export function formatReleaseSendErrorRaw(
  dilovodResponse: unknown,
  fallback?: string | null,
): string | null {
  if (dilovodResponse != null) {
    try {
      return JSON.stringify(dilovodResponse, null, 2);
    } catch {
      return String(dilovodResponse);
    }
  }
  const text = String(fallback ?? '').trim();
  return text || null;
}

export function buildReleaseSendError(input: {
  message: string;
  raw?: string | null;
  source?: ReleaseSendErrorSource;
}): ReleaseSendErrorInfo {
  const message = String(input.message ?? '').trim();
  const raw = input.raw != null ? String(input.raw).trim() || null : null;
  return {
    message: message || 'Невідома помилка відправки',
    ...(raw ? { raw } : {}),
    ...(input.source ? { source: input.source } : {}),
  };
}

/** Читає dilovod_send_error зі string (legacy) або обʼєкта. */
export function normalizeReleaseSendError(value: unknown): ReleaseSendErrorInfo | null {
  if (value == null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const human = humanizeKnownRaw(trimmed);
    return {
      message: human || trimmed,
      raw: trimmed,
      source: 'dilovod',
    };
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const message = String(obj.message ?? obj.error ?? '').trim();
    if (!message) return null;

    let raw: string | null = null;
    if (obj.raw != null) {
      raw = typeof obj.raw === 'string'
        ? (obj.raw.trim() || null)
        : formatReleaseSendErrorRaw(obj.raw);
    }

    const source: ReleaseSendErrorSource | undefined =
      obj.source === 'validation' || obj.source === 'internal' || obj.source === 'dilovod'
        ? obj.source
        : undefined;

    return {
      message,
      ...(raw ? { raw } : {}),
      ...(source ? { source } : {}),
    };
  }

  return null;
}

export function extractReleaseSendErrorFromItems(items: unknown): ReleaseSendErrorInfo | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  if (!first || typeof first !== 'object') return null;
  return normalizeReleaseSendError((first as { dilovod_send_error?: unknown }).dilovod_send_error);
}
