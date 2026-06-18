// Utility functions to normalize various item shapes stored in warehouse_* tables
export interface HistoryItemNormalized {
  sku: string;
  name: string | null;
  qty: number;
  batch?: string | null;
  batchId?: string | null;
  price?: number | null;
  productId?: number | null;
  dilovodId?: string | null;
  raw?: any;
}

export interface HistorySetNormalized {
  setSku: string;
  setName: string | null;
  setQty: number;
  components: HistoryItemNormalized[];
  componentsTotal: number;
  componentsQuantityMode?: 'per_set' | 'total';
  raw?: any;
}

// Safely parse a JSON/string/array field into an array
export function safeParseItems(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  let v = raw;
  try {
    while (typeof v === 'string') v = JSON.parse(v);
  } catch (e) {
    return [];
  }
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return [v];
  return [];
}

// Normalize a single item to canonical shape
export function normalizeItem(it: any): HistoryItemNormalized {
  const sku = String(it?.sku ?? it?.id ?? it?.set_sku ?? '') || '';
  const name = it?.name ?? it?.productName ?? it?.title ?? null;
  const qty = Number(it?.quantity ?? it?.qty ?? it?.portionQuantity ?? it?.totalPortions ?? 0) || 0;
  const batch = it?.batchNumber ?? it?.batchName ?? null;
  const batchId = it?.batchId ?? null;
  const price = (it?.price !== undefined && it?.price !== null) ? Number(it.price) : null;
  const productId = it?.productId ?? null;
  const dilovodId = it?.dilovodId ?? null;
  return {
    sku,
    name,
    qty,
    batch,
    batchId,
    price,
    productId,
    dilovodId,
    raw: it,
  };
}

// Normalize a set (release set) object
export function normalizeSet(setItem: any): HistorySetNormalized {
  const setSku = String(setItem?.set_sku ?? setItem?.setSku ?? setItem?.sku ?? '') || '';
  const setName = setItem?.name ?? setItem?.title ?? null;
  const setQty = Number(setItem?.quantity ?? setItem?.qty ?? 0) || 0;
  const componentsQuantityMode = String(setItem?.components_quantity_mode ?? '').toLowerCase() === 'total' ? 'total' : 'per_set';
  const compsRaw = Array.isArray(setItem?.components_snapshot)
    ? setItem.components_snapshot
    : (Array.isArray(setItem?.componentsSnapshot) ? setItem.componentsSnapshot : []);
  const components = compsRaw.map(normalizeItem);
  const componentsTotal = components.reduce((s, c) => s + (Number(c.qty) || 0), 0);
  return {
    setSku,
    setName,
    setQty,
    components,
    componentsTotal,
    componentsQuantityMode,
    raw: setItem,
  };
}

export function normalizeItemsArray(raw: any): HistoryItemNormalized[] {
  const arr = safeParseItems(raw);
  return arr.map(normalizeItem);
}

export function normalizeSetsArray(raw: any): HistorySetNormalized[] {
  const arr = safeParseItems(raw);
  return arr.map(normalizeSet);
}

// Normalize items array as used by SetReleaseController before saving
export function normalizeReleaseHistoryItems(items: any[]): any[] {
  if (!Array.isArray(items)) return [];
  return items.map((it: any) => {
    const setQty = Number(it?.quantity ?? 0);
    const safeSetQty = Number.isFinite(setQty) && setQty > 0 ? setQty : 0;
    const quantityMode = String(it?.components_quantity_mode ?? '').toLowerCase() === 'total' ? 'total' : 'per_set';

    const rawComponents = Array.isArray(it?.components_snapshot)
      ? it.components_snapshot
      : (Array.isArray(it?.componentsSnapshot) ? it.componentsSnapshot : []);

    const componentsSnapshot = rawComponents.map((component: any) => {
      const rawQty = Number(component?.quantity ?? component?.qty ?? 0);
      const safeRawQty = Number.isFinite(rawQty) ? rawQty : 0;

      const totalQty = quantityMode === 'total'
        ? safeRawQty
        : safeRawQty * safeSetQty;

      const perSetQtyRaw = component?.quantity_per_set ?? component?.quantityPerSet;
      const parsedPerSetQty = Number(perSetQtyRaw);
      const perSetQty = Number.isFinite(parsedPerSetQty)
        ? parsedPerSetQty
        : (quantityMode === 'total'
          ? (safeSetQty > 0 ? totalQty / safeSetQty : totalQty)
          : safeRawQty);

      return {
        ...component,
        quantity: totalQty,
        quantity_per_set: perSetQty,
      };
    });

    return {
      ...it,
      components_snapshot: componentsSnapshot,
      components_quantity_mode: 'total',
    };
  });
}
