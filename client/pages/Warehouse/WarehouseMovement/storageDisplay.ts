// ---------------------------------------------------------------------------
// storageDisplay — мапінг складів на коротку назву та стиль бейджа
//
// Дозволяє прив'язати колір і скорочену назву до конкретного складу (storageId).
// Для складів, яких немає в мапі, використовується назва з Dilovod
// (передається як fallbackName) та нейтральний стиль за замовчуванням.
// ---------------------------------------------------------------------------

export interface StorageDisplay {
  /** Коротка назва для бейджа (напр. "Склад ГП") */
  shortName: string;
  /** Tailwind-класи кольору бейджа (напр. "text-blue-800/50 bg-blue-500/10") */
  className: string;
}

/** Мапінг storageId → відображення */
export const STORAGE_DISPLAY_MAP: Record<string, StorageDisplay> = {
  '1100700000001005': {
    shortName: 'Склад ГП',
    className: 'text-blue-800/50 bg-blue-500/10',
  },
  '1100700000001019': {
    shortName: 'Склад М',
    className: 'text-lime-800/50 bg-lime-500/10',
  },
};

/** Стиль за замовчуванням для невідомих складів */
export const DEFAULT_STORAGE_DISPLAY: StorageDisplay = {
  shortName: 'Склад',
  className: 'text-gray-800/50 bg-gray-500/10',
};

/**
 * Повертає відображення складу за його ID.
 * @param storageId - ID складу (напр. mov.storage / mov.storageTo)
 * @param fallbackName - назва з Dilovod, якщо складу немає в мапі
 */
export function resolveStorageDisplay(
  storageId?: string,
  fallbackName?: string,
): StorageDisplay {
  if (storageId && STORAGE_DISPLAY_MAP[storageId]) {
    return STORAGE_DISPLAY_MAP[storageId];
  }
  return {
    shortName: fallbackName || DEFAULT_STORAGE_DISPLAY.shortName,
    className: DEFAULT_STORAGE_DISPLAY.className,
  };
}
