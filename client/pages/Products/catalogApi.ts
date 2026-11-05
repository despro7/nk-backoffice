import type {
  CatalogDilovodPreviewResult,
  CatalogDilovodPullApplyField,
} from '@shared/types/catalog';
import type { AuditLogPageDto } from '@shared/types/audit';
import type { CatalogGoodAuditLogDto } from '@shared/types/catalogAudit';
import type {
  CatalogSpecDraftInput,
  CatalogSpecDraftListItem,
  CatalogSpecStateDto,
  CatalogSpecVersionDto,
} from '@shared/types/catalogSpec';

/** Помилка API з кодом (напр. SPEC_DRAFT_STALE). */
export class CatalogApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'CatalogApiError';
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new CatalogApiError(data.error || `HTTP ${res.status}`, res.status, data.code);
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

  async fetchSpecState(goodId: string): Promise<CatalogSpecStateDto> {
    const res = await fetch(`/api/catalog/goods/${encodeURIComponent(goodId)}/spec`, { credentials: 'include' });
    return parseJson(res);
  },

  async fetchSpecDrafts(): Promise<CatalogSpecDraftListItem[]> {
    const res = await fetch('/api/catalog/spec-drafts', { credentials: 'include' });
    return parseJson(res);
  },

  async fetchSpecVersions(goodId: string): Promise<CatalogSpecVersionDto[]> {
    const res = await fetch(`/api/catalog/goods/${encodeURIComponent(goodId)}/spec-versions`, {
      credentials: 'include',
    });
    return parseJson(res);
  },

  async saveSpecDraft(goodId: string, input: CatalogSpecDraftInput): Promise<CatalogSpecStateDto> {
    return specPost(goodId, 'spec-draft', input, 'PUT');
  },

  async discardSpecDraft(goodId: string): Promise<CatalogSpecStateDto> {
    return specPost(goodId, 'spec-draft', undefined, 'DELETE');
  },

  async approveSpecDraft(goodId: string, force = false): Promise<CatalogSpecStateDto> {
    return specPost(goodId, 'spec-draft/approve', { force });
  },

  async rejectSpecDraft(goodId: string, reason: string): Promise<CatalogSpecStateDto> {
    return specPost(goodId, 'spec-draft/reject', { reason });
  },

  async restoreSpecVersion(goodId: string, version: number, comment: string): Promise<CatalogSpecStateDto> {
    return specPost(goodId, `spec-versions/${version}/restore`, { comment });
  },

  async ackSpecContentReview(goodId: string): Promise<CatalogSpecStateDto> {
    return specPost(goodId, 'spec/content-reviewed', {});
  },
};

async function specPost<T>(goodId: string, path: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(`/api/catalog/goods/${encodeURIComponent(goodId)}/${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parseJson(res);
}

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

