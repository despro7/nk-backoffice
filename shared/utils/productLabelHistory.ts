import type { ProductLabelPayloadV2 } from '../types/labelTemplate.js';
import type { ProductLabelDraftDto, ProductLabelPublishedDto } from '../types/productLabel.js';

export const PRODUCT_LABEL_DRAFT_SELECTION_KEY = 'draft';

/** Порівняння змісту для «чернетка = останній PDF». */
export function productLabelPayloadInputsKey(payload: ProductLabelPayloadV2): string {
  return JSON.stringify(payload.inputs);
}

export function productLabelDraftMatchesPublished(
  draft: ProductLabelDraftDto,
  published: ProductLabelPublishedDto,
): boolean {
  return productLabelPayloadInputsKey(draft.payload) === productLabelPayloadInputsKey(published.payload);
}

export type ProductLabelHistoryEntry =
  | ({ entryType: 'draft' } & ProductLabelDraftDto)
  | ({ entryType: 'published' } & ProductLabelPublishedDto);

export function productLabelHistorySelectionKey(entry: ProductLabelHistoryEntry): string {
  return entry.entryType === 'draft' ? PRODUCT_LABEL_DRAFT_SELECTION_KEY : String(entry.id);
}

function formatAuthorName(
  userId: number | null | undefined,
  userName: string | null | undefined,
): string {
  if (userName?.trim()) return userName.trim();
  if (userId != null) return `користувач #${userId}`;
  return '';
}

function formatUkDateTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA');
}

/** Підпис у списку версій. */
export function formatProductLabelHistoryOption(entry: ProductLabelHistoryEntry): string {
  if (entry.entryType === 'draft') {
    const author = formatAuthorName(entry.updatedBy, entry.updatedByName);
    const when = formatUkDateTime(entry.updatedAt);
    return author ? `Чернетка · ${when} · ${author}` : `Чернетка · ${when}`;
  }
  const author = formatAuthorName(entry.publishedBy, entry.publishedByName);
  const when = formatUkDateTime(entry.publishedAt);
  const head = `v${entry.version} · ${when}`;
  return author ? `${head} · ${author}` : head;
}

/** Підпис під превʼю. */
export function formatProductLabelHistoryCaption(entry: ProductLabelHistoryEntry): string {
  const batch = entry.batchNumber;
  if (entry.entryType === 'draft') {
    const author = formatAuthorName(entry.updatedBy, entry.updatedByName);
    const when = formatUkDateTime(entry.updatedAt);
    const verb = `Збережено ${when}`;
    const tail = author ? ` · ${author}` : '';
    return `${verb}${tail} · партія ${batch}`;
  }
  const author = formatAuthorName(entry.publishedBy, entry.publishedByName);
  const when = formatUkDateTime(entry.publishedAt);
  const verb = `Згенеровано ${when}`;
  const tail = author ? ` · ${author}` : '';
  return `${verb}${tail} · партія ${batch}`;
}
