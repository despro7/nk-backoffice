/**
 * Звіт «Рухи по товару»: прямий запит balanceRegisters.goods + running balance.
 */

import { logServer } from '../../lib/utils.js';
import { catalogOpsLookup } from '../../modules/Products/CatalogOpsLookup.js';
import {
  WAREHOUSE_STATEMENT_VALUE_TYPES,
  warehouseStatementValueTypeIncludes,
  type WarehouseStatementDirectoryItem,
  type WarehouseStatementRegisterField,
  type WarehouseStatementRegisterShape,
} from '../../../shared/types/warehouseStatement.js';
import type {
  ProductMovementsGroup,
  ProductMovementsLine,
  ProductMovementsMetaResponse,
  ProductMovementsQueryRequest,
  ProductMovementsQueryResponse,
  ProductMovementsResolvedShape,
} from '../../../shared/types/productMovements.js';
import { DilovodApiClient } from './DilovodApiClient.js';
import { dilovodMetadataService } from './DilovodMetadataService.js';
import type { DilovodRegisterShape } from './DilovodTypes.js';
import {
  batchNumberNeedsResolution,
  pickHumanBatchLabel,
} from '../../../shared/utils/dilovodBatchId.js';
import {
  extractBatchLabelFromGoodPartHeader,
  extractGoodPartIdPresentation,
  unwrapDilovodId,
  unwrapDilovodName,
} from './DilovodUtils.js';

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;
const IL_CHUNK = 50;
const ROW_LIMIT = 5000;
const DIRECTORY_CACHE_TTL_MS = 5 * 60_000;

type DirectoryCacheEntry = {
  expiresAt: number;
  data: WarehouseStatementDirectoryItem[];
};

let cachedStorages: DirectoryCacheEntry | null = null;
let cachedFirms: DirectoryCacheEntry | null = null;
let storagesLoadPromise: Promise<WarehouseStatementDirectoryItem[]> | null = null;
let firmsLoadPromise: Promise<WarehouseStatementDirectoryItem[]> | null = null;

export class ProductMovementsQueryError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ProductMovementsQueryError';
    this.statusCode = statusCode;
  }
}

type RawMovementRow = Record<string, unknown>;

export class ProductMovementsService {
  private readonly api: DilovodApiClient;

  constructor(apiClient?: DilovodApiClient) {
    this.api = apiClient ?? new DilovodApiClient();
  }

  async getMeta(): Promise<ProductMovementsMetaResponse> {
    const shape = await dilovodMetadataService.getRegisterShape('goods');
    const slim = toSlimShape(shape);
    const resolved = resolveShapeNames(slim);
    const storages = await this.loadStorages();
    const firms = await this.loadFirms();

    return {
      shape: slim,
      resolved,
      storages,
      firms,
      filters: {
        good: Boolean(resolved.goodsDimensionName),
        goodPart: Boolean(resolved.goodPartDimensionName),
        storage: Boolean(resolved.storageDimensionName),
        firm: Boolean(resolved.firmDimensionName),
      },
    };
  }

  async query(body: ProductMovementsQueryRequest): Promise<ProductMovementsQueryResponse> {
    const shape = await dilovodMetadataService.getRegisterShape('goods');
    const slim = toSlimShape(shape);
    const resolved = resolveShapeNames(slim);
    const qtyName = resolved.qtyResourceName;
    if (!qtyName) {
      throw new ProductMovementsQueryError('Регістр goods без ресурсу кількості', 500);
    }
    if (!resolved.goodsDimensionName) {
      throw new ProductMovementsQueryError('Регістр goods без виміру товару', 500);
    }
    if (!resolved.periodAttributeName) {
      throw new ProductMovementsQueryError('Регістр goods без атрибута period (дата руху)', 500);
    }

    const product = await this.resolveProduct(body);
    const period = this.resolvePeriod(body);
    const groupDims = this.groupDimensions(resolved, body.goodPartId);

    const [movementRows, openingByGroup] = await Promise.all([
      this.fetchMovementRows({
        objectName: slim.objectName,
        resolved,
        qtyName,
        goodId: product.dilovodGoodId,
        period,
        goodPartId: body.goodPartId,
        storageId: body.storageId,
        firmId: body.firmId,
      }),
      this.fetchOpeningBalances({
        registerName: slim.registerName,
        resolved,
        qtyName,
        goodId: product.dilovodGoodId,
        period,
        groupDims,
        goodPartId: body.goodPartId,
        storageId: body.storageId,
        firmId: body.firmId,
      }),
    ]);

    const labels = await this.loadDirectoryLabels(movementRows, resolved, openingByGroup, groupDims);

    const groups = this.buildGroups({
      movementRows,
      resolved,
      qtyName,
      groupDims,
      openingByGroup,
      labels,
    });

    const truncated = movementRows.length >= ROW_LIMIT;

    return {
      product,
      period: {
        startDate: period.startDate.slice(0, 10),
        endDate: period.endDate.slice(0, 10),
      },
      groups,
      ...(truncated
        ? {
            truncated: true,
            warning: `Показано перші ${ROW_LIMIT} рядків. Звузьте період або фільтри.`,
          }
        : {}),
    };
  }

  private async resolveProduct(body: ProductMovementsQueryRequest) {
    const goodId = String(body.goodId ?? '').trim();
    const sku = String(body.sku ?? '').trim();

    if (goodId) {
      const byId = await catalogOpsLookup.getByDilovodIds([goodId]);
      const product = byId.get(goodId);
      return {
        dilovodGoodId: goodId,
        sku: product?.sku ?? sku,
        name: product?.name ?? (sku || goodId),
      };
    }

    if (!sku) {
      throw new ProductMovementsQueryError('Потрібно вказати товар (sku або goodId)');
    }

    const product = await catalogOpsLookup.getBySku(sku);
    if (!product?.dilovodId) {
      throw new ProductMovementsQueryError(`Товар з SKU «${sku}» не знайдено в каталозі`, 404);
    }

    return {
      dilovodGoodId: product.dilovodId,
      sku: product.sku,
      name: product.name,
    };
  }

  private resolvePeriod(body: ProductMovementsQueryRequest): { startDate: string; endDate: string } {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const start = body.startDate ? assertYmd(body.startDate, 'startDate') : formatYmd(defaultStart);
    const end = body.endDate ? assertYmd(body.endDate, 'endDate') : formatYmd(defaultEnd);
    if (start > end) {
      throw new ProductMovementsQueryError('startDate не може бути пізніше endDate');
    }

    return {
      startDate: `${start} 00:00:00`,
      endDate: `${end} 23:59:59`,
    };
  }

  private groupDimensions(resolved: ProductMovementsResolvedShape, goodPartId?: string): string[] {
    const dims: string[] = [];
    if (resolved.storageDimensionName) dims.push(resolved.storageDimensionName);
    if (resolved.firmDimensionName) dims.push(resolved.firmDimensionName);
    if (resolved.businessDimensionName) dims.push(resolved.businessDimensionName);
    // Без фільтра по партії — групуємо по goodPart, щоб показати незакриті партії як у Dilovod.
    if (!goodPartId && resolved.goodPartDimensionName) {
      dims.push(resolved.goodPartDimensionName);
    }
    return dims;
  }

  private async fetchMovementRows(input: {
    objectName: string;
    resolved: ProductMovementsResolvedShape;
    qtyName: string;
    goodId: string;
    period: { startDate: string; endDate: string };
    goodPartId?: string;
    storageId?: string;
    firmId?: string;
  }): Promise<RawMovementRow[]> {
    const {
      objectName, resolved, qtyName, goodId, period, goodPartId, storageId, firmId,
    } = input;
    const periodField = resolved.periodAttributeName as string;
    const goodsDim = resolved.goodsDimensionName as string;

    const fields: Record<string, string> = {
      [periodField]: 'period',
      [qtyName]: 'qty',
    };
    if (resolved.recorderAttributeName) {
      const recorderField = resolved.recorderAttributeName;
      fields[recorderField] = 'recorder';
      // Dot notation: номер/дата документа без getObject (працює і з assembleLinks).
      fields[`${recorderField}.number`] = 'recorderNumber';
      fields[`${recorderField}.date`] = 'recorderDate';
    }
    if (resolved.lineNumberAttributeName) {
      fields[resolved.lineNumberAttributeName] = 'lineNumber';
    }
    if (resolved.recordTypeAttributeName) {
      fields[resolved.recordTypeAttributeName] = 'recordType';
    }
    for (const dim of [
      resolved.goodsDimensionName,
      resolved.goodPartDimensionName,
      resolved.storageDimensionName,
      resolved.firmDimensionName,
      resolved.businessDimensionName,
    ]) {
      if (dim) fields[dim] = dim;
    }

    const filters: Array<{ alias: string; operator: string; value: unknown }> = [
      { alias: goodsDim, operator: '=', value: goodId },
      { alias: 'period', operator: '>=', value: period.startDate },
      { alias: 'period', operator: '<=', value: period.endDate },
    ];
    if (goodPartId && resolved.goodPartDimensionName) {
      filters.push({ alias: resolved.goodPartDimensionName, operator: '=', value: goodPartId });
    }
    if (storageId && resolved.storageDimensionName) {
      filters.push({ alias: resolved.storageDimensionName, operator: '=', value: storageId });
    }
    if (firmId && resolved.firmDimensionName) {
      filters.push({ alias: resolved.firmDimensionName, operator: '=', value: firmId });
    }

    await this.api.ensureReady();
    const resp = await this.api.makeRequest<unknown>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'request',
      params: {
        // assembleLinks (default true): __pr для складу/фірми/партії/документа в одному запиті.
        from: objectName,
        fields,
        filters,
        limit: { count: ROW_LIMIT },
      },
    });

    if (resp && typeof resp === 'object' && 'error' in resp && (resp as { error?: unknown }).error) {
      throw new ProductMovementsQueryError(String((resp as { error: unknown }).error), 502);
    }

    return parseRegisterRows(resp);
  }

  private async fetchOpeningBalances(input: {
    registerName: string;
    resolved: ProductMovementsResolvedShape;
    qtyName: string;
    goodId: string;
    period: { startDate: string; endDate: string };
    groupDims: string[];
    goodPartId?: string;
    storageId?: string;
    firmId?: string;
  }): Promise<Map<string, number>> {
    const {
      registerName, resolved, qtyName, goodId, period, groupDims, goodPartId, storageId, firmId,
    } = input;
    const goodsDim = resolved.goodsDimensionName as string;
    const qtyStartField = dilovodMetadataService.virtualBatFields(qtyName).start;

    const dimensions = [...groupDims];
    if (goodPartId && resolved.goodPartDimensionName && !dimensions.includes(resolved.goodPartDimensionName)) {
      dimensions.push(resolved.goodPartDimensionName);
    }

    // Dilovod вимагає, щоб кожен alias у filters був у fields.
    const fields = [...new Set([goodsDim, ...dimensions, qtyStartField])];

    const filters: Array<{ alias: string; operator: string; value: unknown }> = [
      { alias: goodsDim, operator: '=', value: goodId },
    ];
    if (goodPartId && resolved.goodPartDimensionName) {
      filters.push({ alias: resolved.goodPartDimensionName, operator: '=', value: goodPartId });
    }
    if (storageId && resolved.storageDimensionName) {
      filters.push({ alias: resolved.storageDimensionName, operator: '=', value: storageId });
    }
    if (firmId && resolved.firmDimensionName) {
      filters.push({ alias: resolved.firmDimensionName, operator: '=', value: firmId });
    }

    const rows = await this.api.getGoodsBalanceAndTurnover({
      register: registerName,
      startDate: period.startDate,
      endDate: period.endDate,
      dimensions,
      fields,
      filters,
    });

    const map = new Map<string, number>();
    for (const row of rows) {
      const key = buildGroupKey(row, groupDims);
      map.set(key, num(row[qtyStartField]));
    }
    return map;
  }

  private buildGroups(input: {
    movementRows: RawMovementRow[];
    resolved: ProductMovementsResolvedShape;
    qtyName: string;
    groupDims: string[];
    openingByGroup: Map<string, number>;
    labels: Map<string, string>;
  }): ProductMovementsGroup[] {
    const {
      movementRows, resolved, qtyName, groupDims, openingByGroup, labels,
    } = input;

    const sorted = [...movementRows].sort((a, b) => {
      const dateCmp = String(a.period ?? '').localeCompare(String(b.period ?? ''));
      if (dateCmp !== 0) return dateCmp;
      const lineA = num(a.lineNumber);
      const lineB = num(b.lineNumber);
      return lineA - lineB;
    });

    const buckets = new Map<string, RawMovementRow[]>();
    for (const row of sorted) {
      const key = buildGroupKey(row, groupDims);
      const list = buckets.get(key) ?? [];
      list.push(row);
      buckets.set(key, list);
    }

    const groups: ProductMovementsGroup[] = [];
    const allKeys = new Set<string>([...buckets.keys(), ...openingByGroup.keys()]);
    const orderedKeys = [...allKeys]
      .filter((key) => {
        const rows = buckets.get(key) ?? [];
        const hasMeaningfulMovements = rows.some((row) => isMeaningfulMovementRow(row, qtyName));
        const opening = openingByGroup.get(key) ?? 0;
        return hasMeaningfulMovements || Math.abs(opening) > 1e-9;
      })
      .sort((a, b) => {
        const aMovements = buckets.get(a)?.length ?? 0;
        const bMovements = buckets.get(b)?.length ?? 0;
        const aOnlyOpening = aMovements === 0;
        const bOnlyOpening = bMovements === 0;
        if (aOnlyOpening && !bOnlyOpening) return -1;
        if (!aOnlyOpening && bOnlyOpening) return 1;
        return groupLabel(a, groupDims, labels).localeCompare(groupLabel(b, groupDims, labels), 'uk');
      });

    for (const groupKey of orderedKeys) {
      const rows = buckets.get(groupKey) ?? [];
      let balance = openingByGroup.get(groupKey) ?? 0;
      const openingBalance = balance;
      let totalReceipt = 0;
      let totalExpense = 0;
      const lines: ProductMovementsLine[] = [];

      let rowNum = 0;
      for (const row of rows) {
        const { documentLabel, receiptQty, expenseQty, signedQty } = evaluateMovementRow(row, qtyName);
        if (!isMeaningfulMovementEffect({ receiptQty, expenseQty, signedQty })) continue;

        balance += signedQty;
        if (receiptQty != null) totalReceipt += receiptQty;
        if (expenseQty != null) totalExpense += expenseQty;
        rowNum += 1;

        const recorderId = str(row.recorder ?? row[resolved.recorderAttributeName as string]);
        lines.push({
          rowNum,
          date: formatDisplayDate(row.period),
          documentId: recorderId || null,
          documentLabel,
          receiptQty,
          expenseQty,
          balanceQty: balance,
        });
      }

      groups.push({
        groupKey,
        label: groupLabel(groupKey, groupDims, labels),
        openingBalance,
        lines,
        totals: {
          receiptQty: totalReceipt,
          expenseQty: totalExpense,
          balanceQty: balance,
        },
      });
    }

    if (groups.length === 0) {
      const emptyKey = buildGroupKey({}, groupDims);
      groups.push({
        groupKey: emptyKey,
        label: groupLabel(emptyKey, groupDims, labels),
        openingBalance: openingByGroup.get(emptyKey) ?? 0,
        lines: [],
        totals: { receiptQty: 0, expenseQty: 0, balanceQty: openingByGroup.get(emptyKey) ?? 0 },
      });
    }

    return groups;
  }

  private async loadDirectoryLabels(
    rows: RawMovementRow[],
    resolved: ProductMovementsResolvedShape,
    openingByGroup: Map<string, number>,
    groupDims: string[],
  ): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    const goodPartDim = resolved.goodPartDimensionName;
    const missing = new Set<string>();
    const dimFields = [
      resolved.storageDimensionName,
      resolved.firmDimensionName,
      resolved.businessDimensionName,
      goodPartDim,
    ].filter(Boolean) as string[];

    const trackMissingId = (id: string, dim?: string) => {
      if (!id) return;
      const existing = labels.get(id);
      if (!existing) {
        missing.add(id);
        return;
      }
      if (dim === goodPartDim && batchNumberNeedsResolution(existing, id)) {
        missing.add(id);
      }
    };

    for (const row of rows) {
      for (const dim of dimFields) {
        const id = str(row[dim]);
        const rawDim = row[dim];
        const pr = dim === goodPartDim
          ? extractGoodPartIdPresentation(
            typeof rawDim === 'object' && rawDim ? rawDim as Record<string, unknown> : row,
            id,
          ) || pickHumanBatchLabel(id, unwrapDilovodName(row[`${dim}__pr`]))
          : unwrapDilovodName(row[`${dim}__pr`]);
        if (id && pr) {
          labels.set(id, pr);
        }
        trackMissingId(id, dim);
      }
    }

    for (const key of openingByGroup.keys()) {
      for (const [index, part] of key.split('|').entries()) {
        const dim = groupDims[index];
        trackMissingId(part, dim);
      }
    }

    if (missing.size > 0) {
      const ids = [...missing];
      for (const from of ['catalogs.storages', 'catalogs.firms', 'catalogs.business', 'catalogs.accounts', 'catalogs.goodParts'] as const) {
        try {
          await this.api.ensureReady();
          for (let i = 0; i < ids.length; i += IL_CHUNK) {
            const chunk = ids.slice(i, i + IL_CHUNK);
            const resp = await this.api.makeRequest<unknown>({
              version: '0.25',
              key: this.api.getApiKey(),
              action: 'request',
              params: {
                from,
                fields: {
                  id: 'id',
                  name: 'name',
                  id__pr: 'id__pr',
                  code: 'code',
                  number: 'number',
                  printName: 'printName',
                  sysName: 'sysName',
                },
                filters: [{ alias: 'id', operator: 'IL', value: chunk }],
              },
            });
            const partRows = Array.isArray(resp) ? resp : [];
            for (const row of partRows as Array<Record<string, unknown>>) {
              const id = unwrapDilovodId(row.id);
              if (!id) continue;

              if (from === 'catalogs.goodParts') {
                const label = extractBatchLabelFromGoodPartHeader(row, id);
                if (label) labels.set(id, label);
                continue;
              }

              const name = unwrapDilovodName(row.name)
                || unwrapDilovodName(row.id__pr)
                || String(row.code ?? '').trim();
              if (name) labels.set(id, name);
            }
          }
        } catch (error) {
          logServer(`ProductMovements: labels ${from}`, error);
        }
      }
    }

    await this.resolveGoodPartLabelsViaGetObject(
      rows,
      resolved,
      openingByGroup,
      groupDims,
      labels,
    );

    return labels;
  }

  private async resolveGoodPartLabelsViaGetObject(
    rows: RawMovementRow[],
    resolved: ProductMovementsResolvedShape,
    openingByGroup: Map<string, number>,
    groupDims: string[],
    labels: Map<string, string>,
  ): Promise<void> {
    const goodPartDim = resolved.goodPartDimensionName;
    if (!goodPartDim) return;

    const dimIndex = groupDims.indexOf(goodPartDim);
    const needIds = new Set<string>();

    for (const row of rows) {
      const id = str(row[goodPartDim]);
      if (id && batchNumberNeedsResolution(labels.get(id), id)) {
        needIds.add(id);
      }
    }

    for (const key of openingByGroup.keys()) {
      if (dimIndex < 0) continue;
      const id = key.split('|')[dimIndex];
      if (id && batchNumberNeedsResolution(labels.get(id), id)) {
        needIds.add(id);
      }
    }

    if (needIds.size === 0) return;

    await this.api.ensureReady();
    for (const id of needIds) {
      try {
        const obj = await this.api.getObject(id);
        const header = obj.header && typeof obj.header === 'object'
          ? (obj.header as Record<string, unknown>)
          : undefined;
        const label = extractBatchLabelFromGoodPartHeader(header, id);
        if (label) labels.set(id, label);
      } catch (error) {
        logServer(`ProductMovements: getObject(${id}) для назви партії`, error);
      }
    }
  }

  private async loadStorages(): Promise<WarehouseStatementDirectoryItem[]> {
    if (cachedStorages && cachedStorages.expiresAt > Date.now()) {
      return cachedStorages.data;
    }
    if (!storagesLoadPromise) {
      storagesLoadPromise = this.fetchStoragesFromApi()
        .then((data) => {
          cachedStorages = { data, expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS };
          return data;
        })
        .finally(() => {
          storagesLoadPromise = null;
        });
    }
    return storagesLoadPromise;
  }

  private async loadFirms(): Promise<WarehouseStatementDirectoryItem[]> {
    if (cachedFirms && cachedFirms.expiresAt > Date.now()) {
      return cachedFirms.data;
    }
    if (!firmsLoadPromise) {
      firmsLoadPromise = this.fetchFirmsFromApi()
        .then((data) => {
          cachedFirms = { data, expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS };
          return data;
        })
        .finally(() => {
          firmsLoadPromise = null;
        });
    }
    return firmsLoadPromise;
  }

  private async fetchStoragesFromApi(): Promise<WarehouseStatementDirectoryItem[]> {
    try {
      const rows = await this.api.getStorages();
      return rows.map((s) => {
        const id = unwrapDilovodId(s.id) || String(s.id ?? '');
        return { id, name: unwrapDilovodName(s.name) || id };
      }).filter((item) => item.id);
    } catch (error) {
      logServer('ProductMovements: склади', error);
      return [];
    }
  }

  private async fetchFirmsFromApi(): Promise<WarehouseStatementDirectoryItem[]> {
    try {
      const rows = await this.api.getFirms();
      return rows.map((f: { id?: unknown; name?: unknown }) => {
        const id = unwrapDilovodId(f.id) || String(f.id ?? '');
        return { id, name: unwrapDilovodName(f.name) || id };
      }).filter((item) => item.id);
    } catch (error) {
      logServer('ProductMovements: фірми', error);
      return [];
    }
  }
}

export const productMovementsService = new ProductMovementsService();

function toSlimShape(shape: DilovodRegisterShape): WarehouseStatementRegisterShape {
  const slimField = (f: { name: string; presentation: string; valueType?: string; kind: string }) => ({
    name: f.name,
    presentation: f.presentation,
    valueType: f.valueType,
    kind: f.kind as WarehouseStatementRegisterField['kind'],
  });
  return {
    objectName: shape.objectName,
    registerName: shape.registerName,
    presentation: shape.presentation,
    dimensions: shape.dimensions.map(slimField),
    resources: shape.resources.map(slimField),
    attributes: shape.attributes.map(slimField),
  };
}

function resolveShapeNames(shape: WarehouseStatementRegisterShape): ProductMovementsResolvedShape {
  const byVt = (vt: string) =>
    shape.dimensions.find((d) => warehouseStatementValueTypeIncludes(d.valueType, vt))?.name;
  const qty = shape.resources.find((f) => f.name === 'qty') ?? shape.resources[0];

  const findAttr = (...names: string[]) => {
    const exact = shape.attributes.find((f) => names.includes(f.name));
    if (exact) return exact.name;
    const fuzzy = shape.attributes.find((f) =>
      names.some((n) => f.name.toLowerCase().includes(n.toLowerCase())),
    );
    return fuzzy?.name;
  };

  return {
    ...(byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.goods)
      ? { goodsDimensionName: byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.goods) }
      : {}),
    ...(byVt('catalogs.goodParts')
      ? { goodPartDimensionName: byVt('catalogs.goodParts') }
      : {}),
    ...(byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.storages)
      ? { storageDimensionName: byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.storages) }
      : {}),
    ...(byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.firms)
      ? { firmDimensionName: byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.firms) }
      : {}),
    ...(() => {
      const accountDim = shape.dimensions.find((d) => d.name === 'account')?.name
        || shape.dimensions.find((d) => d.name === 'business')?.name
        || byVt('catalogs.accounts')
        || byVt('catalogs.business');
      return accountDim ? { businessDimensionName: accountDim } : {};
    })(),
    ...(qty ? { qtyResourceName: qty.name } : {}),
    periodAttributeName: findAttr('period', 'date'),
    recorderAttributeName: findAttr('recorder', 'registrator'),
    lineNumberAttributeName: findAttr('lineNumber', 'rowNum', 'rowNumber'),
    recordTypeAttributeName: findAttr('movementType', 'goodMovementType', 'recordType', 'active', 'movementKind'),
  };
}

function parseRegisterRows(resp: unknown): RawMovementRow[] {
  if (Array.isArray(resp)) {
    return resp as RawMovementRow[];
  }
  if (resp && typeof resp === 'object') {
    const obj = resp as { columns?: string[]; data?: unknown[][] };
    if (Array.isArray(obj.columns) && Array.isArray(obj.data)) {
      return obj.data.map((row) => {
        const out: RawMovementRow = {};
        obj.columns!.forEach((col, index) => {
          out[col] = row[index];
        });
        return out;
      });
    }
    const possible = (resp as { data?: unknown; rows?: unknown }).data ?? (resp as { rows?: unknown }).rows;
    if (Array.isArray(possible)) return possible as RawMovementRow[];
    if (Object.keys(resp as object).length === 0) return [];
    return [resp as RawMovementRow];
  }
  return [];
}

function buildGroupKey(row: RawMovementRow, groupDims: string[]): string {
  if (groupDims.length === 0) return '__all__';
  return groupDims.map((dim) => str(row[dim])).join('|');
}

function groupLabel(groupKey: string, groupDims: string[], labels: Map<string, string>): string {
  if (groupKey === '__all__') return 'Усі розрізи';
  const parts = groupKey.split('|');
  const named = parts.map((id, index) => {
    const dim = groupDims[index];
    const name = labels.get(id) || id || '—';
    return dim ? `${name}` : name;
  });
  return named.join(' · ');
}

function evaluateMovementRow(row: RawMovementRow, qtyName: string) {
  const qty = num(row.qty ?? row[qtyName]);
  const documentLabel = resolveRecorderLabel(row);
  const { receiptQty, expenseQty, signedQty } = splitQty(qty, row.recordType, documentLabel);
  return { documentLabel, receiptQty, expenseQty, signedQty };
}

function isMeaningfulMovementEffect(effect: {
  receiptQty: number | null;
  expenseQty: number | null;
  signedQty: number;
}): boolean {
  return effect.receiptQty != null
    || effect.expenseQty != null
    || Math.abs(effect.signedQty) > 1e-9;
}

function isMeaningfulMovementRow(row: RawMovementRow, qtyName: string): boolean {
  return isMeaningfulMovementEffect(evaluateMovementRow(row, qtyName));
}

function isCustomerReturnDocument(label: string): boolean {
  const text = label.trim().toLowerCase();
  return text.includes('повернен') && text.includes('покупц');
}

function splitQty(
  qty: number,
  recordType: unknown,
  documentLabel = '',
): { receiptQty: number | null; expenseQty: number | null; signedQty: number } {
  if (isCustomerReturnDocument(documentLabel)) {
    const value = Math.abs(qty);
    if (value > 0) {
      return { receiptQty: null, expenseQty: -value, signedQty: value };
    }
    return { receiptQty: null, expenseQty: null, signedQty: 0 };
  }

  const type = String(recordType ?? '').trim().toLowerCase();
  const isReceipt = type === '+'
    || type === '1'
    || type === 'r'
    || type.includes('receipt')
    || type.includes('прих');
  const isExpense = type === '-'
    || type === '2'
    || type === 'e'
    || type.includes('expense')
    || type.includes('витрат');

  if (isReceipt) {
    const value = Math.abs(qty);
    return { receiptQty: value > 0 ? value : null, expenseQty: null, signedQty: value };
  }
  if (isExpense) {
    const value = Math.abs(qty);
    return { receiptQty: null, expenseQty: value > 0 ? value : null, signedQty: -value };
  }

  if (qty > 0) {
    return { receiptQty: qty, expenseQty: null, signedQty: qty };
  }
  if (qty < 0) {
    return { receiptQty: null, expenseQty: Math.abs(qty), signedQty: qty };
  }
  return { receiptQty: null, expenseQty: null, signedQty: 0 };
}

function assertYmd(value: string, field: string): string {
  if (!DATE_YMD.test(value)) {
    throw new ProductMovementsQueryError(`Поле ${field} має бути датою YYYY-MM-DD`);
  }
  return value;
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }

  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(raw);
  if (dotted) {
    return `${dotted[1]}.${dotted[2]}.${dotted[3]}`;
  }

  return raw;
}

function str(value: unknown): string {
  const id = unwrapDilovodId(value);
  return id || String(value ?? '').trim();
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Прибирає дату з назви документа — вона вже є в окремій колонці. */
function stripDateFromDocumentLabel(label: string): string {
  let result = label.trim();
  result = result.replace(
    /^\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\s+/,
    '',
  );
  result = result.replace(
    /^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\s+/,
    '',
  );
  result = result.replace(
    /\s+(?:від|от)\s+\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\s*$/iu,
    '',
  );
  return result.trim() || label.trim();
}

/** Назва документа з assembleLinks (__pr) або dot notation (number). */
function resolveRecorderLabel(row: RawMovementRow): string {
  const presentation = unwrapDilovodName(row.recorder__pr);
  if (presentation) return stripDateFromDocumentLabel(presentation);

  const number = String(row.recorderNumber ?? '').trim();
  if (number) return number;

  const recorderId = str(row.recorder);
  return recorderId || '—';
}
