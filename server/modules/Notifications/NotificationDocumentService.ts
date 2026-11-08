/**
 * Документ, про який сповіщення (комплектування, переміщення, списання).
 * Більшість таких сповіщень – помилки, коли документ так і не з'явився в Діловоді,
 * тому показуємо локальний запис (або спробу відправки) і, якщо є, id документа в Діловоді.
 */

import { prisma } from '../../lib/utils.js';
import type {
  NotificationDocument,
  NotificationDocumentItem,
  NotificationDocumentKind,
  NotificationShortageRow,
} from '../../../shared/types/notifications.js';

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  if (typeof value === 'string') {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  if (typeof value === 'string') {
    try {
      return asArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/** Текст помилки Діловода: інколи приходить JSON-рядком { error, clientMessages }. */
export function readableError(raw: string | null): string | null {
  if (!raw) return null;
  let text = raw.trim();
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const inner = parsed.error ?? parsed.message;
      if (typeof inner === 'string') text = inner;
    } catch {
      // Діловод інколи віддає «JSON» із сирими переносами рядків – дістаємо error регуляркою.
      const match = /"error"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"|\})/.exec(text);
      if (match) text = match[1].replace(/\\"/g, '"');
    }
  }
  return text.replace(/^applicationLayerError\s*/i, '').trim() || null;
}

const qty = (text: string | undefined): number | null => {
  if (!text) return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Помилка Діловода про нестачу:
 * «Документ не збережено. Недостатня кількість. Назва 1
 *  - Код: … | Артикул: … | Партія: … | Рахунок …. Потрібно: 40.000 шт | Вільний залишок: 0 шт | Недостатньо: 40.000 шт.
 *  - Назва 2 | Код: … »
 * Назва першої позиції стоїть у кінці заголовка, наступних – першим полем рядка.
 */
export function parseShortageError(text: string | null): { summary: string | null; rows: NotificationShortageRow[] } {
  if (!text || !/Недостатньо:/i.test(text)) return { summary: null, rows: [] };
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const itemStart = lines.findIndex((l) => l.startsWith('-'));
  if (itemStart < 0) return { summary: null, rows: [] };

  const header = lines.slice(0, itemStart).join(' ');
  // «… Недостатня кількість. Біла квасоля з куркою» – останнє речення заголовка є назвою першої позиції.
  const headerMatch = /^(.*?\.)\s*([^.]*)$/.exec(header);
  const summary = headerMatch ? headerMatch[1].trim() : header || null;
  let pendingName = headerMatch?.[2]?.trim() || null;

  const rows: NotificationShortageRow[] = [];
  for (const line of lines.slice(itemStart)) {
    if (!line.startsWith('-')) continue;
    const parts = line.replace(/^-\s*/, '').split('|').map((p) => p.trim());
    const field = (label: string) => {
      const part = parts.find((p) => new RegExp(`(^|\\s)${label}:`, 'i').test(p));
      return part ? new RegExp(`${label}:\\s*(.+?)\\s*(шт\\.?)?$`, 'i').exec(part)?.[1]?.trim() : undefined;
    };
    const name = /^\S+:/.test(parts[0]) ? pendingName : parts[0];
    pendingName = null;
    const amount = (label: string) => qty(new RegExp(`${label}:\\s*([\\d.,]+)`, 'i').exec(line)?.[1]);
    rows.push({
      name: name || field('Код') || '–',
      sku: field('Артикул') ?? null,
      batch: field('Партія') ?? null,
      needed: amount('Потрібно'),
      stock: amount('Вільний залишок'),
      missing: amount('Недостатньо'),
    });
  }
  return { summary, rows };
}

const RELEASE_STATUS: Record<string, string> = {
  created: 'Проведено',
  deleted: 'Видалено',
  failed: 'Помилка',
  send_failed: 'Не відправлено',
};

const MOVEMENT_STATUS: Record<string, string> = {
  draft: 'Чернетка',
  active: 'В роботі',
  pending_receipt: 'Очікує отримання',
  finalized: 'Завершено',
  deleted: 'Видалено',
};

/** Тип документа за даними запису журналу; null – запис не про складський документ. */
export function detectDocumentKind(log: { category: string; title: string | null; data: unknown }): NotificationDocumentKind | null {
  const data = asObject(log.data);
  if (data.releaseId != null) return 'release';
  if (data.draftId != null) return 'movement';
  if (log.category === 'warehouse_movement' && data.docId != null) return 'movement';
  const header = asObject(asObject(data.payload).header);
  if (log.title === 'WriteOff export failed' || header.id === 'documents.goodWriteOff') return 'writeOff';
  return null;
}

async function userName(id: number | null | undefined): Promise<string | null> {
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return user?.name ?? null;
}

async function loadRelease(releaseId: number, base: NotificationDocument): Promise<NotificationDocument> {
  const record = await prisma.warehouseReleaseSet.findUnique({ where: { id: releaseId } });
  if (!record) return base;
  const isUnkit = record.operationType === 'unkit';
  const items: NotificationDocumentItem[] = [];
  for (const set of asArray(record.items)) {
    const s = asObject(set);
    items.push({ sku: str(s.set_sku), name: str(s.name) ?? 'Набір', quantity: num(s.quantity), batch: null, isGroup: true });
    for (const c of asArray(s.components_snapshot)) {
      const comp = asObject(c);
      const batches = asArray(comp.batches).map((b) => str(asObject(b).batchNumber)).filter(Boolean);
      items.push({ sku: str(comp.id), name: str(comp.name) ?? '', quantity: num(comp.quantity), batch: batches.join(', ') || null });
    }
  }
  return {
    ...base,
    title: `${isUnkit ? 'Розкомплектування' : 'Комплектування'} ${record.internalDocNumber ?? `#${record.id}`}`,
    docNumber: record.internalDocNumber,
    localId: record.id,
    status: RELEASE_STATUS[record.status] ?? record.status,
    date: record.operDate.toISOString(),
    authorName: await userName(record.createdBy),
    storageId: record.storageId,
    comment: record.comment,
    dilovodDocId: record.dilovodDocId,
    items,
  };
}

async function loadMovement(movementId: number, base: NotificationDocument): Promise<NotificationDocument> {
  const record = await prisma.warehouseMovement.findUnique({ where: { id: movementId } });
  if (!record) return base;
  const items: NotificationDocumentItem[] = asArray(record.items).map((raw) => {
    const i = asObject(raw);
    return {
      sku: str(i.sku),
      name: str(i.productName) ?? '',
      quantity: num(i.totalPortions ?? i.portionQuantity),
      batch: str(i.batchNumber),
    };
  });
  return {
    ...base,
    title: `Переміщення ${record.internalDocNumber}`,
    docNumber: record.internalDocNumber,
    localId: record.id,
    status: MOVEMENT_STATUS[record.status] ?? record.status,
    date: (record.movementDate ?? record.draftCreatedAt).toISOString(),
    authorName: await userName(record.createdBy),
    storageId: record.sourceWarehouse,
    storageToId: record.destinationWarehouse,
    comment: record.notes,
    dilovodDocId: record.dilovodDocId,
    items,
  };
}

/** Списання з помилкою не зберігається локально: показуємо те, що намагались відправити. */
async function loadWriteOffAttempt(data: Json, base: NotificationDocument): Promise<NotificationDocument> {
  const payload = asObject(data.payload);
  const header = asObject(payload.header);
  const rows = asArray(asObject(payload.tableParts).tpGoods).map(asObject);
  const goodIds = [...new Set(rows.map((r) => str(r.good)).filter((v): v is string => Boolean(v)))];
  const products = goodIds.length
    ? await prisma.product.findMany({ where: { dilovodId: { in: goodIds } }, select: { dilovodId: true, sku: true, name: true } })
    : [];
  const byId = new Map(products.map((p) => [p.dilovodId, p]));
  const items: NotificationDocumentItem[] = rows.map((r) => {
    const product = byId.get(str(r.good) ?? '');
    return { sku: product?.sku ?? null, name: product?.name ?? `Товар ${str(r.good) ?? ''}`, quantity: num(r.qty), batch: null };
  });
  const date = str(header.date);
  return {
    ...base,
    title: 'Списання (не збережено)',
    status: 'Не проведено',
    date: date ? new Date(date.replace(' ', 'T')).toISOString() : base.date,
    storageId: str(header.storage),
    comment: str(header.remark),
    items,
  };
}

export async function getNotificationDocument(logId: number): Promise<NotificationDocument | null> {
  const log = await prisma.meta_logs.findUnique({ where: { id: logId } });
  if (!log) return null;
  const kind = detectDocumentKind(log);
  if (!kind) return null;
  const data = asObject(log.data);

  const error = readableError(str(data.error) ?? log.message ?? null);
  const shortage = parseShortageError(error);
  const base: NotificationDocument = {
    kind,
    title: 'Документ',
    docNumber: str(data.docNumber) ?? str(data.internalDocNumber),
    localId: null,
    status: null,
    date: log.datetime.toISOString(),
    // Для спроб без локального запису автор – той, хто запускав відправку.
    authorName: /^\d+$/.test(log.initiatedBy ?? '') ? await userName(Number(log.initiatedBy)) : null,
    storageId: null,
    storageToId: null,
    comment: null,
    error,
    shortage: shortage.rows,
    errorSummary: shortage.summary,
    dilovodDocId: str(data.dilovodDocId) ?? str(data.dilovodId),
    items: [],
  };

  if (kind === 'release') return loadRelease(num(data.releaseId), base);
  if (kind === 'movement') return loadMovement(num(data.draftId ?? data.docId), base);
  return loadWriteOffAttempt(data, base);
}
