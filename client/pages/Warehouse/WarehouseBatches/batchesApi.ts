import type {
  WarehouseBatchKind,
  WarehouseBatchNegativeMode,
  WarehouseBatchesListResponse,
} from './WarehouseBatchesTypes';
import { WAREHOUSE_BATCH_DEFAULT_KINDS } from '@shared/types/warehouse';

export interface FetchWarehouseBatchesParams {
  onlyWithStock: boolean;
  negativeMode: WarehouseBatchNegativeMode;
  batchKinds: WarehouseBatchKind[];
  /** Обхід серверного in-memory кешу (5 хв) — свіжі залишки та ШК з БД. */
  force?: boolean;
}

export async function fetchWarehouseBatches(
  params: FetchWarehouseBatchesParams,
): Promise<WarehouseBatchesListResponse> {
  const kinds = params.batchKinds.length > 0
    ? params.batchKinds
    : WAREHOUSE_BATCH_DEFAULT_KINDS;

  const query = new URLSearchParams({
    onlyWithStock: params.onlyWithStock ? 'true' : 'false',
    negativeMode: params.negativeMode,
    batchKinds: kinds.join(','),
    // Повний зріз для клієнтських фільтрів (серверний кеш і так тримає повний список).
    limit: '5000',
  });
  if (params.force) {
    query.set('force', 'true');
  }

  const response = await fetch(`/api/warehouse/batches?${query.toString()}`, {
    credentials: 'include',
  });

  const data = (await response.json().catch(() => ({}))) as WarehouseBatchesListResponse & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Не вдалося завантажити партії');
  }

  return {
    success: Boolean(data.success),
    data: Array.isArray(data.data) ? data.data : [],
    meta: data.meta ?? {
      total: Array.isArray(data.data) ? data.data.length : 0,
      onlyWithStock: params.onlyWithStock,
      negativeMode: params.negativeMode,
      batchKinds: kinds,
      limit: 500,
    },
  };
}
