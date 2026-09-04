import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProductDrawer } from '@/pages/Products/components/productDrawer/ProductDrawer';
import type {
  CatalogDictionariesDto,
  CatalogGoodDetailDto,
  CatalogUpdateGoodInput,
} from '@/pages/Products/ProductsTypes';
import { ToastService } from '@/services/ToastService';

async function catalogFetch<T>(url: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.data as T;
}

interface MovementMobProductEditDrawerProps {
  catalogGoodId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function MovementMobProductEditDrawer({
  catalogGoodId,
  open,
  onClose,
  onSaved,
}: MovementMobProductEditDrawerProps) {
  const queryClient = useQueryClient();
  const goodId = open ? catalogGoodId : null;

  const dictionariesQuery = useQuery({
    queryKey: ['catalog', 'dictionaries'],
    queryFn: () => catalogFetch<CatalogDictionariesDto>('/api/catalog/dictionaries'),
    staleTime: 30 * 60_000,
    enabled: open,
  });

  const detailQuery = useQuery({
    queryKey: ['catalog', 'good', goodId, 'movement-mob'],
    queryFn: () => catalogFetch<CatalogGoodDetailDto>(`/api/catalog/goods/${goodId}`),
    enabled: Boolean(goodId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: CatalogUpdateGoodInput;
      keepOpen?: boolean;
    }) =>
      catalogFetch<CatalogGoodDetailDto>(`/api/catalog/goods/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (data, variables) => {
      ToastService.show({
        title: 'Збережено',
        description: `«${data.name}» оновлено в Dilovod`,
        color: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-line-enrichment'] });
      if (!variables.keepOpen) {
        onSaved?.();
        onClose();
      }
    },
    onError: (err: Error) => {
      ToastService.show({ title: 'Помилка збереження', description: err.message, color: 'danger' });
    },
  });

  const catalogSearch = useCallback(async (q: string) => {
    const params = new URLSearchParams({ q });
    const res = await fetch(`/api/catalog/search?${params.toString()}`, {
      credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok || json?.success === false) return [];
    return (json.data || [])
      .filter((row: { isGroup?: boolean }) => !row.isGroup)
      .map((row: { id: string; name: string; sku: string | null; weight?: number | null; accPolicyId?: string | null }) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        weight: row.weight ?? null,
        accPolicyId: row.accPolicyId ?? null,
      }));
  }, []);

  if (!open || !goodId) {
    return null;
  }

  return (
    <ProductDrawer
      mode="edit"
      parentFolderId=""
      detail={detailQuery.data ?? null}
      detailLoading={detailQuery.isLoading}
      dictionaries={dictionariesQuery.data ?? { units: [], priceTypes: [], accPolicies: [], currencies: [] }}
      saving={updateMutation.isPending}
      onClose={onClose}
      onCreate={async () => undefined}
      onUpdate={(id, input, opts) => updateMutation.mutateAsync({ id, input, keepOpen: opts?.keepOpen })}
      catalogSearch={catalogSearch}
    />
  );
}
