import { prisma } from '../../lib/utils.js';
import { DilovodApiClient } from '../../services/dilovod/DilovodApiClient.js';
import {
  WAREHOUSE_SURPLUS_DOC_TYPE,
  WAREHOUSE_SURPLUS_HISTORY_LAST_FULL_SYNC_KEY,
  WAREHOUSE_WRITE_OFF_DOC_MODE,
  WAREHOUSE_WRITE_OFF_DOC_TYPE,
  WAREHOUSE_GOOD_DOC_HISTORY_SYNC_DAYS,
  WAREHOUSE_WRITE_OFF_HISTORY_LAST_FULL_SYNC_KEY,
  formatDilovodHistoryFromDateDaysAgo,
  type GoodDocHistoryKind,
} from '../../../shared/types/warehouseGoodDocument.js';
import type { GoodDocHistoryListQuery } from './warehouseGoodDocumentHistoryList.js';
import {
  countGoodDocumentHistory,
  getGoodDocumentHistoryPageDilovodIds,
} from './warehouseGoodDocumentHistoryList.js';
import { mapTpGoodsToHistoryItems, parseLocalDate } from './warehouseGoodDocumentUtils.js';
import { normalizeItemsArray, safeParseItems } from './historyNormalize.js';
import {
  getAllowedGoodDocumentStorageIds,
  getGoodDocumentAllowedStorageIdSet,
  storageIdAllowed,
} from './warehouseGoodDocumentStorageFilter.js';

const CONFIG: Record<
  GoodDocHistoryKind,
  {
    from: string;
    /** Лише goodWriteOff; у goodWriteOn поля docMode немає */
    docMode?: string;
    numberField: 'writeOffNumber' | 'surplusNumber';
    dateField: 'writeOffDate' | 'surplusDate';
    reasonField: 'writeOffReason' | 'surplusReason';
    settingsFromDateKey: string;
    lastFullListSyncKey: string;
  }
> = {
  writeOff: {
    from: WAREHOUSE_WRITE_OFF_DOC_TYPE,
    docMode: WAREHOUSE_WRITE_OFF_DOC_MODE,
    numberField: 'writeOffNumber',
    dateField: 'writeOffDate',
    reasonField: 'writeOffReason',
    settingsFromDateKey: 'writeoff_history_from_date',
    lastFullListSyncKey: WAREHOUSE_WRITE_OFF_HISTORY_LAST_FULL_SYNC_KEY,
  },
  surplus: {
    from: WAREHOUSE_SURPLUS_DOC_TYPE,
    numberField: 'surplusNumber',
    dateField: 'surplusDate',
    reasonField: 'surplusReason',
    settingsFromDateKey: 'surplus_history_from_date',
    lastFullListSyncKey: WAREHOUSE_SURPLUS_HISTORY_LAST_FULL_SYNC_KEY,
  },
};

const DILOVOD_ID_IN_CHUNK_SIZE = 40;

export type GoodDocHistorySyncOptions = {
  fromDate?: string;
  maxDocuments?: number;
  /** Поточна сторінка історії — для точкового оновлення шапок без повного списку */
  listQuery?: GoodDocHistoryListQuery;
  /** Ігнорувати обмеження «1 повний список на день» */
  forceFullList?: boolean;
};

function todayDateKeyKyiv(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

async function getLastFullListSyncDate(kind: GoodDocHistoryKind): Promise<string | null> {
  const key = CONFIG[kind].lastFullListSyncKey;
  try {
    const setting = await prisma.settingsBase.findUnique({ where: { key } });
    const value = setting?.value?.trim();
    return value || null;
  } catch (error) {
    console.warn(`[GoodDocHistorySync] read ${key}:`, error);
    return null;
  }
}

async function markFullListSyncedToday(kind: GoodDocHistoryKind): Promise<void> {
  const key = CONFIG[kind].lastFullListSyncKey;
  const value = todayDateKeyKyiv();
  try {
    await prisma.settingsBase.upsert({
      where: { key },
      create: {
        key,
        value,
        category: 'warehouse',
        description: 'Дата останнього повного списку документів з Dilovod (YYYY-MM-DD, Europe/Kyiv)',
      },
      update: { value },
    });
  } catch (error) {
    console.warn(`[GoodDocHistorySync] write ${key}:`, error);
  }
}

async function shouldRunFullListSync(kind: GoodDocHistoryKind, force: boolean): Promise<boolean> {
  if (force) return true;
  const localCount = await countGoodDocumentHistory(kind, 'active');
  if (localCount === 0) return true;
  const last = await getLastFullListSyncDate(kind);
  if (!last) return true;
  return last < todayDateKeyKyiv();
}

let dilovodClient: DilovodApiClient | null = null;

function getClient(): DilovodApiClient {
  if (!dilovodClient) dilovodClient = new DilovodApiClient();
  return dilovodClient;
}

function normalizeRows(resp: unknown): any[] {
  if (Array.isArray(resp)) return resp;
  if (resp == null) return [];
  if (typeof resp !== 'object') return [];
  const obj = resp as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.result)) return obj.result;
  if (Array.isArray(obj.items)) return obj.items;
  if (Object.keys(obj).length === 0) return [];
  return [resp];
}

function hasStoredItems(raw: string | null | undefined): boolean {
  return safeParseItems(raw).length > 0;
}

function filterDocumentListRows(rows: any[], docMode?: string): any[] {
  return rows.filter((row) => {
    const del = row?.delMark ?? row?.header?.delMark;
    if (del === true || del === 1 || String(del) === '1') return false;
    if (docMode) {
      const mode = String(row?.docMode ?? row?.header?.docMode ?? '').trim();
      if (mode && mode !== docMode) return false;
    }
    return Boolean(row?.id);
  });
}

function listDocumentFields(includeDocMode: boolean) {
  return {
    id: 'id',
    number: 'number',
    date: 'date',
    remark: 'remark',
    storage: 'storage',
    firm: 'firm',
    author: 'author',
    ...(includeDocMode ? { docMode: 'docMode' } : {}),
    delMark: 'delMark',
  };
}

async function fetchDocumentList(
  kind: GoodDocHistoryKind,
  fromDate: string,
  allowedStorageIds: string[],
): Promise<any[]> {
  const client = getClient();
  await client.ensureReady();
  const apiKey = client.getApiKey();
  if (!apiKey) {
    throw new Error('Dilovod API Key не налаштовано');
  }

  if (allowedStorageIds.length === 0) {
    return [];
  }

  const cfg = CONFIG[kind];
  const baseFilters: Array<{ alias: string; operator: string; value: string }> = [
    { alias: 'date', operator: '>', value: fromDate },
  ];
  if (cfg.docMode) {
    baseFilters.push({ alias: 'docMode', operator: '=', value: cfg.docMode });
  }

  // Dilovod не приймає operator IN для storage — окремий паралельний request на кожен склад (=).
  const responses = await Promise.all(
    allowedStorageIds.map((storageId) => client.makeRequest({
      version: '0.25',
      key: apiKey,
      action: 'request',
      params: {
        from: cfg.from,
        fields: listDocumentFields(Boolean(cfg.docMode)),
        filters: [
          ...baseFilters,
          { alias: 'storage', operator: '=', value: storageId },
        ],
      },
    })),
  );

  const seenIds = new Set<string>();
  const merged: any[] = [];

  for (let i = 0; i < responses.length; i += 1) {
    const resp = responses[i];
    const storageId = allowedStorageIds[i];
    if (resp && typeof resp === 'object' && !Array.isArray(resp) && 'error' in resp && resp.error) {
      console.warn(`[GoodDocHistorySync] ${kind} storage ${storageId}:`, resp.error);
      continue;
    }
    const rows = filterDocumentListRows(normalizeRows(resp), cfg.docMode);
    for (const row of rows) {
      const id = String(row.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      merged.push(row);
    }
  }

  return merged;
}

async function fetchDocumentListByIds(kind: GoodDocHistoryKind, docIds: string[]): Promise<any[]> {
  const uniqueIds = [...new Set(docIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const client = getClient();
  await client.ensureReady();
  const apiKey = client.getApiKey();
  if (!apiKey) {
    throw new Error('Dilovod API Key не налаштовано');
  }

  const cfg = CONFIG[kind];
  const allowedStorageIdSet = getGoodDocumentAllowedStorageIdSet();
  const merged: any[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < uniqueIds.length; i += DILOVOD_ID_IN_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + DILOVOD_ID_IN_CHUNK_SIZE);
    const resp = await client.makeRequest({
      version: '0.25',
      key: apiKey,
      action: 'request',
      params: {
        from: cfg.from,
        fields: listDocumentFields(Boolean(cfg.docMode)),
        filters: [{ alias: 'id', operator: 'IN', value: chunk }],
      },
    });

    if (resp && typeof resp === 'object' && !Array.isArray(resp) && 'error' in resp && resp.error) {
      console.warn(`[GoodDocHistorySync] ${kind} by ids chunk:`, resp.error);
      continue;
    }

    const rows = filterDocumentListRows(normalizeRows(resp), cfg.docMode);
    for (const row of rows) {
      if (!storageIdAllowed(row.storage ?? row.header?.storage, allowedStorageIdSet)) {
        continue;
      }
      const id = String(row.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      merged.push(row);
    }
  }

  return merged;
}

async function fetchDocumentDetailsFromDilovod(docId: string): Promise<{ header: any; items: any[] } | null> {
  const client = getClient();
  await client.ensureReady();
  const apiKey = client.getApiKey();
  if (!apiKey) return null;

  const response = await client.makeRequest({
    version: '0.25',
    key: apiKey,
    action: 'getObject',
    params: { id: docId },
  });

  if (!response?.tableParts?.tpGoods) {
    return null;
  }

  const items = await mapTpGoodsToHistoryItems(response.tableParts.tpGoods);
  return {
    header: response.header ?? {},
    items,
  };
}

function parseReasonFromRemark(remark: string | null | undefined): { reason: string; comment: string | null } {
  const raw = String(remark ?? '').trim();
  if (!raw) return { reason: 'Інше', comment: null };
  const pipeParts = raw.split(' | ');
  const main = pipeParts[0] ?? raw;
  const comment = pipeParts.length > 1 ? pipeParts.slice(1).join(' | ') : null;
  const colonIdx = main.indexOf(':');
  if (colonIdx > 0) {
    const tail = main.slice(colonIdx + 1).trim();
    return {
      reason: main.slice(0, colonIdx).trim() || 'Інше',
      comment: comment ?? (tail || null),
    };
  }
  return { reason: main || 'Інше', comment };
}

function buildWriteOffMetadataFromListRow(doc: any, userIdByDilovodId: Map<string, number>) {
  const operDate = parseLocalDate(doc.date ?? doc.header?.date) ?? new Date();
  const remark = String(doc.remark ?? doc.header?.remark ?? '').trim() || null;
  const { reason, comment } = parseReasonFromRemark(remark);
  const createdBy = userIdByDilovodId.get(String(doc.author ?? doc.header?.author ?? '')) ?? 0;
  const docId = String(doc.id);
  const payloadJson = JSON.stringify({ source: 'dilovod-sync', docId });

  return {
    writeOffNumber: docId,
    writeOffDate: operDate,
    writeOffReason: reason,
    docNumber: doc.number ?? doc.header?.number ?? null,
    firmId: doc.firm ?? doc.header?.firm ?? null,
    storageId: doc.storage ?? doc.header?.storage ?? null,
    items: '[]',
    customReason: null,
    comment,
    remark,
    source: 'dilovod' as const,
    status: 'created' as const,
    payload: payloadJson,
    createdBy,
  };
}

function buildSurplusMetadataFromListRow(doc: any, userIdByDilovodId: Map<string, number>) {
  const operDate = parseLocalDate(doc.date ?? doc.header?.date) ?? new Date();
  const remark = String(doc.remark ?? doc.header?.remark ?? '').trim() || null;
  const { reason, comment } = parseReasonFromRemark(remark);
  const createdBy = userIdByDilovodId.get(String(doc.author ?? doc.header?.author ?? '')) ?? 0;
  const docId = String(doc.id);
  const payloadJson = JSON.stringify({ source: 'dilovod-sync', docId });

  return {
    surplusNumber: docId,
    surplusDate: operDate,
    surplusReason: reason,
    docNumber: doc.number ?? doc.header?.number ?? null,
    firmId: doc.firm ?? doc.header?.firm ?? null,
    storageId: doc.storage ?? doc.header?.storage ?? null,
    items: '[]',
    customReason: null,
    comment,
    remark,
    source: 'dilovod' as const,
    status: 'created' as const,
    payload: payloadJson,
    createdBy,
  };
}

export class WarehouseGoodDocumentHistorySync {
  /**
   * Синхронізує лише шапки документів з Dilovod (без getObject).
   * Рядки tpGoods підвантажуються через loadDetails при розгортанні історії.
   */
  static async sync(
    kind: GoodDocHistoryKind,
    options?: GoodDocHistorySyncOptions,
  ): Promise<{ upserted: number; mode: 'fullList' | 'pageHeaders' | 'skipped' }> {
    const cfg = CONFIG[kind];
    const allowedStorageIds = await getAllowedGoodDocumentStorageIds();
    if (allowedStorageIds.length === 0) {
      console.warn(`[GoodDocHistorySync] ${kind}: no allowed storages after filter — skip Dilovod sync`);
      return { upserted: 0, mode: 'skipped' };
    }

    const runFullList = await shouldRunFullListSync(kind, options?.forceFullList === true);
    let syncMode: 'fullList' | 'pageHeaders' = 'fullList';
    let docs: any[];

    if (runFullList) {
      const effectiveFrom =
        options?.fromDate
        ?? formatDilovodHistoryFromDateDaysAgo(WAREHOUSE_GOOD_DOC_HISTORY_SYNC_DAYS);
      docs = await fetchDocumentList(kind, effectiveFrom, allowedStorageIds);
      syncMode = 'fullList';
    } else if (options?.listQuery) {
      const pageIds = await getGoodDocumentHistoryPageDilovodIds(kind, options.listQuery);
      docs = await fetchDocumentListByIds(kind, pageIds);
      syncMode = 'pageHeaders';
    } else {
      console.log(`[GoodDocHistorySync] ${kind}: skip Dilovod (full list already synced today)`);
      return { upserted: 0, mode: 'skipped' };
    }
    docs.sort((a, b) => {
      const da = new Date(a.date ?? a.header?.date ?? 0).getTime();
      const db = new Date(b.date ?? b.header?.date ?? 0).getTime();
      return db - da;
    });

    const maxDocuments = options?.maxDocuments;
    if (maxDocuments != null && maxDocuments > 0) {
      docs = docs.slice(0, maxDocuments);
    }

    const allowedStorageIdSet = getGoodDocumentAllowedStorageIdSet();

    const users = await prisma.user.findMany({
      where: { dilovodUserId: { not: null } },
      select: { id: true, dilovodUserId: true },
    });
    const userIdByDilovodId = new Map(users.map((u) => [u.dilovodUserId as string, u.id]));

    const UPSERT_BATCH_SIZE = 10;
    let upserted = 0;

    const upsertDoc = async (doc: any): Promise<boolean> => {
      const docId = String(doc.id);
      const storageId = doc.storage ?? doc.header?.storage;
      if (!storageIdAllowed(storageId, allowedStorageIdSet)) {
        return false;
      }
      try {
        if (kind === 'writeOff') {
          const meta = buildWriteOffMetadataFromListRow(doc, userIdByDilovodId);
          const { items: _items, ...updateData } = meta;
          await prisma.warehouseWriteOffHistory.upsert({
            where: { writeOffNumber: docId },
            create: meta,
            update: updateData,
          });
        } else {
          const meta = buildSurplusMetadataFromListRow(doc, userIdByDilovodId);
          const { items: _items, ...updateData } = meta;
          await prisma.warehouseSurplusHistory.upsert({
            where: { surplusNumber: docId },
            create: meta,
            update: updateData,
          });
        }
        return true;
      } catch (error) {
        console.warn(`[GoodDocHistorySync] upsert ${kind} doc ${docId} failed:`, error);
        return false;
      }
    };

    for (let i = 0; i < docs.length; i += UPSERT_BATCH_SIZE) {
      const batch = docs.slice(i, i + UPSERT_BATCH_SIZE);
      const results = await Promise.all(batch.map((doc) => upsertDoc(doc)));
      upserted += results.filter(Boolean).length;
    }

    if (syncMode === 'fullList' && upserted >= 0) {
      await markFullListSyncedToday(kind);
    }

    console.log(`[GoodDocHistorySync] ${kind}: synced ${upserted} document headers (${syncMode})`);
    return { upserted, mode: syncMode };
  }

  /**
   * Завантажує tpGoods для запису історії (кеш БД → getObject Dilovod).
   */
  static async loadDetails(
    kind: GoodDocHistoryKind,
    historyId: number,
    options?: { force?: boolean },
  ): Promise<{ items: unknown[]; itemsNormalized: ReturnType<typeof normalizeItemsArray>; fromCache: boolean }> {
    const force = options?.force === true;

    if (kind === 'writeOff') {
      const existing = await prisma.warehouseWriteOffHistory.findUnique({ where: { id: historyId } });
      if (!existing || existing.status === 'deleted') {
        throw new Error('Запис історії не знайдено');
      }

      if (!force && hasStoredItems(existing.items)) {
        const parsed = safeParseItems(existing.items);
        return {
          items: parsed,
          itemsNormalized: normalizeItemsArray(parsed),
          fromCache: true,
        };
      }

      const dilovodDocId = String(existing.writeOffNumber ?? '').trim();
      if (!dilovodDocId) {
        const parsed = safeParseItems(existing.items);
        return {
          items: parsed,
          itemsNormalized: normalizeItemsArray(parsed),
          fromCache: true,
        };
      }

      const details = await fetchDocumentDetailsFromDilovod(dilovodDocId);
      const items = details?.items ?? [];
      await prisma.warehouseWriteOffHistory.update({
        where: { id: historyId },
        data: { items: JSON.stringify(items) },
      });

      console.log(
        `[GoodDocHistorySync] writeOff history #${historyId}: persisted ${items.length} items from Dilovod`,
      );

      return {
        items,
        itemsNormalized: normalizeItemsArray(items),
        fromCache: false,
      };
    }

    const existing = await prisma.warehouseSurplusHistory.findUnique({ where: { id: historyId } });
    if (!existing || existing.status === 'deleted') {
      throw new Error('Запис історії не знайдено');
    }

    if (!force && hasStoredItems(existing.items)) {
      const parsed = safeParseItems(existing.items);
      return {
        items: parsed,
        itemsNormalized: normalizeItemsArray(parsed),
        fromCache: true,
      };
    }

    const dilovodDocId = String(existing.surplusNumber ?? '').trim();
    if (!dilovodDocId) {
      const parsed = safeParseItems(existing.items);
      return {
        items: parsed,
        itemsNormalized: normalizeItemsArray(parsed),
        fromCache: true,
      };
    }

    const details = await fetchDocumentDetailsFromDilovod(dilovodDocId);
    const items = details?.items ?? [];

    await prisma.warehouseSurplusHistory.update({
      where: { id: historyId },
      data: { items: JSON.stringify(items) },
    });

    console.log(
      `[GoodDocHistorySync] surplus history #${historyId}: persisted ${items.length} items from Dilovod`,
    );

    return {
      items,
      itemsNormalized: normalizeItemsArray(items),
      fromCache: false,
    };
  }
}

export const writeOffHistorySyncService = {
  sync: (options?: GoodDocHistorySyncOptions) =>
    WarehouseGoodDocumentHistorySync.sync('writeOff', options),
  loadDetails: (historyId: number, options?: { force?: boolean }) =>
    WarehouseGoodDocumentHistorySync.loadDetails('writeOff', historyId, options),
};

export const surplusHistorySyncService = {
  sync: (options?: GoodDocHistorySyncOptions) =>
    WarehouseGoodDocumentHistorySync.sync('surplus', options),
  loadDetails: (historyId: number, options?: { force?: boolean }) =>
    WarehouseGoodDocumentHistorySync.loadDetails('surplus', historyId, options),
};
