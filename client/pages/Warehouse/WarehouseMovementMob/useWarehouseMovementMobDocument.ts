import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { useApi } from '@/hooks/useApi';
import type {
  MovementMobApiRecord,
  MovementMobDocumentViewModel,
  MovementMobProductMeta,
} from './WarehouseMovementMobTypes';
import { parseMovementItems, sentChronologyTitle, toDocumentViewModel } from './WarehouseMovementMobUtils';

interface ProductsBatchResponse {
  products: Array<{
    sku: string;
    weight?: number | null;
    portionsPerBox?: number | null;
  }>;
}

async function fetchProductMetaBySkus(
  apiCall: (url: string, options?: RequestInit) => Promise<Response>,
  skus: string[],
): Promise<Record<string, MovementMobProductMeta>> {
  if (skus.length === 0) return {};

  const params = new URLSearchParams({
    skus: skus.join(','),
    fields: 'weight,portionsPerBox,name',
  });

  const response = await apiCall(`/api/products/batch?${params.toString()}`);
  if (!response.ok) {
    return {};
  }

  const data = (await response.json()) as ProductsBatchResponse;
  const map: Record<string, MovementMobProductMeta> = {};
  for (const product of data.products ?? []) {
    map[product.sku] = {
      weight: product.weight ?? null,
      portionsPerBox: product.portionsPerBox ?? null,
    };
  }
  return map;
}

export function useWarehouseMovementMobDocument(id: number | null) {
  const { apiCall } = useApi();
  const dirsCtx = useDilovodDirectories();
  const destNameById = useMemo(() => {
    const src = Array.isArray(dirsCtx.directories?.storages) ? dirsCtx.directories!.storages : [];
    return new Map((src || []).map((s: { id: string | number; name?: string }) => [String(s.id), s.name ?? '']));
  }, [dirsCtx.directories]);

  const query = useQuery({
    queryKey: ['warehouse-movement-mob-document', id],
    enabled: id != null && Number.isFinite(id) && id > 0,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<MovementMobDocumentViewModel> => {
      const response = await apiCall(`/api/warehouse/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Документ не знайдено');
        }
        throw new Error('Не вдалося завантажити документ');
      }

      const record = (await response.json()) as MovementMobApiRecord;
      const items = parseMovementItems(record.items);
      const skus = [...new Set(items.map((item) => item.sku).filter(Boolean))];
      const metaBySku = await fetchProductMetaBySkus(apiCall, skus);
      const destName = destNameById.get(String(record.destinationWarehouse)) || null;
      return toDocumentViewModel(record, metaBySku, destName);
    },
  });

  const document = useMemo(() => {
    const data = query.data ?? null;
    if (!data) return null;
    const destName = destNameById.get(data.destStorageId)?.trim();
    if (!destName) return data;
    return {
      ...data,
      chronology: data.chronology.map((event) => (
        event.key === 'sent'
          ? { ...event, title: sentChronologyTitle(destName) }
          : event
      )),
    };
  }, [destNameById, query.data]);

  return {
    document,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
