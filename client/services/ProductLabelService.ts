import type {
  ProductLabelDraftDto,
  ProductLabelKind,
  ProductLabelPublishedDto,
} from '@shared/types/productLabel';
import type { ProductLabelHistoryEntry } from '@shared/utils/productLabelHistory';
import type { ProductLabelPayloadV2, ResolvedLabelTemplateDto } from '@shared/types/labelTemplate';
import type { LabelPdfmeTemplate } from '@shared/types/labelTemplate';

type ApiResult<T> = { success: boolean; data?: T; error?: string };

async function parseJson<T>(res: Response): Promise<ApiResult<T>> {
  const body = (await res.json()) as ApiResult<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

export class ProductLabelService {
  static async getLatestDraft(
    goodId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelDraftDto | null> {
    const url = new URL(
      `/api/products/${encodeURIComponent(goodId)}/labels/draft/latest`,
      window.location.origin,
    );
    url.searchParams.set('labelKind', labelKind);
    const res = await fetch(url.toString(), { credentials: 'include' });
    const body = await parseJson<ProductLabelDraftDto | null>(res);
    return body.data ?? null;
  }

  static async getDraft(
    goodId: string,
    batchId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelDraftDto | null> {
    const url = new URL(
      `/api/products/${encodeURIComponent(goodId)}/labels/draft`,
      window.location.origin,
    );
    url.searchParams.set('batchId', batchId);
    url.searchParams.set('labelKind', labelKind);
    const res = await fetch(url.toString(), { credentials: 'include' });
    const body = await parseJson<ProductLabelDraftDto | null>(res);
    return body.data ?? null;
  }

  static async saveDraft(
    goodId: string,
    input: {
      batchId: string;
      labelKind: ProductLabelKind;
      batchNumber: string;
      payload: ProductLabelPayloadV2;
    },
  ): Promise<ProductLabelDraftDto> {
    const res = await fetch(`/api/products/${encodeURIComponent(goodId)}/labels/draft`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = await parseJson<ProductLabelDraftDto>(res);
    return body.data!;
  }

  static async getLatestPublished(
    goodId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelPublishedDto | null> {
    const url = new URL(
      `/api/products/${encodeURIComponent(goodId)}/labels/published/latest`,
      window.location.origin,
    );
    url.searchParams.set('labelKind', labelKind);
    const res = await fetch(url.toString(), { credentials: 'include' });
    const body = await parseJson<ProductLabelPublishedDto | null>(res);
    return body.data ?? null;
  }

  static async deletePublished(goodId: string, labelId: number): Promise<void> {
    const res = await fetch(
      `/api/products/${encodeURIComponent(goodId)}/labels/published/${labelId}`,
      { method: 'DELETE', credentials: 'include' },
    );
    await parseJson<null>(res);
  }

  static async deleteDraft(
    goodId: string,
    batchId: string,
    labelKind: ProductLabelKind,
  ): Promise<void> {
    const url = new URL(
      `/api/products/${encodeURIComponent(goodId)}/labels/draft`,
      window.location.origin,
    );
    url.searchParams.set('batchId', batchId);
    url.searchParams.set('labelKind', labelKind);
    const res = await fetch(url.toString(), { method: 'DELETE', credentials: 'include' });
    await parseJson<null>(res);
  }

  static async listHistory(
    goodId: string,
    batchId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelHistoryEntry[]> {
    const url = new URL(
      `/api/products/${encodeURIComponent(goodId)}/labels/history`,
      window.location.origin,
    );
    url.searchParams.set('batchId', batchId);
    url.searchParams.set('labelKind', labelKind);
    const res = await fetch(url.toString(), { credentials: 'include' });
    const body = await parseJson<ProductLabelHistoryEntry[]>(res);
    return body.data ?? [];
  }

  static async listPublished(
    goodId: string,
    batchId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelPublishedDto[]> {
    const url = new URL(
      `/api/products/${encodeURIComponent(goodId)}/labels/published`,
      window.location.origin,
    );
    url.searchParams.set('batchId', batchId);
    url.searchParams.set('labelKind', labelKind);
    const res = await fetch(url.toString(), { credentials: 'include' });
    const body = await parseJson<ProductLabelPublishedDto[]>(res);
    return body.data ?? [];
  }

  static pdfUrl(goodId: string, labelId: number): string {
    return `/api/products/${encodeURIComponent(goodId)}/labels/published/${labelId}/pdf`;
  }

  static async generatePublished(
    goodId: string,
    input: {
      payload: ProductLabelPayloadV2;
      batchId: string;
      batchNumber: string;
      labelKind: ProductLabelKind;
    },
  ): Promise<ProductLabelPublishedDto> {
    const res = await fetch(
      `/api/products/${encodeURIComponent(goodId)}/labels/published/generate`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    const body = await parseJson<ProductLabelPublishedDto>(res);
    return body.data!;
  }

  static async resolveTemplate(
    goodId: string,
    labelKind: ProductLabelKind,
  ): Promise<ResolvedLabelTemplateDto & { template: LabelPdfmeTemplate | null }> {
    const url = new URL(
      `/api/products/${encodeURIComponent(goodId)}/labels/resolve-template`,
      window.location.origin,
    );
    url.searchParams.set('labelKind', labelKind);
    const res = await fetch(url.toString(), { credentials: 'include' });
    const body = await parseJson<ResolvedLabelTemplateDto & { template: LabelPdfmeTemplate | null }>(res);
    return body.data!;
  }

  static async setTemplateOverride(
    goodId: string,
    labelKind: ProductLabelKind,
    templateId: string | null,
  ): Promise<void> {
    const res = await fetch(`/api/products/${encodeURIComponent(goodId)}/labels/template`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labelKind, templateId }),
    });
    await parseJson<unknown>(res);
  }

  static async seedDraft(
    goodId: string,
    input: {
      batchId: string;
      labelKind: ProductLabelKind;
      batchNumber: string;
      expiration?: string | null;
    },
  ): Promise<ProductLabelDraftDto> {
    const res = await fetch(`/api/products/${encodeURIComponent(goodId)}/labels/seed`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = await parseJson<ProductLabelDraftDto>(res);
    return body.data!;
  }

  static async fetchPdfBase64(goodId: string, labelId: number): Promise<string> {
    const res = await fetch(ProductLabelService.pdfUrl(goodId, labelId), {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
