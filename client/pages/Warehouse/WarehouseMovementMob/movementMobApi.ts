import type { WarehouseProductByBarcodeResponse } from '@shared/types/warehouse';
import type { MovementMobApiRecord, MovementMobProductByBarcode } from './WarehouseMovementMobTypes';
import type { MovementMobRawItem } from './WarehouseMovementMobTypes';

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
    batchId: payload.batchId ? String(payload.batchId) : null,
    batchNumber: payload.batchNumber ? String(payload.batchNumber) : null,
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

export async function fetchBatchFallback(
  apiCall: ApiCall,
  sku: string,
  sourceStorageId: string,
): Promise<{ batchId: string; batchNumber: string } | null> {
  const url = new URL(`/api/warehouse/batch-numbers/${encodeURIComponent(sku)}`, window.location.origin);
  if (sourceStorageId) {
    url.searchParams.set('storageId', sourceStorageId);
  }

  const response = await apiCall(url.pathname + url.search);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as BatchNumbersResponse | null;
  if (!data || data.success === false) {
    return null;
  }

  const fetchedBatches = [...(data.batches ?? [])]
    .filter((batch) => String(batch.batchId ?? '').trim().length > 0)
    .sort((a, b) => (Number(b.quantity) || 0) - (Number(a.quantity) || 0));

  const picked = fetchedBatches[0];
  if (!picked) {
    return null;
  }

  const batchId = String(picked.batchId).trim();
  const batchNumber = String(picked.batchNumber ?? picked.batchId ?? '').trim();
  if (!batchId) {
    return null;
  }

  return { batchId, batchNumber: batchNumber || batchId };
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
