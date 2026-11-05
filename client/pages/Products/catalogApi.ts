import type {
  CatalogDilovodPreviewResult,
  CatalogDilovodPullApplyField,
} from '@shared/types/catalog';
import type { AuditLogPageDto } from '@shared/types/audit';
import type { CatalogGoodAuditLogDto } from '@shared/types/catalogAudit';

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

  async fetchGoodAudit(goodId: string, cursor?: number | null): Promise<AuditLogPageDto<CatalogGoodAuditLogDto>> {
    const qs = new URLSearchParams({ limit: '50' });
    if (cursor) qs.set('cursor', String(cursor));
    const res = await fetch(`/api/catalog/goods/${encodeURIComponent(goodId)}/audit?${qs}`, {
      credentials: 'include',
    });
    return parseJson(res);
  },

  async fetchAudit(
    filters: CatalogAuditFilters,
    cursor?: number | null,
  ): Promise<AuditLogPageDto<CatalogGoodAuditLogDto>> {
    const qs = new URLSearchParams({ limit: '50' });
    if (cursor) qs.set('cursor', String(cursor));
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
    }
    const res = await fetch(`/api/catalog/audit?${qs}`, { credentials: 'include' });
    return parseJson(res);
  },

  async fetchAuditUsers(): Promise<Array<{ id: number; name: string }>> {
    const res = await fetch('/api/catalog/audit/users', { credentials: 'include' });
    return parseJson(res);
  },
};

export interface CatalogAuditFilters {
  goodId?: string;
  /** Пошук товару за назвою або артикулом */
  q?: string;
  userId?: number;
  action?: string;
  source?: string;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
}

