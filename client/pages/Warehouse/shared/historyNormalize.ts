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
  raw?: any;
}

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

export function normalizeItem(it: any): HistoryItemNormalized {
  const sku = String(it?.sku ?? it?.id ?? it?.set_sku ?? '') || '';
  const name = it?.name ?? it?.productName ?? it?.title ?? null;
  const qty = Number(it?.quantity ?? it?.qty ?? it?.portionQuantity ?? it?.totalPortions ?? 0) || 0;
  const batch = it?.batchNumber ?? it?.batchName ?? null;
  const batchId = it?.batchId ?? null;
  const price = (it?.price !== undefined && it?.price !== null) ? Number(it.price) : null;
  const productId = it?.productId ?? null;
  const dilovodId = it?.dilovodId ?? null;
  return { sku, name, qty, batch, batchId, price, productId, dilovodId, raw: it };
}

export function normalizeSet(setItem: any): HistorySetNormalized {
  const setSku = String(setItem?.set_sku ?? setItem?.setSku ?? setItem?.sku ?? '') || '';
  const setName = setItem?.name ?? setItem?.title ?? null;
  const setQty = Number(setItem?.quantity ?? setItem?.qty ?? 0) || 0;
  const compsRaw = Array.isArray(setItem?.components_snapshot)
    ? setItem.components_snapshot
    : (Array.isArray(setItem?.componentsSnapshot) ? setItem.componentsSnapshot : []);
  const components = compsRaw.map(normalizeItem);
  const componentsTotal = components.reduce((s, c) => s + (Number(c.qty) || 0), 0);
  return { setSku, setName, setQty, components, componentsTotal, raw: setItem };
}

export function normalizeItemsArray(raw: any): HistoryItemNormalized[] {
  const arr = safeParseItems(raw);
  return arr.map(normalizeItem);
}

export function normalizeSetsArray(raw: any): HistorySetNormalized[] {
  const arr = safeParseItems(raw);
  return arr.map(normalizeSet);
}
