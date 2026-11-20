/**
 * Історія одного товару для графіка у «Відомості по складу».
 *
 * Два запити до Dilovod:
 * 1. `balanceAndTurnover` за весь період: залишок на початок і підсумки (як у відомості);
 * 2. рядки регістру `goods` за період: рухи, які розкладаються по днях / тижнях.
 * Залишок на кінець кожного бакета = початок + прихід − витрата наростаючим підсумком.
 */

import { prisma, logServer } from '../../lib/utils.js';
import {
  WAREHOUSE_STATEMENT_HISTORY_DAILY_MAX_DAYS,
  WAREHOUSE_STATEMENT_HISTORY_MAX_DAYS,
  warehouseStatementVirtualBatFields,
  type WarehouseStatementHistoryBucket,
  type WarehouseStatementHistoryDocument,
  type WarehouseStatementHistoryPoint,
  type WarehouseStatementHistoryRequest,
  type WarehouseStatementHistoryResponse,
  type WarehouseStatementHistoryTotals,
} from '../../../shared/types/warehouseStatement.js';
import { DilovodApiClient } from './DilovodApiClient.js';
import { dilovodMetadataService } from './DilovodMetadataService.js';
import { unwrapDilovodId, unwrapDilovodName } from './DilovodUtils.js';
import {
  parseRegisterRows,
  resolveMovementShapeNames,
  resolveRecorderLabel,
  splitQty,
} from './ProductMovementsService.js';
import {
  WarehouseStatementQueryError,
  pickCostResource,
  pickQtyResource,
  toSlimShape,
} from './WarehouseStatementService.js';

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;
const ROW_LIMIT = 5000;
const DAY_MS = 86_400_000;

export interface HistoryMovement {
  /** `YYYY-MM-DD` */
  date: string;
  qtyReceipt: number;
  qtyExpense: number;
  amountReceipt: number;
  amountExpense: number;
}

function ymdToUtc(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcToYmd(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function daysBetween(startDate: string, endDate: string): number {
  return Math.round((ymdToUtc(endDate) - ymdToUtc(startDate)) / DAY_MS) + 1;
}

export function pickHistoryBucket(startDate: string, endDate: string): WarehouseStatementHistoryBucket {
  return daysBetween(startDate, endDate) > WAREHOUSE_STATEMENT_HISTORY_DAILY_MAX_DAYS ? 'week' : 'day';
}

/**
 * Серія бакетів від `startDate` до `endDate` включно. Тижні рахуються від `startDate`
 * (останній може бути неповним). Рухи поза періодом ігноруються.
 */
export function buildHistorySeries(input: {
  startDate: string;
  endDate: string;
  bucket: WarehouseStatementHistoryBucket;
  opening: { qty: number; amount: number };
  movements: HistoryMovement[];
}): WarehouseStatementHistoryPoint[] {
  const { startDate, endDate, bucket, opening, movements } = input;
  const start = ymdToUtc(startDate);
  const end = ymdToUtc(endDate);
  const step = bucket === 'week' ? 7 : 1;

  const points: WarehouseStatementHistoryPoint[] = [];
  for (let cursor = start; cursor <= end; cursor += step * DAY_MS) {
    const last = Math.min(cursor + (step - 1) * DAY_MS, end);
    points.push({
      date: utcToYmd(cursor),
      endDate: utcToYmd(last),
      qtyReceipt: 0,
      qtyExpense: 0,
      qtyEnd: 0,
      amountReceipt: 0,
      amountExpense: 0,
      amountEnd: 0,
    });
  }

  for (const move of movements) {
    if (!DATE_YMD.test(move.date)) continue;
    const at = ymdToUtc(move.date);
    if (at < start || at > end) continue;
    const index = Math.floor((at - start) / DAY_MS / step);
    const point = points[index];
    if (!point) continue;
    point.qtyReceipt += move.qtyReceipt;
    point.qtyExpense += move.qtyExpense;
    point.amountReceipt += move.amountReceipt;
    point.amountExpense += move.amountExpense;
  }

  let qty = opening.qty;
  let amount = opening.amount;
  for (const point of points) {
    qty += point.qtyReceipt - point.qtyExpense;
    amount += point.amountReceipt - point.amountExpense;
    point.qtyEnd = round(qty, 3);
    point.amountEnd = round(amount, 2);
    point.qtyReceipt = round(point.qtyReceipt, 3);
    point.qtyExpense = round(point.qtyExpense, 3);
    point.amountReceipt = round(point.amountReceipt, 2);
    point.amountExpense = round(point.amountExpense, 2);
  }
  return points;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function idFilter(alias: string, ids: string[]) {
  return { alias, operator: ids.length === 1 ? '=' : 'IL', value: ids.length === 1 ? ids[0] : ids };
}

export class WarehouseStatementHistoryService {
  private readonly api: DilovodApiClient;

  constructor(apiClient?: DilovodApiClient) {
    this.api = apiClient ?? new DilovodApiClient();
  }

  async history(body: WarehouseStatementHistoryRequest): Promise<WarehouseStatementHistoryResponse> {
    const goodId = String(body?.goodId ?? '').trim();
    if (!goodId) {
      throw new WarehouseStatementQueryError('Не вказано товар');
    }
    const startDate = String(body?.startDate ?? '');
    const endDate = String(body?.endDate ?? '');
    if (!DATE_YMD.test(startDate) || !DATE_YMD.test(endDate)) {
      throw new WarehouseStatementQueryError('Період має бути у форматі YYYY-MM-DD');
    }
    if (startDate > endDate) {
      throw new WarehouseStatementQueryError('startDate не може бути пізніше endDate');
    }
    if (daysBetween(startDate, endDate) > WAREHOUSE_STATEMENT_HISTORY_MAX_DAYS) {
      throw new WarehouseStatementQueryError(
        `Період історії не довший за ${WAREHOUSE_STATEMENT_HISTORY_MAX_DAYS} днів`,
      );
    }

    const shape = await dilovodMetadataService.getRegisterShape('goods');
    const slim = toSlimShape(shape);
    const resolved = resolveMovementShapeNames(slim);
    const qty = pickQtyResource(slim.resources);
    const cost = pickCostResource(slim.resources);
    const goodsDim = resolved.goodsDimensionName;
    if (!qty || !goodsDim) {
      throw new WarehouseStatementQueryError('Регістр goods без товару або кількості', 500);
    }
    if (!resolved.periodAttributeName) {
      throw new WarehouseStatementQueryError('Регістр goods без атрибута period (дата руху)', 500);
    }

    const dimNames = new Set(slim.dimensions.map((dim) => dim.name));
    const dimFilters: Array<{ alias: string; operator: string; value: unknown }> = [];
    for (const [name, raw] of Object.entries(body.dimensionFilters ?? {})) {
      if (!dimNames.has(name) || name === goodsDim) continue;
      const ids = normalizeIds(raw);
      if (ids.length > 0) dimFilters.push(idFilter(name, ids));
    }

    const [totals, movementInfo, product] = await Promise.all([
      this.fetchTotals({
        register: slim.registerName,
        goodsDim,
        goodId,
        qtyName: qty.name,
        amountName: cost?.name,
        startDate,
        endDate,
        dimFilters,
      }),
      this.fetchMovements({
        objectName: slim.objectName,
        periodField: resolved.periodAttributeName,
        recorderField: resolved.recorderAttributeName,
        recordTypeField: resolved.recordTypeAttributeName,
        goodsDim,
        storageDim: resolved.storageDimensionName,
        goodId,
        qtyName: qty.name,
        amountName: cost?.name,
        startDate,
        endDate,
        dimFilters,
      }),
      prisma.catalogGood
        .findUnique({ where: { id: goodId }, select: { name: true, sku: true } })
        .catch((error: unknown) => {
          logServer('WarehouseStatementHistory: товар', error);
          return null;
        }),
    ]);

    const bucket = pickHistoryBucket(startDate, endDate);
    const points = buildHistorySeries({
      startDate,
      endDate,
      bucket,
      opening: { qty: totals.qtyStart, amount: totals.amountStart },
      movements: movementInfo.movements,
    });

    const last = points[points.length - 1];
    const mismatch = last
      && (Math.abs(last.qtyEnd - totals.qtyFinal) > 0.001 || Math.abs(last.amountEnd - totals.amountFinal) > 0.01);
    const warning = movementInfo.truncated
      ? `Рухів понад ${ROW_LIMIT}: графік приблизний, звузьте період.`
      : mismatch
        ? 'Сума рухів не збігається із залишком на кінець: графік може бути приблизним.'
        : undefined;

    return {
      goodId,
      label: product?.name || goodId,
      sku: product?.sku ?? null,
      period: { startDate, endDate },
      bucket,
      totals,
      points,
      documents: movementInfo.documents,
      ...(warning ? { warning } : {}),
    };
  }

  private async fetchTotals(input: {
    register: string;
    goodsDim: string;
    goodId: string;
    qtyName: string;
    amountName?: string;
    startDate: string;
    endDate: string;
    dimFilters: Array<{ alias: string; operator: string; value: unknown }>;
  }): Promise<WarehouseStatementHistoryTotals> {
    const qtyBat = warehouseStatementVirtualBatFields(input.qtyName);
    const amountBat = input.amountName ? warehouseStatementVirtualBatFields(input.amountName) : null;
    const fields = [
      input.goodsDim,
      ...input.dimFilters.map((filter) => filter.alias),
      ...Object.values(qtyBat),
      ...(amountBat ? Object.values(amountBat) : []),
    ];
    const rows = await this.api.getGoodsBalanceAndTurnover({
      register: input.register,
      startDate: `${input.startDate} 00:00:00`,
      endDate: `${input.endDate} 23:59:59`,
      dimensions: [input.goodsDim, ...input.dimFilters.map((filter) => filter.alias)],
      fields: [...new Set(fields)],
      filters: [{ alias: input.goodsDim, operator: '=', value: input.goodId }, ...input.dimFilters],
    });

    const sum = (field: string | undefined) =>
      field ? rows.reduce((acc, row) => acc + num(row[field]), 0) : 0;
    return {
      qtyStart: round(sum(qtyBat.start), 3),
      qtyReceipt: round(sum(qtyBat.receipt), 3),
      qtyExpense: round(sum(qtyBat.expense), 3),
      qtyFinal: round(sum(qtyBat.final), 3),
      amountStart: round(sum(amountBat?.start), 2),
      amountReceipt: round(sum(amountBat?.receipt), 2),
      amountExpense: round(sum(amountBat?.expense), 2),
      amountFinal: round(sum(amountBat?.final), 2),
    };
  }

  /**
   * Рядки регістру по товару за період без фільтра складу / фірми: так видно другий бік
   * переміщення. Фільтр відбору застосовується тут, у коді.
   */
  private async fetchMovements(input: {
    objectName: string;
    periodField: string;
    recorderField?: string;
    recordTypeField?: string;
    goodsDim: string;
    storageDim?: string;
    goodId: string;
    qtyName: string;
    amountName?: string;
    startDate: string;
    endDate: string;
    dimFilters: Array<{ alias: string; operator: string; value: unknown }>;
  }): Promise<{ movements: HistoryMovement[]; documents: WarehouseStatementHistoryDocument[]; truncated: boolean }> {
    const fields: Record<string, string> = {
      [input.periodField]: 'period',
      [input.qtyName]: 'qty',
      [input.goodsDim]: input.goodsDim,
    };
    if (input.amountName) fields[input.amountName] = 'amount';
    if (input.recorderField) {
      fields[input.recorderField] = 'recorder';
      fields[`${input.recorderField}.number`] = 'recorderNumber';
    }
    if (input.recordTypeField) fields[input.recordTypeField] = 'recordType';
    if (input.storageDim) fields[input.storageDim] = input.storageDim;
    for (const filter of input.dimFilters) fields[filter.alias] = filter.alias;

    await this.api.ensureReady();
    const resp = await this.api.makeRequest<unknown>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'request',
      params: {
        // assembleLinks (default true): `__pr` для складу й документа.
        from: input.objectName,
        fields,
        filters: [
          { alias: input.goodsDim, operator: '=', value: input.goodId },
          { alias: 'period', operator: '>=', value: `${input.startDate} 00:00:00` },
          { alias: 'period', operator: '<=', value: `${input.endDate} 23:59:59` },
        ],
        limit: { count: ROW_LIMIT },
      },
    });
    if (resp && typeof resp === 'object' && 'error' in resp && (resp as { error?: unknown }).error) {
      throw new WarehouseStatementQueryError(String((resp as { error: unknown }).error), 502);
    }

    const rows = parseRegisterRows(resp).filter((row) => {
      const id = unwrapDilovodId(row[input.goodsDim]);
      return !id || id === input.goodId;
    });

    const allowed = input.dimFilters.map((filter) => ({
      alias: filter.alias,
      ids: new Set(Array.isArray(filter.value) ? filter.value.map(String) : [String(filter.value)]),
    }));
    const inScope = (row: Record<string, unknown>) =>
      allowed.every((filter) => filter.ids.has(unwrapDilovodId(row[filter.alias]) || String(row[filter.alias] ?? '')));

    const storageLabels = await this.storageLabels(rows, input.storageDim);
    const storageOf = (row: Record<string, unknown>) => {
      if (!input.storageDim) return '';
      const id = unwrapDilovodId(row[input.storageDim]) || String(row[input.storageDim] ?? '');
      return storageLabels.get(id) || id;
    };

    const recorderKey = (row: Record<string, unknown>) =>
      unwrapDilovodId(row.recorder) || String(row.recorderNumber ?? '') || '';
    const storagesByRecorder = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = recorderKey(row);
      if (!key) continue;
      const set = storagesByRecorder.get(key) ?? new Set<string>();
      const storage = storageOf(row);
      if (storage) set.add(storage);
      storagesByRecorder.set(key, set);
    }

    const movements: HistoryMovement[] = [];
    const documents = new Map<string, WarehouseStatementHistoryDocument>();
    for (const row of rows) {
      if (!inScope(row)) continue;
      const dateTime = String(row.period ?? '').slice(0, 19);
      const date = dateTime.slice(0, 10);
      const label = resolveRecorderLabel(row);
      const qtySplit = splitQty(num(row.qty), row.recordType, label);
      const amountSplit = splitQty(num(row.amount), row.recordType, label);
      const move: HistoryMovement = {
        date,
        qtyReceipt: qtySplit.receiptQty ?? 0,
        qtyExpense: qtySplit.expenseQty ?? 0,
        amountReceipt: amountSplit.receiptQty ?? 0,
        amountExpense: amountSplit.expenseQty ?? 0,
      };
      movements.push(move);

      const recorder = recorderKey(row);
      const storage = storageOf(row);
      const docKey = `${recorder || label}|${storage}|${date}`;
      const doc = documents.get(docKey) ?? {
        recorderId: unwrapDilovodId(row.recorder) || null,
        label,
        date,
        dateTime,
        storageLabel: storage,
        counterpartLabels: [...(storagesByRecorder.get(recorder) ?? [])].filter((name) => name !== storage),
        qtyReceipt: 0,
        qtyExpense: 0,
        amountReceipt: 0,
        amountExpense: 0,
      };
      doc.qtyReceipt += move.qtyReceipt;
      doc.qtyExpense += move.qtyExpense;
      doc.amountReceipt += move.amountReceipt;
      doc.amountExpense += move.amountExpense;
      documents.set(docKey, doc);
    }

    const documentList = [...documents.values()]
      .map((doc) => ({
        ...doc,
        qtyReceipt: round(doc.qtyReceipt, 3),
        qtyExpense: round(doc.qtyExpense, 3),
        amountReceipt: round(doc.amountReceipt, 2),
        amountExpense: round(doc.amountExpense, 2),
      }))
      .filter((doc) => Math.abs(doc.qtyReceipt) + Math.abs(doc.qtyExpense) + Math.abs(doc.amountReceipt) + Math.abs(doc.amountExpense) > 1e-9)
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

    return { movements, documents: documentList, truncated: rows.length >= ROW_LIMIT };
  }

  /** Назви складів: `__pr` з рядків, решта з довідника Dilovod. */
  private async storageLabels(rows: Record<string, unknown>[], storageDim?: string): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    if (!storageDim) return labels;
    let missing = false;
    for (const row of rows) {
      const id = unwrapDilovodId(row[storageDim]) || String(row[storageDim] ?? '');
      if (!id || labels.has(id)) continue;
      const name = unwrapDilovodName(row[`${storageDim}__pr`]);
      if (name) labels.set(id, name);
      else missing = true;
    }
    if (missing) {
      try {
        for (const storage of await this.api.getStorages()) {
          const id = unwrapDilovodId(storage.id) || String(storage.id ?? '');
          const name = unwrapDilovodName(storage.name);
          if (id && name && !labels.has(id)) labels.set(id, name);
        }
      } catch (error) {
        logServer('WarehouseStatementHistory: склади', error);
      }
    }
    return labels;
  }
}

export const warehouseStatementHistoryService = new WarehouseStatementHistoryService();
