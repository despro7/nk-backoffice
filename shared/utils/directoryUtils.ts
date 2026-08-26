export type DilovodDirectories = {
  firms?: Array<{ id: string; name?: string }>;
  storages?: Array<{ id: string; name?: string }>;
  [key: string]: any;
};

function normalizeId(id: any): string | null {
  if (id == null) return null;
  const s = String(id).trim();
  return s === '' ? null : s;
}

function normalizeForCompare(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s.toLowerCase();
}

export function findFirmNameInList(firmId: any, firms?: Array<{ id: string; name?: string }>): string | null {
  const idNorm = normalizeForCompare(firmId);
  if (!idNorm || !Array.isArray(firms)) return null;

  const f = firms.find((x) => {
    const xid = normalizeForCompare(x.id);
    return xid === idNorm;
  });

  return f ? (f.name || String(f.id)) : null;
}

export function findStorageNameInList(storageId: any, storages?: Array<{ id: string; name?: string }>): string | null {
  const idNorm = normalizeForCompare(storageId);
  if (!idNorm || !Array.isArray(storages)) return null;

  const s = storages.find((x) => {
    const xid = normalizeForCompare(x.id);
    return xid === idNorm;
  });

  return s ? (s.name || String(s.id)) : null;
}

export function getFirmDisplayName(firmId: any, firmName?: any, dirsParam?: DilovodDirectories | null): string | null {
  // Prefer explicit firmName when provided
  if (firmName && String(firmName).trim() !== '') return String(firmName);
  const id = normalizeId(firmId);

  if (!id) return null;
  // Try lookup in provided directories only (no global shim)
  const dirs = dirsParam ?? null;
  const nameFromList = dirs ? findFirmNameInList(id, dirs.firms) : null;
  if (nameFromList) return nameFromList;
  // Fallback to returning the raw id string
  return id;
}

export function getStorageDisplayName(storageId: any, storageName?: any, dirsParam?: DilovodDirectories | null): string | null {
  if (storageName && String(storageName).trim() !== '') return String(storageName);
  const id = normalizeId(storageId);
  if (!id) return null;
  const dirs = dirsParam ?? null;
  const nameFromList = dirs ? findStorageNameInList(id, dirs.storages) : null;
  if (nameFromList) return nameFromList;
  return id;
}

export type DilovodDictItem = {
  id?: string;
  name?: string;
  id__pr?: string;
  code?: string;
  parent__pr?: string;
};

export function getDilovodItemLabel(item?: DilovodDictItem | null): string {
  if (!item) return '';
  const label = item.id__pr || item.name || item.code || item.id;
  return label ? String(label) : '';
}

export function findDilovodItemLabel(
  id: unknown,
  items?: DilovodDictItem[] | null,
): string {
  const idNorm = normalizeForCompare(id);
  if (!idNorm) return '';
  if (!Array.isArray(items) || items.length === 0) return String(id);
  const found = items.find((x) => normalizeForCompare(x.id) === idNorm);
  return found ? (getDilovodItemLabel(found) || String(id)) : String(id);
}

export default getFirmDisplayName;
