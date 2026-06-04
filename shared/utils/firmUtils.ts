export type DilovodDirectories = {
  firms?: Array<{ id: string; name?: string }>;
  [key: string]: any;
};

function normalizeId(id: any): string | null {
  if (id == null) return null;
  const s = String(id).trim();
  return s === '' ? null : s;
}

export function findFirmNameInList(firmId: any, firms?: Array<{ id: string; name?: string }>): string | null {
  const id = normalizeId(firmId);
  if (!id || !Array.isArray(firms)) return null;
  const f = firms.find((x) => String(x.id) === id || (x.id && String(x.id).trim() === id));
  return f ? (f.name || String(f.id)) : null;
}

// Global cache holder for client-side directories (optional)
declare global {
  interface Window { __DILOVOD_DIRECTORIES__?: DilovodDirectories }
}

export function setDilovodDirectories(dirs: DilovodDirectories | null) {
  if (typeof window !== 'undefined') {
    (window as any).__DILOVOD_DIRECTORIES__ = dirs || undefined;
  }
}

export function getDilovodDirectories(): DilovodDirectories | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as any).__DILOVOD_DIRECTORIES__ as DilovodDirectories | undefined;
}

export function getFirmDisplayName(firmId: any, firmName?: any): string | null {
  // Prefer explicit firmName when provided
  if (firmName && String(firmName).trim() !== '') return String(firmName);
  const id = normalizeId(firmId);
  if (!id) return null;
  // Try lookup in cached directories if available (client-side)
  const dirs = getDilovodDirectories();
  const nameFromList = dirs ? findFirmNameInList(id, dirs.firms) : null;
  if (nameFromList) return nameFromList;
  // Fallback to returning the raw id string
  return id;
}

export default getFirmDisplayName;
