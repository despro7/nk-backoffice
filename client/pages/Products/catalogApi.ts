import type {
  CatalogDilovodPreviewResult,
  CatalogDilovodPullApplyField,
} from '@shared/types/catalog';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.data as T;
}

export const catalogApi = {
  async fetchDilovodPreview(goodId: string): Promise<CatalogDilovodPreviewResult> {
    const res = await fetch(`/api/catalog/goods/${encodeURIComponent(goodId)}/dilovod-preview`, {
      credentials: 'include',
    });
    return parseJson(res);
  },

  async applyDilovodPull(
    goodId: string,
    input: { applyAll?: boolean; fields?: CatalogDilovodPullApplyField[] },
  ): Promise<{ appliedFields: string[] }> {
    const res = await fetch(`/api/catalog/goods/${encodeURIComponent(goodId)}/dilovod-apply`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },
};
