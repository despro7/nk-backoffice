import type { WarehouseDocumentEditContextResponse } from '@shared/types/warehouseDocumentEdit';

export async function fetchWarehouseDocumentEditContext(
  dilovodDocumentId: string,
  documentLabel: string,
  documentTypeId?: string,
): Promise<WarehouseDocumentEditContextResponse> {
  const params = new URLSearchParams();
  if (documentLabel) params.set('documentLabel', documentLabel);
  if (documentTypeId) params.set('documentTypeId', documentTypeId);

  const qs = params.toString();
  const url = `/api/warehouse/document-edit/${encodeURIComponent(dilovodDocumentId)}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { credentials: 'include' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || 'Не вдалося завантажити документ');
  }
  return json.data as WarehouseDocumentEditContextResponse;
}
