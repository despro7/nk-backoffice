import type { GoodMovingDocument, GoodMovingDocumentDetails } from '@shared/types/movement';

function dilovodRefId(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const obj = value as { id?: string | number };
    if (obj.id != null) return String(obj.id).trim();
  }
  return String(value).trim();
}

function dilovodRefPr(value: unknown): string | undefined {
  if (value == null || typeof value !== 'object') return undefined;
  const obj = value as { pr?: string };
  return obj.pr?.trim() || undefined;
}

function headerField(header: Record<string, unknown>, key: string): unknown {
  if (header[key] !== undefined) return header[key];
  const nested = header.id as { id?: string } | undefined;
  if (key === 'id' && nested?.id) return nested.id;
  return undefined;
}

/**
 * Збирає GoodMovingDocument з відповіді GET /api/warehouse/details/:id (Dilovod getObject).
 */
export function goodMovingDocumentFromDetails(
  dilovodDocumentId: string,
  details: GoodMovingDocumentDetails,
): GoodMovingDocument {
  const header = (details.header ?? {}) as Record<string, unknown>;

  const storageRaw = header.storage;
  const storageToRaw = header.storageTo;
  const firmRaw = header.firm;
  const authorRaw = header.author;

  const number = String(header.number ?? headerField(header, 'number') ?? '').trim();
  const date = String(header.date ?? '').trim();
  const remark = String(header.remark ?? '').trim();

  return {
    id: dilovodRefId(header.id) || dilovodDocumentId,
    number,
    date,
    remark,
    storage: dilovodRefId(storageRaw),
    storageTo: dilovodRefId(storageToRaw),
    firm: dilovodRefId(firmRaw),
    author: dilovodRefId(authorRaw),
    storage__pr: dilovodRefPr(storageRaw),
    storageTo__pr: dilovodRefPr(storageToRaw),
    firm__pr: dilovodRefPr(firmRaw),
    author__pr: dilovodRefPr(authorRaw),
    details,
  };
}
