// Utility functions to normalize various item shapes stored in warehouse_* tables
export interface HistoryItemNormalized {
  sku: string;
  name: string | null;
  qty: number;
  batch?: string | null;
  batches?: string[];
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

function formatHistoryBatchLabel(batch: any): string {
  if (typeof batch === 'string') return batch.trim();
  const name = String(batch?.batchNumber ?? batch?.batchName ?? batch?.batchId ?? '').trim();
  if (!name) return '';
  const qty = Number(batch?.quantity ?? 0);
  return Number.isFinite(qty) && qty > 0 ? `${name} (${qty})` : name;
}

function readHistoryBatch(it: any): { batch: string | null; batches: string[]; batchId: string | null } {
  const nested = Array.isArray(it?.batches) ? it.batches : [];
  const labels = nested.map(formatHistoryBatchLabel).filter(Boolean);
  if (labels.length > 0) {
    const firstId = nested[0]?.batchId != null ? String(nested[0].batchId).trim() : '';
    return { batch: labels.join('\n'), batches: labels, batchId: firstId || null };
  }
  const batch = it?.batchNumber ?? it?.batchName ?? null;
  const batchId = it?.batchId != null ? String(it.batchId).trim() : '';
  const label = batch ? String(batch) : '';
  return { batch: label || null, batches: label ? [label] : [], batchId: batchId || null };
}

function withAllocationBatches(component: any, allocations: any[]): any {
  if (!component || typeof component !== 'object') return component;
  if (Array.isArray(component.batches) && component.batches.length > 0) return component;
  const sku = String(component?.id ?? component?.sku ?? component?.code ?? '').trim();
  const match = allocations.find((allocation) => String(allocation?.sku ?? '').trim() === sku);
  const batches = Array.isArray(match?.batches) ? match.batches : [];
  if (batches.length === 0) return component;
  return { ...component, batches };
}

// Normalize a single item to canonical shape
export function normalizeItem(it: any): HistoryItemNormalized {
  const sku = String(it?.sku ?? it?.id ?? it?.set_sku ?? '') || '';
  const name = it?.name ?? it?.productName ?? it?.title ?? null;
  const qty = Number(it?.quantity ?? it?.qty ?? it?.portionQuantity ?? it?.totalPortions ?? 0) || 0;
  const { batch, batches, batchId } = readHistoryBatch(it);
  const price = (it?.price !== undefined && it?.price !== null) ? Number(it.price) : null;
  const productId = it?.productId ?? null;
  const dilovodId = it?.dilovodId ?? null;
  return {
    sku,
    name,
    qty,
    batch,
    batches,
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
  const allocations = Array.isArray(setItem?.component_batches)
    ? setItem.component_batches
    : (Array.isArray(setItem?.componentBatches) ? setItem.componentBatches : []);
  const components = compsRaw.map((component: any) => normalizeItem(withAllocationBatches(component, allocations)));
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
