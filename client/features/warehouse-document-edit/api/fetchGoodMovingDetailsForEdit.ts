import type { GoodMovingDocumentDetails } from '@shared/types/movement';

export async function fetchGoodMovingDetailsForEdit(
  dilovodDocumentId: string,
): Promise<GoodMovingDocumentDetails> {
  const url = `/api/warehouse/details/${encodeURIComponent(dilovodDocumentId)}?forEdit=true`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.error === 'string' ? body.error : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as GoodMovingDocumentDetails;
}
