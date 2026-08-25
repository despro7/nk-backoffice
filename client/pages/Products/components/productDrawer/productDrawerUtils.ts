import { parseNumberInput } from '@/lib/numberInput';
import type { CatalogGoodDetailDto, DrawerMode } from '../../ProductsTypes';
import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_DEFAULT_MAIN_UNIT_ID,
} from '../../ProductsTypes';
import type { BarcodeRow, BomRow, DrawerForm, DrawerObjectKind, PriceRow } from './productDrawerTypes';

export function resolveObjectKind(
  mode: DrawerMode,
  detail: CatalogGoodDetailDto | null
): DrawerObjectKind | null {
  if (mode === 'create-folder') return 'group';
  if (mode === 'create') return null;
  if (detail?.isGroup) return 'group';
  if (detail?.accPolicyId === CATALOG_ACC_POLICY_KIT) return 'kit';
  if (!detail?.accPolicyId || detail.accPolicyId === CATALOG_ACC_POLICY_GOOD) return 'good';
  return 'other';
}

export function drawerTitle(kind: DrawerObjectKind | null, isEdit: boolean): string {
  if (!kind) return 'Новий обʼєкт';
  const titles: Record<DrawerObjectKind, { create: string; edit: string }> = {
    good: { create: 'Нова продукція', edit: 'Редагування' },
    kit: { create: 'Новий товарний набір', edit: 'Редагування' },
    group: { create: 'Нова група', edit: 'Редагування' },
    other: { create: 'Новий обʼєкт', edit: 'Редагування' },
  };
  return isEdit ? titles[kind].edit : titles[kind].create;
}

export const emptyForm = (): DrawerForm => ({
  name: '',
  sku: '',
  mainUnitId: CATALOG_DEFAULT_MAIN_UNIT_ID,
  packageRatio: '',
  specQty: '1',
  weight: '',
  unitRatio: '1',
  printName: '',
  description: '',
  fullDescription: '',
  accPolicyId: CATALOG_ACC_POLICY_GOOD,
});

export function snapshotState(
  form: DrawerForm,
  components: BomRow[],
  prices: PriceRow[],
  barcodes: BarcodeRow[],
  objectKind: DrawerObjectKind | null
): string {
  return JSON.stringify({ form, components, prices, barcodes, objectKind });
}

export function newStagingSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
  }
  return `stg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Вага, кг: завжди округлення до 0,01; `decimals` лише для відображення. */
export function formatWeightKg(value: number, decimals: 2 | 3): string {
  const rounded = Math.round(Math.max(0, value) * 100) / 100;
  if (decimals === 3) {
    return rounded.toFixed(3).replace('.', ',');
  }
  const trimmed = rounded.toFixed(2).replace(/\.?0+$/, '');
  return (trimmed || '0').replace('.', ',');
}

export function hasComponentWeight(weight: number | null): boolean {
  return weight != null && Number.isFinite(weight) && weight > 0;
}

export function showMissingWeightBadge(
  isKitBom: boolean,
  accPolicyId: string | null | undefined,
  hasWeight: boolean
): boolean {
  if (hasWeight) return false;
  if (isKitBom) return true;
  return accPolicyId === CATALOG_ACC_POLICY_GOOD || accPolicyId === CATALOG_ACC_POLICY_KIT;
}

export function sortDictByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'uk', { sensitivity: 'base' }));
}

export function parseSpecQtyInput(raw: string): number {
  const n = parseNumberInput(raw);
  if (n == null || n <= 0) return 1;
  return n;
}

/** Поле заповнене додатним числом (не порожнє і не 0). */
export function isRequiredPositiveField(raw: string): boolean {
  const n = parseNumberInput(raw);
  return n != null && n > 0;
}

export const NESTED_DRAWER_Z = ['', '!z-[60]', '!z-[70]', '!z-[80]', '!z-[90]'] as const;
/** Confirm/модалки та «вибір партії» — на +5 над поточним nested Drawer. */
export const NESTED_OVERLAY_Z = ['!z-[55]', '!z-[65]', '!z-[75]', '!z-[85]', '!z-[95]'] as const;
export const NESTED_DRAWER_MAX_W = [
  '',
  'max-h-[calc(100dvh-1rem)] top-4 md:max-w-[calc(var(--container-4xl)-2rem)]',
  'max-h-[calc(100dvh-1.5rem)] top-6 md:max-w-[calc(var(--container-4xl)-4rem)]',
  'max-h-[calc(100dvh-2rem)] top-8 md:max-w-[calc(var(--container-4xl)-6rem)]',
  'max-h-[calc(100dvh-2.5rem)] top-10 md:max-w-[calc(var(--container-4xl)-8rem)]',
] as const;
