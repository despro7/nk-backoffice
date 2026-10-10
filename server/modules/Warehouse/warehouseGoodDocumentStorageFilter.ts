/** Склади для історії списань/оприбуткувань і sync з Dilovod (лише ці ID). */
export const GOOD_DOCUMENT_ALLOWED_STORAGE_IDS = [
  '1100700000001005', // Склад готової продукції
  '1100700000001019', // Малий склад
] as const;

export function getGoodDocumentAllowedStorageIdSet(): Set<string> {
  return new Set(GOOD_DOCUMENT_ALLOWED_STORAGE_IDS);
}

export async function getAllowedGoodDocumentStorageIds(): Promise<string[]> {
  return [...GOOD_DOCUMENT_ALLOWED_STORAGE_IDS];
}

export function storageIdAllowed(storageId: unknown, allowed: Set<string>): boolean {
  const id = String(storageId ?? '').trim();
  if (!id) return false;
  return allowed.has(id);
}
