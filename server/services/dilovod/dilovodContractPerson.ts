/**
 * Помилка Dilovod, коли контрагент документа не збігається з контрагентом договору (saleOrder):
 * `%contract% зареєстровано на %person%|<contractId>|<personId>`.
 * personId: контрагент, на якого зареєстровано договір (поточний у saleOrder).
 */
export interface ContractPersonMismatch {
  contractId: string;
  personId: string;
}

const CONTRACT_PERSON_MISMATCH_RE = /%contract%[^|]*%person%\s*\|\s*(\d+)\s*\|\s*(\d+)/;

export function parseContractPersonMismatch(error: unknown): ContractPersonMismatch | null {
  if (error == null) return null;
  const text = typeof error === 'string' ? error : JSON.stringify(error);
  const match = CONTRACT_PERSON_MISMATCH_RE.exec(text);
  if (!match) return null;
  return { contractId: match[1], personId: match[2] };
}

/** id з посилання Dilovod: рядок або `{ id, pr }`. '0' і порожнє: null. */
export function dilovodRefId(ref: unknown): string | null {
  const raw = typeof ref === 'object' && ref !== null ? (ref as { id?: unknown }).id : ref;
  if (raw == null) return null;
  const id = String(raw).trim();
  return id && id !== '0' ? id : null;
}
