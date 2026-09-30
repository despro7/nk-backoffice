import { parseNumberInput } from '@/lib/numberInput';
import type { CatalogGoodImageDto } from '@shared/types/catalog';
import type { CatalogGoodDetailDto, DrawerMode } from '../../ProductsTypes';
import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_DEFAULT_MAIN_UNIT_ID,
} from '../../ProductsTypes';
import type {
  BarcodeRow,
  BomRow,
  CardTabKey,
  DrawerForm,
  DrawerObjectKind,
  PriceRow,
} from './productDrawerTypes';

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
  doNotPublish: false,
  storefrontPresetId: '',
  productIngredientsJson: [],
  productNutritionJson: null,
  storefrontDescriptionDoc: '',
  mainProductWeight: '',
  grossWeight: '',
});

type ComparableBomRow = {
  componentGoodId: string;
  qty: number;
  unitId: string;
  note: string;
  cookingLossPercent: number;
};

type ComparableImageRow = {
  id: number;
  sortOrder: number;
  isPrimary: boolean;
  fileName: string;
};

type DrawerStateSnapshot = {
  form: DrawerForm;
  components: ComparableBomRow[];
  prices: PriceRow[];
  barcodes: BarcodeRow[];
  images: ComparableImageRow[];
  objectKind: DrawerObjectKind | null;
  parentId: string | null;
};

function mapComparableComponents(components: BomRow[]): ComparableBomRow[] {
  return components.map((row) => ({
    componentGoodId: row.componentGoodId,
    qty: row.qty,
    unitId: row.unitId,
    note: row.note,
    cookingLossPercent: row.cookingLossPercent,
  }));
}

function mapComparableImages(images: CatalogGoodImageDto[]): ComparableImageRow[] {
  return images.map((image) => ({
    id: image.id,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
    fileName: image.fileName,
  }));
}

function buildDrawerStateSnapshot(
  form: DrawerForm,
  components: BomRow[],
  prices: PriceRow[],
  barcodes: BarcodeRow[],
  images: CatalogGoodImageDto[],
  objectKind: DrawerObjectKind | null,
  parentId?: string | null,
): DrawerStateSnapshot {
  return {
    form,
    components: mapComparableComponents(components),
    prices,
    barcodes,
    images: mapComparableImages(images),
    objectKind,
    parentId: parentId ?? null,
  };
}

export function snapshotState(
  form: DrawerForm,
  components: BomRow[],
  prices: PriceRow[],
  barcodes: BarcodeRow[],
  images: CatalogGoodImageDto[],
  objectKind: DrawerObjectKind | null,
  parentId?: string | null,
): string {
  return JSON.stringify(buildDrawerStateSnapshot(form, components, prices, barcodes, images, objectKind, parentId));
}

export type DrawerDirtyFieldKey =
  | 'name'
  | 'sku'
  | 'mainUnitId'
  | 'packageRatio'
  | 'specQty'
  | 'weight'
  | 'unitRatio'
  | 'printName'
  | 'description'
  | 'fullDescription'
  | 'accPolicyId'
  | 'doNotPublish'
  | 'storefrontPresetId'
  | 'productIngredientsJson'
  | 'productNutritionJson'
  | 'storefrontDescriptionDoc'
  | 'mainProductWeight'
  | 'components'
  | 'prices'
  | 'barcodes'
  | 'images'
  | 'parentId'
  | 'objectKind';

/** @deprecated Використовуйте DrawerDirtyFieldKey */
export type StorefrontDirtyFieldKey = Extract<
  DrawerDirtyFieldKey,
  | 'description'
  | 'doNotPublish'
  | 'storefrontPresetId'
  | 'productIngredientsJson'
  | 'productNutritionJson'
  | 'storefrontDescriptionDoc'
>;

export const DRAWER_MAIN_TAB_DIRTY_KEYS: readonly DrawerDirtyFieldKey[] = [
  'name',
  'sku',
  'mainUnitId',
  'printName',
  'accPolicyId',
  'parentId',
  'objectKind',
  'packageRatio',
  'specQty',
  'weight',
  'unitRatio',
  'mainProductWeight',
  'components',
  'prices',
  'barcodes',
];

export const DRAWER_CONTENT_TAB_DIRTY_KEYS: readonly DrawerDirtyFieldKey[] = [
  'description',
  'doNotPublish',
  'storefrontPresetId',
  'productIngredientsJson',
  'productNutritionJson',
  'storefrontDescriptionDoc',
  'images',
  'fullDescription',
];

type StorefrontFieldsSnapshot = {
  description: string;
  fullDescription: string;
  storefrontDescriptionDoc: string;
  productIngredientsJson: string[];
  productNutritionJson: DrawerForm['productNutritionJson'];
  doNotPublish: boolean;
  storefrontPresetId: string;
  components: ComparableBomRow[];
};

/** Snapshot лише полів вкладки контенту / storefront для auto-push */
export function snapshotStorefrontFields(form: DrawerForm, components: BomRow[]): string {
  return JSON.stringify(buildStorefrontFieldsSnapshot(form, components));
}

function buildStorefrontFieldsSnapshot(
  form: DrawerForm,
  components: BomRow[],
): StorefrontFieldsSnapshot {
  return {
    description: form.description,
    fullDescription: form.fullDescription,
    storefrontDescriptionDoc: form.storefrontDescriptionDoc,
    productIngredientsJson: form.productIngredientsJson,
    productNutritionJson: form.productNutritionJson,
    doNotPublish: form.doNotPublish,
    storefrontPresetId: form.storefrontPresetId,
    components: mapComparableComponents(components),
  };
}

/** Порівняння поточного стану з baseline для підсвічування змінених полів картки. */
/** Оновлює storefront-поля в повному baseline після пасивної гідратації вкладки контенту. */
export function mergeStorefrontFieldsIntoDrawerBaseline(
  baselineJson: string,
  form: DrawerForm,
): string {
  if (!baselineJson) return baselineJson;
  try {
    const baseline = JSON.parse(baselineJson) as DrawerStateSnapshot;
    return JSON.stringify({
      ...baseline,
      form: {
        ...baseline.form,
        description: form.description,
        fullDescription: form.fullDescription,
        storefrontDescriptionDoc: form.storefrontDescriptionDoc,
        productIngredientsJson: form.productIngredientsJson,
        productNutritionJson: form.productNutritionJson,
        doNotPublish: form.doNotPublish,
        storefrontPresetId: form.storefrontPresetId,
      },
    });
  } catch {
    return baselineJson;
  }
}

export function getDrawerDirtyFields(
  form: DrawerForm,
  components: BomRow[],
  prices: PriceRow[],
  barcodes: BarcodeRow[],
  images: CatalogGoodImageDto[],
  objectKind: DrawerObjectKind | null,
  parentId: string | null | undefined,
  baselineJson: string,
): Set<DrawerDirtyFieldKey> {
  if (!baselineJson) return new Set();
  let baseline: DrawerStateSnapshot;
  try {
    baseline = JSON.parse(baselineJson) as DrawerStateSnapshot;
  } catch {
    return new Set();
  }

  const current = buildDrawerStateSnapshot(form, components, prices, barcodes, images, objectKind, parentId);
  const dirty = new Set<DrawerDirtyFieldKey>();

  if (current.form.name !== baseline.form.name) dirty.add('name');
  if (current.form.sku !== baseline.form.sku) dirty.add('sku');
  if (current.form.mainUnitId !== baseline.form.mainUnitId) dirty.add('mainUnitId');
  if (current.form.packageRatio !== baseline.form.packageRatio) dirty.add('packageRatio');
  if (current.form.specQty !== baseline.form.specQty) dirty.add('specQty');
  if (current.form.weight !== baseline.form.weight) dirty.add('weight');
  if (current.form.unitRatio !== baseline.form.unitRatio) dirty.add('unitRatio');
  if (current.form.printName !== baseline.form.printName) dirty.add('printName');
  if (current.form.description !== baseline.form.description) dirty.add('description');
  if (current.form.fullDescription !== baseline.form.fullDescription) dirty.add('fullDescription');
  if (current.form.accPolicyId !== baseline.form.accPolicyId) dirty.add('accPolicyId');
  if (current.form.doNotPublish !== baseline.form.doNotPublish) dirty.add('doNotPublish');
  if (current.form.storefrontPresetId !== baseline.form.storefrontPresetId) dirty.add('storefrontPresetId');
  if (current.form.mainProductWeight !== baseline.form.mainProductWeight) dirty.add('mainProductWeight');
  if (JSON.stringify(current.form.productIngredientsJson) !== JSON.stringify(baseline.form.productIngredientsJson)) {
    dirty.add('productIngredientsJson');
  }
  if (JSON.stringify(current.form.productNutritionJson) !== JSON.stringify(baseline.form.productNutritionJson)) {
    dirty.add('productNutritionJson');
  }
  if (current.form.storefrontDescriptionDoc !== baseline.form.storefrontDescriptionDoc) {
    dirty.add('storefrontDescriptionDoc');
  }
  if (JSON.stringify(current.components) !== JSON.stringify(baseline.components)) dirty.add('components');
  if (JSON.stringify(current.prices) !== JSON.stringify(baseline.prices)) dirty.add('prices');
  if (JSON.stringify(current.barcodes) !== JSON.stringify(baseline.barcodes)) dirty.add('barcodes');
  if (JSON.stringify(current.images) !== JSON.stringify(baseline.images ?? [])) dirty.add('images');
  if (current.parentId !== baseline.parentId) dirty.add('parentId');
  if (current.objectKind !== baseline.objectKind) dirty.add('objectKind');

  return dirty;
}

/** @deprecated Використовуйте getDrawerDirtyFields */
export function getStorefrontDirtyFields(
  form: DrawerForm,
  components: BomRow[],
  baselineJson: string,
): Set<StorefrontDirtyFieldKey> {
  if (!baselineJson) return new Set();
  let baseline: StorefrontFieldsSnapshot;
  try {
    baseline = JSON.parse(baselineJson) as StorefrontFieldsSnapshot;
  } catch {
    return new Set();
  }
  const current = buildStorefrontFieldsSnapshot(form, components);
  const dirty = new Set<StorefrontDirtyFieldKey>();
  if (current.description !== baseline.description) dirty.add('description');
  if (current.doNotPublish !== baseline.doNotPublish) dirty.add('doNotPublish');
  if (current.storefrontPresetId !== baseline.storefrontPresetId) dirty.add('storefrontPresetId');
  if (JSON.stringify(current.productIngredientsJson) !== JSON.stringify(baseline.productIngredientsJson)) {
    dirty.add('productIngredientsJson');
  }
  if (JSON.stringify(current.productNutritionJson) !== JSON.stringify(baseline.productNutritionJson)) {
    dirty.add('productNutritionJson');
  }
  if (current.storefrontDescriptionDoc !== baseline.storefrontDescriptionDoc) {
    dirty.add('storefrontDescriptionDoc');
  }
  return dirty;
}

export function isDrawerTabDirty(
  dirtyFields: Set<DrawerDirtyFieldKey>,
  tab: CardTabKey,
): boolean {
  if (tab === 'main') {
    return DRAWER_MAIN_TAB_DIRTY_KEYS.some((key) => dirtyFields.has(key));
  }
  if (tab === 'content') {
    return DRAWER_CONTENT_TAB_DIRTY_KEYS.some((key) => dirtyFields.has(key));
  }
  return false;
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
