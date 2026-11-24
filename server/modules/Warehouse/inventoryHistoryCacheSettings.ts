import { prisma } from '../../lib/utils.js';
import {
  normalizeInventoryHistoryCacheSettings,
  type InventoryHistoryCacheSettings,
} from '../../../shared/types/inventoryHistoryCache.js';

export const INVENTORY_HISTORY_CACHE_SETTINGS_KEY = 'inventory_history_cache';

/** Значення з БД перечитуються не частіше, ніж раз на хвилину (і одразу після збереження). */
const SETTINGS_REFRESH_MS = 60 * 1000;

let cached: { value: InventoryHistoryCacheSettings; loadedAt: number } | null = null;

export async function getInventoryHistoryCacheSettings(): Promise<InventoryHistoryCacheSettings> {
  if (cached && Date.now() - cached.loadedAt < SETTINGS_REFRESH_MS) return cached.value;
  let raw: unknown = null;
  try {
    const row = await prisma.settingsBase.findUnique({ where: { key: INVENTORY_HISTORY_CACHE_SETTINGS_KEY } });
    raw = row?.value ? JSON.parse(row.value) : null;
  } catch {
    raw = null;
  }
  const value = normalizeInventoryHistoryCacheSettings(raw);
  cached = { value, loadedAt: Date.now() };
  return value;
}

export async function saveInventoryHistoryCacheSettings(input: unknown): Promise<InventoryHistoryCacheSettings> {
  const value = normalizeInventoryHistoryCacheSettings(input);
  await prisma.settingsBase.upsert({
    where: { key: INVENTORY_HISTORY_CACHE_SETTINGS_KEY },
    update: { value: JSON.stringify(value) },
    create: {
      key: INVENTORY_HISTORY_CACHE_SETTINGS_KEY,
      value: JSON.stringify(value),
      description: 'Кеш денних рухів для історії товару в інвентаризації (TTL, хв)',
      category: 'inventory',
      isActive: true,
    },
  });
  cached = { value, loadedAt: Date.now() };
  return value;
}
