export interface HistoryBatchLink {
  label: string;
  batchId: string;
}

export interface HistoryItemNormalized {
  sku: string;
  name: string | null;
  qty: number;
  batch?: string | null;
  /** Окремі підписи партій; кілька штук таблиця показує списком. */
  batches?: string[];
  batchLinks?: HistoryBatchLink[];
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

function readHistoryBatch(it: any): {
  batch: string | null;
  batches: string[];
  batchLinks: HistoryBatchLink[];
  batchId: string | null;
} {
  const nested = Array.isArray(it?.batches) ? it.batches : [];
  const batchLinks: HistoryBatchLink[] = nested
    .map((entry: unknown) => {
      const label = formatHistoryBatchLabel(entry);
      const batchId = entry && typeof entry === 'object' && 'batchId' in entry
        ? String((entry as { batchId?: unknown }).batchId ?? '').trim()
        : '';
      if (!label || !batchId) return null;
      return { label, batchId };
    })
    .filter((row): row is HistoryBatchLink => row != null);
  const labels = nested.map(formatHistoryBatchLabel).filter(Boolean);
  if (labels.length > 0) {
    const firstId = nested[0]?.batchId != null ? String(nested[0].batchId).trim() : '';
    return {
      batch: labels.join('\n'),
      batches: labels,
      batchLinks,
      batchId: firstId || null,
    };
  }
  const batch = it?.batchNumber ?? it?.batchName ?? null;
  const batchId = it?.batchId != null ? String(it.batchId).trim() : '';
  const label = batch ? String(batch).trim() : '';
  if (label) {
    const links = batchId ? [{ label, batchId }] : [];
    return { batch: label, batches: [label], batchLinks: links, batchId: batchId || null };
  }
  if (batchId) {
    return { batch: batchId, batches: [batchId], batchLinks: [{ label: batchId, batchId }], batchId };
  }
  return { batch: null, batches: [], batchLinks: [], batchId: null };
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

/** Кількість для рядка історії (переміщення: totalPortions важливіший за portionQuantity-залишок). */
export function resolveHistoryItemQuantity(it: any): number {
  const totalPortions = Number(it?.totalPortions);
  if (Number.isFinite(totalPortions) && totalPortions > 0) return totalPortions;

  const direct = Number(it?.quantity ?? it?.qty ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const portionQty = Number(it?.portionQuantity ?? 0);
  const boxes = Number(it?.boxQuantity ?? 0);
  const ppb = Number(it?.portionsPerBox ?? it?.portions_per_box ?? 0);
  if (boxes > 0 && ppb > 0) return boxes * ppb + portionQty;
  if (portionQty > 0) return portionQty;

  const dilovodQty = parseFloat(String(it?.qty ?? ''));
  if (Number.isFinite(dilovodQty) && dilovodQty > 0) return dilovodQty;

  return 0;
}

export function sumHistoryItemsQuantity(items: unknown[]): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    if (item && typeof item === 'object' && 'qty' in item && item.qty != null) {
      return sum + (Number(item.qty) || 0);
    }
    return sum + resolveHistoryItemQuantity(item);
  }, 0);
}

export function normalizeItem(it: any): HistoryItemNormalized {
  const sku = String(it?.sku ?? it?.id ?? it?.set_sku ?? '') || '';
  const name = it?.name ?? it?.productName ?? it?.title ?? null;
  const qty = resolveHistoryItemQuantity(it);
  const { batch, batches, batchLinks, batchId } = readHistoryBatch(it);
  const price = (it?.price !== undefined && it?.price !== null) ? Number(it.price) : null;
  const productId = it?.productId ?? null;
  const dilovodId = it?.dilovodId ?? null;
  return {
    sku,
    name,
    qty,
    batch,
    batches,
    batchLinks,
    batchId,
    price,
    productId,
    dilovodId,
    raw: it,
  };
}

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
  return { setSku, setName, setQty, components, componentsTotal, componentsQuantityMode, raw: setItem };
}

export function normalizeItemsArray(raw: any): HistoryItemNormalized[] {
  const arr = safeParseItems(raw);
  return arr.map(normalizeItem);
}

export function normalizeSetsArray(raw: any): HistorySetNormalized[] {
  const arr = safeParseItems(raw);
  return arr.map(normalizeSet);
}
