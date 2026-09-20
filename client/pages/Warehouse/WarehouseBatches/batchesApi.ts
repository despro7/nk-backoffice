import type { WarehouseBatchesListResponse } from './WarehouseBatchesTypes';

export async function fetchWarehouseBatches(
  onlyWithStock: boolean,
): Promise<WarehouseBatchesListResponse> {
  const params = new URLSearchParams({
    onlyWithStock: onlyWithStock ? 'true' : 'false',
    limit: '500',
  });

  const response = await fetch(`/api/warehouse/batches?${params.toString()}`, {
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
      onlyWithStock,
      limit: 500,
    },
  };
}
