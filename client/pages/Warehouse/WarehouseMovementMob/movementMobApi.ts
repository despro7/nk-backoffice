import type { WarehouseProductByBarcodeResponse } from '@shared/types/warehouse';
import { isUsableDilovodBatchId } from '@shared/utils/dilovodBatchId';
import type { MovementMobApiRecord, MovementMobProductByBarcode } from './WarehouseMovementMobTypes';
import type { MovementMobRawItem } from './WarehouseMovementMobTypes';
import type { MovementMobBatchRow } from './WarehouseMovementMobUtils';
import { batchNumberNeedsResolution, resolveBatchDisplayName } from './WarehouseMovementMobUtils';

type ApiCall = (url: string, options?: RequestInit) => Promise<Response>;

interface ProductByBarcodeApiResponse extends WarehouseProductByBarcodeResponse {
  success?: boolean;
  error?: string;
}

interface StockSnapshotStock {
  selectedStock?: number;
  storages?: Record<string, number>;
}

interface StockSnapshotResponse {
  success?: boolean;
  stocks?: Record<string, StockSnapshotStock>;
}

interface BatchNumbersResponse {
  success?: boolean;
  batches?: Array<{
    batchId?: string;
    batchNumber?: string;
    quantity?: number;
    storage?: string;
  }>;
  error?: string;
}

function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toProductByBarcode(
  payload: WarehouseProductByBarcodeResponse,
  scannedCode: string,
): MovementMobProductByBarcode | null {
  const sku = String(payload.sku ?? '').trim();
  if (!sku) return null;

  return {
    sku,
    name: String(payload.name ?? sku),
    weight: asFiniteNumber(payload.weight),
    portionsPerBox: asFiniteNumber(payload.portionsPerBox) ?? payload.portionsPerBox ?? 0,
    barcode: String(payload.barcode ?? scannedCode),
    barcodeKind: payload.barcodeKind === 'box' ? 'box' : 'portion',
    batchId: isUsableDilovodBatchId(payload.batchId) ? String(payload.batchId) : null,
    batchNumber: payload.batchNumber && payload.batchNumber !== '0'
      ? String(payload.batchNumber)
      : null,
  };
}

export async function fetchProductByBarcode(
  apiCall: ApiCall,
  code: string,
): Promise<MovementMobProductByBarcode | null> {
  const response = await apiCall(
    `/api/warehouse/product-by-barcode?code=${encodeURIComponent(code)}`,
  );

  if (response.status === 404) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as ProductByBarcodeApiResponse | null;
  if (!response.ok || !data || data.success === false) {
    return null;
  }

  return toProductByBarcode(data, code);
}

export async function fetchBatchNumbersBySku(
  apiCall: ApiCall,
  sku: string,
  options?: { sourceStorageId?: string; includeSmallStorage?: boolean; force?: boolean },
): Promise<MovementMobBatchRow[]> {
  const url = new URL(`/api/warehouse/batch-numbers/${encodeURIComponent(sku)}`, window.location.origin);
  if (options?.sourceStorageId) {
    url.searchParams.set('storageId', options.sourceStorageId);
  }
  if (options?.includeSmallStorage) {
    url.searchParams.set('includeSmallStorage', 'true');
  }
  if (options?.force) {
    url.searchParams.set('force', 'true');
  }

  const response = await apiCall(url.pathname + url.search);
  if (!response.ok) {
    return [];
  }

  const data = (await response.json().catch(() => null)) as BatchNumbersResponse | null;
  if (!data || data.success === false) {
    return [];
  }

  return (data.batches ?? [])
    .filter((batch) => isUsableDilovodBatchId(batch.batchId))
    .map((batch) => ({
      batchId: String(batch.batchId).trim(),
      batchNumber: String(batch.batchNumber ?? batch.batchId ?? '').trim(),
      storage: String((batch as { storage?: string }).storage ?? ''),
      quantity: Number(batch.quantity) || 0,
    }));
}

export async function resolveBatchById(
  apiCall: ApiCall,
  sku: string,
  batchId: string,
  sourceStorageId: string,
): Promise<{ batchId: string; batchNumber: string } | null> {
  const id = String(batchId ?? '').trim();
  if (!isUsableDilovodBatchId(id)) {
    return null;
  }

  const batches = await fetchBatchNumbersBySku(apiCall, sku, {
    sourceStorageId,
    includeSmallStorage: true,
  });
  const hit = batches.find((batch) => batch.batchId === id);
  if (!hit) {
    return { batchId: id, batchNumber: id };
  }

  const batchNumber = resolveBatchDisplayName(hit.batchId, hit.batchNumber, batches);
  return { batchId: hit.batchId, batchNumber: batchNumber || hit.batchId };
}

export async function fetchBatchFallback(
  apiCall: ApiCall,
  sku: string,
  sourceStorageId: string,
): Promise<{ batchId: string; batchNumber: string } | null> {
  const batches = await fetchBatchNumbersBySku(apiCall, sku, { sourceStorageId });
  const picked = [...batches].sort((a, b) => b.quantity - a.quantity)[0];
  if (!picked) {
    return null;
  }

  const batchNumber = resolveBatchDisplayName(picked.batchId, picked.batchNumber, batches);
  return { batchId: picked.batchId, batchNumber: batchNumber || picked.batchId };
}

export async function resolveBatchNameForProduct(
  apiCall: ApiCall,
  sku: string,
  batchId: string,
  batchNumber: string,
  sourceStorageId: string,
): Promise<{ batchId: string; batchNumber: string }> {
  const id = String(batchId ?? '').trim();
  const label = String(batchNumber ?? '').trim();

  if (isUsableDilovodBatchId(id) && !batchNumberNeedsResolution(label || id, id)) {
    return { batchId: id, batchNumber: label || id };
  }

  if (isUsableDilovodBatchId(id)) {
    const resolved = await resolveBatchById(apiCall, sku, id, sourceStorageId);
    if (resolved) {
      return resolved;
    }
  }

  const fallback = await fetchBatchFallback(apiCall, sku, sourceStorageId);
  if (fallback) {
    return fallback;
  }

  return { batchId: id, batchNumber: label || id || '—' };
}

async function readStockPortionsFromPost(
  apiCall: ApiCall,
  sku: string,
  storageId: string,
): Promise<number> {
  const response = await apiCall('/api/warehouse/stock-snapshot', {
    method: 'POST',
    body: JSON.stringify({ skus: [sku], storageId }),
  });
  if (!response.ok) return 0;
  const data = (await response.json().catch(() => null)) as StockSnapshotResponse | null;
  const stock = data?.stocks?.[sku];
  return Number(stock?.selectedStock ?? 0) || 0;
}

function portionsFromStoragesMap(
  storages: Record<string, number> | undefined,
  storageId: string,
): number | null {
  if (!storages || !storageId) return null;
  if (!Object.prototype.hasOwnProperty.call(storages, storageId)) return null;
  return Number(storages[storageId] ?? 0) || 0;
}

/**
 * Залишки source/dest: GET /stock-snapshot повертає `storages[storageId]`.
 * Якщо мапи немає — POST з `storageId` і `selectedStock` (не mainStock/smallStock).
 */
export async function fetchMovementMobStocks(
  apiCall: ApiCall,
  sku: string,
  sourceStorageId: string,
  destStorageId: string,
): Promise<{ sourcePortions: number; destPortions: number }> {
  const url = new URL('/api/warehouse/stock-snapshot', window.location.origin);
  url.searchParams.set('skus', sku);
  const getResponse = await apiCall(url.pathname + url.search);

  if (getResponse.ok) {
    const data = (await getResponse.json().catch(() => null)) as StockSnapshotResponse | null;
    const storages = data?.stocks?.[sku]?.storages;
    const sourceFromMap = portionsFromStoragesMap(storages, sourceStorageId);
    const destFromMap = portionsFromStoragesMap(storages, destStorageId);
    if (sourceFromMap != null && destFromMap != null) {
      return { sourcePortions: sourceFromMap, destPortions: destFromMap };
    }
  }

  const [sourcePortions, destPortions] = await Promise.all([
    readStockPortionsFromPost(apiCall, sku, sourceStorageId),
    readStockPortionsFromPost(apiCall, sku, destStorageId),
  ]);

  return { sourcePortions, destPortions };
}

export async function createWarehouseMovementDraft(
  apiCall: ApiCall,
  payload: {
    items: MovementMobRawItem[];
    sourceWarehouse: string;
    destinationWarehouse: string;
  },
): Promise<MovementMobApiRecord> {
  const response = await apiCall('/api/warehouse', {
    method: 'POST',
    body: JSON.stringify({
      items: payload.items,
      sourceWarehouse: payload.sourceWarehouse,
      destinationWarehouse: payload.destinationWarehouse,
      movementDate: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Не вдалося створити чернетку');
  }

  return (await response.json()) as MovementMobApiRecord;
}

export async function submitMovement(
  apiCall: ApiCall,
  id: number,
): Promise<MovementMobApiRecord> {
  const response = await apiCall(`/api/warehouse/${id}/submit`, { method: 'POST' });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Не вдалося відправити документ');
  }
  return (await response.json()) as MovementMobApiRecord;
}

export async function saveReceipt(
  apiCall: ApiCall,
  id: number,
  items: MovementMobRawItem[],
): Promise<MovementMobApiRecord> {
  const response = await apiCall(`/api/warehouse/${id}/receipt`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Не вдалося зберегти прийом');
  }
  return (await response.json()) as MovementMobApiRecord;
}

function parseConfirmReceiptError(err: {
  error?: string;
  errorTitle?: string;
  details?: string[];
}, fallback: string): Error {
  const details = Array.isArray(err.details) ? err.details.filter(Boolean).join(' | ') : '';
  return new Error(
    [err.errorTitle, err.error, details].filter(Boolean).join(' — ') || fallback,
  );
}

export async function confirmReceipt(
  apiCall: ApiCall,
  id: number,
): Promise<MovementMobApiRecord> {
  const response = await apiCall(`/api/warehouse/${id}/confirm-receipt`, { method: 'POST' });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as {
      error?: string;
      errorTitle?: string;
      details?: string[];
    };
    throw parseConfirmReceiptError(err, 'Не вдалося підтвердити отримання');
  }
  return (await response.json()) as MovementMobApiRecord;
}

export async function fetchConfirmReceiptPayload(
  apiCall: ApiCall,
  id: number,
): Promise<Record<string, unknown>> {
  const response = await apiCall(`/api/warehouse/${id}/confirm-receipt`, {
    method: 'POST',
    body: JSON.stringify({ dryRun: true }),
  });
  const data = await response.json().catch(() => ({})) as {
    success?: boolean;
    payload?: Record<string, unknown>;
    error?: string;
    errorTitle?: string;
    details?: string[];
  };
  if (!response.ok || !data.payload) {
    throw parseConfirmReceiptError(data, 'Не вдалося отримати payload');
  }
  return data.payload;
}

export async function syncMovementToDilovod(
  apiCall: ApiCall,
  id: number,
  options?: { dryRun?: boolean },
): Promise<Record<string, unknown> | void> {
  const dryRun = options?.dryRun === true;
  const response = await apiCall(`/api/warehouse/${id}/sync-dilovod`, {
    method: 'POST',
    body: JSON.stringify({ dryRun }),
  });
  const data = await response.json().catch(() => ({})) as {
    success?: boolean;
    payload?: Record<string, unknown>;
    error?: string;
    errorTitle?: string;
    details?: string[];
  };
  if (!response.ok) {
    throw parseConfirmReceiptError(data, dryRun ? 'Не вдалося отримати payload' : 'Не вдалося зберегти в Dilovod');
  }
  if (dryRun) {
    if (!data.payload) {
      throw parseConfirmReceiptError(data, 'Не вдалося отримати payload');
    }
    return data.payload;
  }
}

export async function updateWarehouseMovementDraft(
  apiCall: ApiCall,
  id: number,
  items: MovementMobRawItem[],
): Promise<MovementMobApiRecord> {
  const response = await apiCall(`/api/warehouse/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Не вдалося оновити чернетку');
  }

  return (await response.json()) as MovementMobApiRecord;
}

export async function deleteMovement(
  apiCall: ApiCall,
  id: number,
): Promise<void> {
  const response = await apiCall(`/api/warehouse/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string; errorTitle?: string };
    throw new Error([err.errorTitle, err.error].filter(Boolean).join(' — ') || 'Не вдалося видалити документ');
  }
}
