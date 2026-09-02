/**
 * Координатор «Відомості по складу»: shape → BAT → ціни/розкладка витрати → дерево.
 */

import { prisma, logServer } from '../../lib/utils.js';
import { productsDilovodGateway } from '../../modules/Products/ProductsDilovodGateway.js';
import {
  WAREHOUSE_STATEMENT_BAT_SLOTS,
  WAREHOUSE_STATEMENT_EXPENSE_KINDS,
  WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID,
  WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID,
  WAREHOUSE_STATEMENT_SALES_VALUE_METRIC_IDS,
  WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP,
  WAREHOUSE_STATEMENT_VALUE_TYPES,
  warehouseStatementValueTypeIncludes,
  warehouseStatementSalesValueMetricId,
  warehouseStatementUnitCostMetricId,
  warehouseStatementVirtualBatFields,
  type WarehouseStatementBatColumnMeta,
  type WarehouseStatementBatSlot,
  type WarehouseStatementDimensionId,
  type WarehouseStatementDimensionMeta,
  type WarehouseStatementDirectoryItem,
  type WarehouseStatementExclusion,
  type WarehouseStatementExpenseKind,
  type WarehouseStatementMetaResponse,
  type WarehouseStatementMetricId,
  type WarehouseStatementMetricMeta,
  type WarehouseStatementQueryRequest,
  type WarehouseStatementQueryResponse,
  type WarehouseStatementRegisterField,
  type WarehouseStatementRegisterShape,
  type WarehouseStatementResolvedShapeNames,
  type WarehouseStatementResourceMeta,
  type WarehouseStatementResourceRole,
  type WarehouseStatementRow,
} from '../../../shared/types/warehouseStatement.js';
import { CATALOG_TRASH_ID } from '../../../shared/types/catalog.js';
import { isArchiveFolderName } from '../../modules/Products/ProductsTypes.js';
import { DilovodApiClient } from './DilovodApiClient.js';
import { dilovodMetadataService } from './DilovodMetadataService.js';
import type { DilovodRegisterField, DilovodRegisterShape } from './DilovodTypes.js';
import { unwrapDilovodId, unwrapDilovodName } from './DilovodUtils.js';

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;
const IL_CHUNK = 50;
const UNGROUPED_ID = '__ungrouped__';
const UNGROUPED_LABEL = 'Без групи';

const BAT_SLOT_LABEL: Record<WarehouseStatementBatSlot, string> = {
  start: 'початок',
  receipt: 'прихід',
  expense: 'витрата',
  final: 'кінець',
};

const EXPENSE_DOC_BY_KIND: Record<Exclude<WarehouseStatementExpenseKind, 'sale'>, string> = {
  goodMoving: 'documents.goodMoving',
  goodWriteOff: 'documents.goodWriteOff',
};

export class WarehouseStatementQueryError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'WarehouseStatementQueryError';
    this.statusCode = statusCode;
  }
}

type CatalogSortSeg = { sortOrder: number; name: string };

type CatalogNode = {
  id: string;
  parentId: string | null;
  name: string;
  sku: string | null;
  isGroup: boolean;
  sortOrder: number;
  treeRank: number;
  sortPath: CatalogSortSeg[];
  delMark: boolean;
};

type LeafRecord = {
  dimValues: Record<string, string>;
  labels: Record<string, string>;
  sku: string | null;
  goodName: string;
  groupId: string;
  groupLabel: string;
  groupRank: number;
  groupSortPath: CatalogSortSeg[];
  goodRank: number;
  inactive: boolean;
  metrics: Record<string, number>;
  expenseBreakdown?: Partial<Record<WarehouseStatementExpenseKind, number>>;
};

export class WarehouseStatementService {
  private readonly api: DilovodApiClient;

  constructor(apiClient?: DilovodApiClient) {
    this.api = apiClient ?? new DilovodApiClient();
  }

  async getMeta(): Promise<WarehouseStatementMetaResponse> {
    const shape = await dilovodMetadataService.getRegisterShape('goods');
    const slim = toSlimShape(shape);
    const resolved = resolveShapeNames(slim);
    const resources = slim.resources.map((field) => ({
      ...field,
      kind: 'resource' as const,
      role: classifyResourceRole(field),
    }));
    const dimensions = buildDimensionMeta(slim);
    const batColumns = buildBatColumns(slim);
    const metrics = buildMetricMeta(slim, resources, batColumns);
    const defaultGrouping = buildDefaultGrouping(dimensions, resolved);
    const defaultColumns = buildDefaultColumns(slim, resolved, batColumns);

    const storages = await this.loadStorages();
    const firms = await this.loadFirms();
    const priceTypes = await this.loadPriceTypes();
    const groups = await this.loadGroups();

    return {
      shape: slim,
      dimensions,
      resources,
      batColumns,
      metrics,
      resolved,
      storages,
      firms,
      groups,
      priceTypes,
      defaultGrouping,
      defaultColumns,
    };
  }

  async query(body: WarehouseStatementQueryRequest): Promise<WarehouseStatementQueryResponse> {
    const shape = await dilovodMetadataService.getRegisterShape('goods');
    const slim = toSlimShape(shape);
    const resolved = resolveShapeNames(slim);
    const qty = pickQtyResource(slim.resources);
    if (!qty) {
      throw new WarehouseStatementQueryError('Регістр goods без ресурсу кількості', 500);
    }

    const period = this.resolvePeriod(body, slim, qty.name);
    this.assertScope(body, resolved);

    const grouping = this.sanitizeGrouping(body.grouping, slim);
    const columns = this.sanitizeColumns(body.columns, slim, qty.name);
    const batFields = this.collectBatFields(slim, columns, qty.name);

    const dimNames = slim.dimensions.map((d) => d.name);
    const filters = this.buildBatFilters(body, slim, resolved);

    const batRows = await this.fetchBatRows({
      register: slim.registerName,
      startDate: period.startDate,
      endDate: period.endDate,
      dimensions: dimNames,
      fields: [...dimNames, ...batFields],
      filters,
    });

    const goodIds = uniqueStrings(
      resolved.goodsDimensionName
        ? batRows.map((row) => str(row[resolved.goodsDimensionName as string]))
        : [],
    );
    const catalog = await this.loadCatalogIndex(goodIds);
    const directoryLabels = await this.loadDirectoryLabels();
    await this.enrichDirectoryLabels(directoryLabels, batRows, slim);

    const pricesByGood = await this.loadSalesPrices(body.priceType, catalog, goodIds, columns);
    const expenseByKey = await this.loadExpenseBreakdown({
      body,
      period,
      resolved,
      columns,
      qtyName: qty.name,
    });

    const leaves = this.toLeaves({
      batRows,
      slim,
      resolved,
      qtyName: qty.name,
      columns,
      catalog,
      directoryLabels,
      pricesByGood,
      expenseByKey,
      expenseKinds: body.expenseKinds,
    });

    const filtered = this.filterLeaves(leaves, {
      hideZeroQty: body.hideZeroQty === true,
      qtyName: qty.name,
      expenseKinds: body.expenseKinds,
    });
    const scoped = this.applyExclusions(filtered, body.exclusions, resolved, catalog);

    const rows = this.buildTree(scoped, grouping, columns, slim, qty.name, resolved.goodsDimensionName);
    const totals = pickColumns(
      aggregateMetrics(scoped.map((leaf) => leaf.metrics), columns, slim, qty.name),
      columns,
    );

    return { rows, totals, grouping, columns, resolved };
  }

  private resolvePeriod(
    body: WarehouseStatementQueryRequest,
    slim: WarehouseStatementRegisterShape,
    qtyName: string,
  ): { startDate: string; endDate: string } {
    const period = body.period;
    if (!period || typeof period !== 'object' || !('mode' in period)) {
      throw new WarehouseStatementQueryError('Потрібно вказати період (dateRange або asOfDate)');
    }

    const movementOn = this.hasMovementColumns(body.columns, slim, qtyName);

    if (period.mode === 'asOfDate') {
      const day = assertYmd(period.asOfDate, 'asOfDate');
      const endDate = `${day} 23:59:59`;
      const startDate = movementOn ? `${day} 00:00:00` : endDate;
      return { startDate, endDate };
    }

    if (period.mode === 'dateRange') {
      const start = assertYmd(period.startDate, 'startDate');
      const end = assertYmd(period.endDate, 'endDate');
      if (start > end) {
        throw new WarehouseStatementQueryError('startDate не може бути пізніше endDate');
      }
      return { startDate: `${start} 00:00:00`, endDate: `${end} 23:59:59` };
    }

    throw new WarehouseStatementQueryError('Невідомий режим періоду');
  }

  private hasMovementColumns(
    columns: WarehouseStatementMetricId[] | undefined,
    slim: WarehouseStatementRegisterShape,
    qtyName: string,
  ): boolean {
    const ids = new Set(columns ?? []);
    if (ids.size === 0) return true;
    for (const resource of slim.resources) {
      const bat = warehouseStatementVirtualBatFields(resource.name);
      if (ids.has(bat.receipt) || ids.has(bat.expense)) return true;
    }
    if (ids.has(warehouseStatementSalesValueMetricId('receipt'))) return true;
    if (ids.has(warehouseStatementSalesValueMetricId('expense'))) return true;
    const qtyBat = warehouseStatementVirtualBatFields(qtyName);
    return ids.has(qtyBat.receipt) || ids.has(qtyBat.expense);
  }

  private assertScope(
    body: WarehouseStatementQueryRequest,
    resolved: WarehouseStatementResolvedShapeNames,
  ): void {
    const dimFilters = body.dimensionFilters ?? {};
    const goodsValues = resolved.goodsDimensionName
      ? normalizeIdList(dimFilters[resolved.goodsDimensionName])
      : [];
    const groupIds = normalizeIdList(body.groupIds);
    if (goodsValues.length > 0 || groupIds.length > 0) return;

    const storageValues = resolved.storageDimensionName
      ? normalizeIdList(dimFilters[resolved.storageDimensionName])
      : [];
    if (resolved.storageDimensionName) {
      if (storageValues.length > 0) return;
      throw new WarehouseStatementQueryError(
        'Без фільтра товару або групи вкажіть хоча б один склад (або оберіть групу / товар)',
      );
    }
    throw new WarehouseStatementQueryError(
      'Без виміру складу вкажіть товар або групу товарів — інакше вибірка занадто широка',
    );
  }

  private sanitizeGrouping(
    grouping: WarehouseStatementDimensionId[] | undefined,
    slim: WarehouseStatementRegisterShape,
  ): WarehouseStatementDimensionId[] {
    const allowed = new Set<string>([
      ...slim.dimensions.map((d) => d.name),
      WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP,
    ]);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of grouping ?? []) {
      if (!allowed.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  private sanitizeColumns(
    columns: WarehouseStatementMetricId[] | undefined,
    slim: WarehouseStatementRegisterShape,
    qtyName: string,
  ): WarehouseStatementMetricId[] {
    const allowed = new Set(allMetricIds(slim, qtyName));
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of columns ?? []) {
      if (!allowed.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    if (
      out.includes(WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID)
      && !out.includes(WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID)
    ) {
      const without = out.filter((id) => id !== WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID);
      if (without.length > 0) return without;
      return buildDefaultColumns(slim, resolveShapeNames(slim), buildBatColumns(slim));
    }
    if (out.length > 0) return out;
    return buildDefaultColumns(slim, resolveShapeNames(slim), buildBatColumns(slim));
  }

  private collectBatFields(
    slim: WarehouseStatementRegisterShape,
    columns: WarehouseStatementMetricId[],
    qtyName: string,
  ): string[] {
    const needed = new Set<string>([qtyName]);
    const colSet = new Set(columns);
    for (const resource of slim.resources) {
      const bat = warehouseStatementVirtualBatFields(resource.name);
      const unitCost = warehouseStatementUnitCostMetricId(resource.name);
      const usesResource =
        WAREHOUSE_STATEMENT_BAT_SLOTS.some((slot) => colSet.has(bat[slot]))
        || colSet.has(unitCost)
        || (classifyResourceRole(resource) === 'qty' && needsQtyForSynthetic(colSet))
        || (classifyResourceRole(resource) === 'money' && needsCostForSynthetic(colSet));
      if (usesResource) needed.add(resource.name);
    }
    if (needsQtyForSynthetic(colSet)) needed.add(qtyName);

    const fields: string[] = [];
    for (const name of needed) {
      const bat = warehouseStatementVirtualBatFields(name);
      fields.push(bat.start, bat.receipt, bat.expense, bat.final);
    }
    return [...new Set(fields)];
  }

  private buildBatFilters(
    body: WarehouseStatementQueryRequest,
    slim: WarehouseStatementRegisterShape,
    resolved: WarehouseStatementResolvedShapeNames,
  ): Array<{ alias: string; operator: string; value: unknown }> {
    const filters: Array<{ alias: string; operator: string; value: unknown }> = [];
    const dimNames = new Set(slim.dimensions.map((d) => d.name));
    const dimFilters = body.dimensionFilters ?? {};

    for (const [name, raw] of Object.entries(dimFilters)) {
      if (!dimNames.has(name)) continue;
      const values = normalizeIdList(raw);
      if (values.length === 0) continue;
      filters.push({
        alias: name,
        operator: values.length === 1 ? '=' : 'IL',
        value: values.length === 1 ? values[0] : values,
      });
    }

    const groupIds = normalizeIdList(body.groupIds);
    if (groupIds.length > 0 && resolved.goodsDimensionName) {
      filters.push({
        alias: resolved.goodsDimensionName,
        operator: 'ILH',
        value: groupIds,
      });
    }

    return filters;
  }

  private async fetchBatRows(params: {
    register: string;
    startDate: string;
    endDate: string;
    dimensions: string[];
    fields: string[];
    filters: Array<{ alias: string; operator: string; value: unknown }>;
  }): Promise<Record<string, unknown>[]> {
    const chunked = splitIlFilters(params.filters);
    const rows: Record<string, unknown>[] = [];
    for (const filters of chunked) {
      const part = await this.api.getGoodsBalanceAndTurnover({
        register: params.register,
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions: params.dimensions,
        fields: params.fields,
        filters,
      });
      rows.push(...part);
    }
    return rows;
  }

  private toLeaves(input: {
    batRows: Record<string, unknown>[];
    slim: WarehouseStatementRegisterShape;
    resolved: WarehouseStatementResolvedShapeNames;
    qtyName: string;
    columns: WarehouseStatementMetricId[];
    catalog: Map<string, CatalogNode>;
    directoryLabels: Map<string, string>;
    pricesByGood: Map<string, number>;
    expenseByKey: Map<string, Partial<Record<WarehouseStatementExpenseKind, number>>>;
    expenseKinds?: WarehouseStatementExpenseKind[];
  }): LeafRecord[] {
    const {
      batRows, slim, resolved, qtyName, columns, catalog, directoryLabels, pricesByGood, expenseByKey, expenseKinds,
    } = input;
    const goodsDim = resolved.goodsDimensionName;
    const storageDim = resolved.storageDimensionName;
    const qtyBat = warehouseStatementVirtualBatFields(qtyName);
    const wantBreakdown = (expenseKinds?.length ?? 0) > 0 && columns.includes(qtyBat.expense);

    return batRows.map((row) => {
      const dimValues: Record<string, string> = {};
      const labels: Record<string, string> = {};
      for (const dim of slim.dimensions) {
        const id = str(row[dim.name]);
        dimValues[dim.name] = id;
        labels[dim.name] = this.labelForDimension(dim, id, catalog, directoryLabels);
      }

      const goodId = goodsDim ? dimValues[goodsDim] : '';
      const node = goodId ? catalog.get(goodId) : undefined;
      const groupId = node?.parentId || UNGROUPED_ID;
      const groupNode = node?.parentId ? catalog.get(node.parentId) : undefined;

      const metrics = this.computeLeafMetrics({
        row,
        slim,
        qtyName,
        price: goodId ? pricesByGood.get(goodId) ?? 0 : 0,
      });

      const key = expenseKey(goodId, storageDim ? dimValues[storageDim] : '');
      const expenseBreakdown = wantBreakdown ? (expenseByKey.get(key) ?? {}) : undefined;

      return {
        dimValues,
        labels,
        sku: node?.sku ?? null,
        goodName: node?.name ?? '',
        groupId,
        groupLabel: groupNode?.name || UNGROUPED_LABEL,
        groupRank: groupNode?.treeRank ?? Number.MAX_SAFE_INTEGER,
        groupSortPath: groupNode?.sortPath ?? [],
        goodRank: node?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        inactive: isCatalogInactive(node, catalog),
        metrics,
        expenseBreakdown,
      };
    });
  }

  private computeLeafMetrics(input: {
    row: Record<string, unknown>;
    slim: WarehouseStatementRegisterShape;
    qtyName: string;
    price: number;
  }): Record<string, number> {
    const { row, slim, qtyName, price } = input;
    const values: Record<string, number> = {};
    const qtyBat = warehouseStatementVirtualBatFields(qtyName);

    const qtyFinal = num(row[qtyBat.final]);
    const qtyStart = num(row[qtyBat.start]);
    for (const resource of slim.resources) {
      const bat = warehouseStatementVirtualBatFields(resource.name);
      for (const slot of WAREHOUSE_STATEMENT_BAT_SLOTS) {
        values[bat[slot]] = num(row[bat[slot]]);
      }
      if (classifyResourceRole(resource) !== 'money') continue;
      const moneyFinal = num(row[bat.final]);
      const moneyStart = num(row[bat.start]);
      values[warehouseStatementUnitCostMetricId(resource.name)] = ratioOrFallback(
        qtyFinal,
        moneyFinal,
        qtyStart,
        moneyStart,
      );
    }

    for (const slot of WAREHOUSE_STATEMENT_BAT_SLOTS) {
      values[warehouseStatementSalesValueMetricId(slot)] = price * num(row[qtyBat[slot]]);
    }
    values[WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID] = price;
    const costResource = pickCostResource(slim.resources);
    const unitCost = costResource
      ? (values[warehouseStatementUnitCostMetricId(costResource.name)] ?? 0)
      : 0;
    const profitability = profitabilityRatio(price, unitCost);
    if (profitability != null) {
      values[WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID] = profitability;
    }
    return values;
  }

  private labelForDimension(
    dim: WarehouseStatementRegisterField,
    id: string,
    catalog: Map<string, CatalogNode>,
    directoryLabels: Map<string, string>,
  ): string {
    if (!id) return '—';
    const vt = (dim.valueType || '').toLowerCase();
    if (vt.includes(WAREHOUSE_STATEMENT_VALUE_TYPES.goods)) {
      return catalog.get(id)?.name || id;
    }
    return directoryLabels.get(id) || id;
  }

  private filterLeaves(
    leaves: LeafRecord[],
    opts: {
      hideZeroQty: boolean;
      qtyName: string;
      expenseKinds?: WarehouseStatementExpenseKind[];
    },
  ): LeafRecord[] {
    const qtyFinal = warehouseStatementVirtualBatFields(opts.qtyName).final;
    const kinds = (opts.expenseKinds ?? []).filter((k) =>
      (WAREHOUSE_STATEMENT_EXPENSE_KINDS as readonly string[]).includes(k),
    );

    return leaves.filter((leaf) => {
      if (opts.hideZeroQty && Math.abs(leaf.metrics[qtyFinal] ?? 0) < 1e-9) return false;
      if (kinds.length > 0) {
        const sum = kinds.reduce((acc, kind) => acc + (leaf.expenseBreakdown?.[kind] ?? 0), 0);
        if (Math.abs(sum) < 1e-9) return false;
      }
      return true;
    });
  }

  private applyExclusions(
    leaves: LeafRecord[],
    exclusions: WarehouseStatementExclusion[] | undefined,
    resolved: WarehouseStatementResolvedShapeNames,
    catalog: Map<string, CatalogNode>,
  ): LeafRecord[] {
    if (!exclusions?.length) {
      return leaves;
    }

    const groupIds = new Set<string>();
    const byDim = new Map<string, Set<string>>();
    for (const item of exclusions) {
      if (!item?.dimensionId || !item.valueId) continue;
      if (item.dimensionId === WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP) {
        groupIds.add(item.valueId);
        continue;
      }
      const set = byDim.get(item.dimensionId) ?? new Set<string>();
      set.add(item.valueId);
      byDim.set(item.dimensionId, set);
    }

    const goodsDim = resolved.goodsDimensionName;
    const excludedGoods = goodsDim ? (byDim.get(goodsDim) ?? new Set<string>()) : new Set<string>();

    const underExcludedGroup = (startId: string | null | undefined): boolean => {
      let current = startId ?? null;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        if (groupIds.has(current)) return true;
        seen.add(current);
        current = catalog.get(current)?.parentId ?? null;
      }
      return false;
    };

    return leaves.filter((leaf) => {
      const goodId = goodsDim ? leaf.dimValues[goodsDim] : '';
      if (goodId && excludedGoods.has(goodId)) return false;
      if (groupIds.size > 0) {
        const parent = goodId ? (catalog.get(goodId)?.parentId ?? leaf.groupId) : leaf.groupId;
        if (underExcludedGroup(parent === UNGROUPED_ID ? null : parent)) return false;
      }
      for (const [dim, ids] of byDim) {
        if (dim === goodsDim) continue;
        if (ids.has(leaf.dimValues[dim] ?? '')) return false;
      }
      return true;
    });
  }

  private buildTree(
    leaves: LeafRecord[],
    grouping: WarehouseStatementDimensionId[],
    columns: WarehouseStatementMetricId[],
    slim: WarehouseStatementRegisterShape,
    qtyName: string,
    goodsDimensionName?: string,
  ): WarehouseStatementRow[] {
    if (grouping.length === 0) {
      const sorted = [...leaves].sort((a, b) => compareCatalogLeaves(a, b));
      return sorted.map((leaf, index) => this.leafToRow(leaf, columns, index, 0, undefined, goodsDimensionName));
    }
    return this.nest(leaves, grouping, 0, columns, 'root', slim, qtyName, goodsDimensionName);
  }

  private nest(
    leaves: LeafRecord[],
    grouping: WarehouseStatementDimensionId[],
    depth: number,
    columns: WarehouseStatementMetricId[],
    path: string,
    slim: WarehouseStatementRegisterShape,
    qtyName: string,
    goodsDimensionName?: string,
  ): WarehouseStatementRow[] {
    if (depth >= grouping.length) {
      return leaves.map((leaf, index) => this.leafToRow(leaf, columns, index, depth, `${path}:${index}`, goodsDimensionName));
    }

    const dimId = grouping[depth];
    const buckets = new Map<string, LeafRecord[]>();
    for (const leaf of leaves) {
      const { valueId } = this.leafDim(leaf, dimId);
      const list = buckets.get(valueId) ?? [];
      list.push(leaf);
      buckets.set(valueId, list);
    }

    const orderedIds = [...buckets.keys()].sort((a, b) => {
      const left = buckets.get(a)?.[0];
      const right = buckets.get(b)?.[0];
      if (!left || !right) return 0;
      return compareBuckets(dimId, left, right, goodsDimensionName);
    });

    const nodes: WarehouseStatementRow[] = [];
    const lastLevel = depth === grouping.length - 1;
    for (const valueId of orderedIds) {
      const bucket = buckets.get(valueId);
      if (!bucket?.length) continue;
      const sample = bucket[0];
      const { label, sku } = this.leafDim(sample, dimId);
      const children = lastLevel
        ? undefined
        : this.nest(
          bucket,
          grouping,
          depth + 1,
          columns,
          `${path}/${dimId}:${valueId}`,
          slim,
          qtyName,
          goodsDimensionName,
        );

      const metrics = pickColumns(
        aggregateMetrics(bucket.map((b) => b.metrics), columns, slim, qtyName),
        columns,
      );
      const expenseBreakdown = mergeBreakdowns(bucket.map((b) => b.expenseBreakdown));
      const isGoodsLevel = Boolean(goodsDimensionName && dimId === goodsDimensionName);

      nodes.push({
        id: `${path}/${dimId}:${valueId}`,
        kind: lastLevel ? 'leaf' : 'group',
        dimensionId: dimId,
        valueId,
        groupId: sample.groupId !== UNGROUPED_ID ? sample.groupId : undefined,
        label,
        sku: isGoodsLevel ? sku : null,
        inactive: isGoodsLevel ? sample.inactive : undefined,
        depth,
        values: metrics,
        ...(expenseBreakdown ? { expenseBreakdown } : {}),
        ...(children && children.length > 0 ? { children } : {}),
      });
    }

    return nodes;
  }

  private leafDim(
    leaf: LeafRecord,
    dimId: WarehouseStatementDimensionId,
  ): { valueId: string; label: string; sku: string | null } {
    if (dimId === WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP) {
      return { valueId: leaf.groupId, label: leaf.groupLabel, sku: null };
    }
    const valueId = leaf.dimValues[dimId] || '—';
    return { valueId, label: leaf.labels[dimId] || valueId, sku: leaf.sku };
  }

  private leafToRow(
    leaf: LeafRecord,
    columns: WarehouseStatementMetricId[],
    index: number,
    depth: number,
    id?: string,
    goodsDimensionName?: string,
  ): WarehouseStatementRow {
    const goodId = goodsDimensionName ? leaf.dimValues[goodsDimensionName] : undefined;
    return {
      id: id ?? `leaf:${index}`,
      kind: 'leaf',
      dimensionId: goodsDimensionName,
      valueId: goodId,
      groupId: leaf.groupId !== UNGROUPED_ID ? leaf.groupId : undefined,
      depth,
      label: (goodsDimensionName ? leaf.labels[goodsDimensionName] : undefined)
        || Object.values(leaf.labels).filter(Boolean).join(' / ')
        || '—',
      sku: leaf.sku,
      inactive: leaf.inactive || undefined,
      values: pickColumns(leaf.metrics, columns),
      ...(leaf.expenseBreakdown ? { expenseBreakdown: leaf.expenseBreakdown } : {}),
    };
  }

  private async loadDirectoryLabels(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const storages = await this.loadStorages();
    const firms = await this.loadFirms();
    for (const item of [...storages, ...firms]) {
      if (item.id) map.set(item.id, item.name);
    }
    return map;
  }

  private async loadCatalogIndex(goodIds: string[]): Promise<Map<string, CatalogNode>> {
    const map = new Map<string, CatalogNode>();
    const groups = await prisma.catalogGood.findMany({
      where: { isGroup: true },
      select: { id: true, parentId: true, name: true, sku: true, isGroup: true, sortOrder: true, delMark: true },
    });
    for (const g of groups) {
      map.set(g.id, {
        id: g.id,
        parentId: g.parentId,
        name: g.name,
        sku: g.sku,
        isGroup: g.isGroup,
        sortOrder: g.sortOrder,
        treeRank: Number.MAX_SAFE_INTEGER,
        sortPath: [],
        delMark: g.delMark,
      });
    }
    assignGroupTreeRanks(map);
    assignGroupSortPaths(map);
    if (goodIds.length === 0) return map;
    const goods = await prisma.catalogGood.findMany({
      where: { id: { in: goodIds } },
      select: { id: true, parentId: true, name: true, sku: true, isGroup: true, sortOrder: true, delMark: true },
    });
    for (const g of goods) {
      map.set(g.id, {
        id: g.id,
        parentId: g.parentId,
        name: g.name,
        sku: g.sku,
        isGroup: g.isGroup,
        sortOrder: g.sortOrder,
        treeRank: Number.MAX_SAFE_INTEGER,
        sortPath: [],
        delMark: g.delMark,
      });
    }
    return map;
  }

  private async loadSalesPrices(
    priceType: string | undefined,
    catalog: Map<string, CatalogNode>,
    goodIds: string[],
    columns: WarehouseStatementMetricId[],
  ): Promise<Map<string, number>> {
    const needSales = columns.some(
      (id) =>
        id === WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID
        || id === WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID
        || id.startsWith('salesValue'),
    );
    const out = new Map<string, number>();
    if (!needSales || goodIds.length === 0) return out;

    await this.api.ensureReady();
    const config = this.api.getConfig();
    const wantedType = (priceType || config.mainPriceType || '').trim();

    const skus = uniqueStrings(
      goodIds.map((id) => catalog.get(id)?.sku).filter((sku): sku is string => Boolean(sku)),
    );
    const skuToGood = new Map<string, string>();
    for (const id of goodIds) {
      const sku = catalog.get(id)?.sku;
      if (sku) skuToGood.set(sku, id);
    }

    for (const chunk of chunkArray(skus, IL_CHUNK)) {
      const rows = await this.api.getGoodsWithPrices(chunk);
      for (const row of rows) {
        const sku = String(row.sku || '');
        const goodId = skuToGood.get(sku) || String(row.id || '');
        if (!goodId) continue;
        if (wantedType && String(row.priceType || '') !== wantedType) continue;
        out.set(goodId, num(row.price));
      }
    }
    return out;
  }

  private async loadExpenseBreakdown(input: {
    body: WarehouseStatementQueryRequest;
    period: { startDate: string; endDate: string };
    resolved: WarehouseStatementResolvedShapeNames;
    columns: WarehouseStatementMetricId[];
    qtyName: string;
  }): Promise<Map<string, Partial<Record<WarehouseStatementExpenseKind, number>>>> {
    const map = new Map<string, Partial<Record<WarehouseStatementExpenseKind, number>>>();
    const kinds = (input.body.expenseKinds ?? []).filter((k) =>
      (WAREHOUSE_STATEMENT_EXPENSE_KINDS as readonly string[]).includes(k),
    );
    const qtyExpense = warehouseStatementVirtualBatFields(input.qtyName).expense;
    if (kinds.length === 0 || !input.columns.includes(qtyExpense)) return map;

    const goodsDim = input.resolved.goodsDimensionName;
    const storageDim = input.resolved.storageDimensionName;
    const dimFilters = input.body.dimensionFilters ?? {};
    const goodsFilter = goodsDim ? normalizeIdList(dimFilters[goodsDim]) : [];
    const storageFilter = storageDim ? normalizeIdList(dimFilters[storageDim]) : [];
    const groupIds = normalizeIdList(input.body.groupIds);

    for (const kind of kinds) {
      const fromList = await this.documentSources(kind);
      for (const from of fromList) {
        const rows = await this.fetchDocumentGoods({
          from,
          startDate: input.period.startDate,
          endDate: input.period.endDate,
          goodsFilter,
          storageFilter,
          groupIds,
        });
        for (const row of rows) {
          const goodId = str(row.good);
          const storageId = str(row.storage);
          const key = expenseKey(goodId, storageId);
          const prev = map.get(key) ?? {};
          prev[kind] = (prev[kind] ?? 0) + num(row.qty);
          map.set(key, prev);
        }
      }
    }
    return map;
  }

  private async documentSources(kind: WarehouseStatementExpenseKind): Promise<string[]> {
    if (kind !== 'sale') return [EXPENSE_DOC_BY_KIND[kind]];
    try {
      const list = await dilovodMetadataService.getList({ q: 'documents.sale' });
      const names = Object.keys(list).filter((name) => isSaleExpenseDocument(name));
      return names.length > 0 ? names : ['documents.sale'];
    } catch (error) {
      logServer('WarehouseStatement: listMetadata для documents.sale*', error);
      return ['documents.sale'];
    }
  }

  private async fetchDocumentGoods(input: {
    from: string;
    startDate: string;
    endDate: string;
    goodsFilter: string[];
    storageFilter: string[];
    groupIds: string[];
  }): Promise<Array<{ good: unknown; storage: unknown; qty: unknown }>> {
    const filters: Array<{ alias: string; operator: string; value: unknown }> = [
      { alias: 'date', operator: '>=', value: input.startDate },
      { alias: 'date', operator: '<=', value: input.endDate },
      { alias: 'delMark', operator: '=', value: false },
    ];
    if (input.storageFilter.length === 1) {
      filters.push({ alias: 'storage', operator: '=', value: input.storageFilter[0] });
    } else if (input.storageFilter.length > 1) {
      filters.push({ alias: 'storage', operator: 'IL', value: input.storageFilter });
    }
    if (input.groupIds.length > 0) {
      filters.push({ alias: 'tpGoods.good', operator: 'ILH', value: input.groupIds });
    } else if (input.goodsFilter.length === 1) {
      filters.push({ alias: 'tpGoods.good', operator: '=', value: input.goodsFilter[0] });
    } else if (input.goodsFilter.length > 1) {
      filters.push({ alias: 'tpGoods.good', operator: 'IL', value: input.goodsFilter });
    }

    await this.api.ensureReady();
    const chunks = splitIlFilters(filters);
    const out: Array<{ good: unknown; storage: unknown; qty: unknown }> = [];
    for (const part of chunks) {
      try {
        const resp = await this.api.makeRequest<unknown>({
          version: '0.25',
          key: this.api.getApiKey(),
          action: 'request',
          params: {
            from: input.from,
            fields: {
              'tpGoods.good': 'good',
              'tpGoods.qty': 'qty',
              storage: 'storage',
            },
            filters: part,
          },
        });
        if (resp && typeof resp === 'object' && 'error' in resp && (resp as { error?: unknown }).error) {
          throw new Error(String((resp as { error: unknown }).error));
        }
        const rows = Array.isArray(resp) ? resp : [];
        out.push(...rows);
      } catch (error) {
        logServer(`WarehouseStatement: documents ${input.from}`, error);
      }
    }
    return out;
  }

  private async loadStorages() {
    try {
      const rows = await this.api.getStorages();
      return rows.map((s) => {
        const id = unwrapDilovodId(s.id) || String(s.id ?? '');
        return {
          id,
          name: unwrapDilovodName(s.name) || id,
        };
      }).filter((item) => item.id);
    } catch (error) {
      logServer('WarehouseStatement: склади', error);
      return [];
    }
  }

  private async enrichDirectoryLabels(
    labels: Map<string, string>,
    batRows: Record<string, unknown>[],
    slim: WarehouseStatementRegisterShape,
  ): Promise<void> {
    const missing = new Set<string>();
    for (const dim of slim.dimensions) {
      const wanted =
        warehouseStatementValueTypeIncludes(dim.valueType, WAREHOUSE_STATEMENT_VALUE_TYPES.storages)
        || warehouseStatementValueTypeIncludes(dim.valueType, WAREHOUSE_STATEMENT_VALUE_TYPES.firms);
      if (!wanted) continue;
      for (const row of batRows) {
        const id = str(row[dim.name]);
        if (id && !labels.has(id)) missing.add(id);
      }
    }
    if (missing.size === 0) return;

    const ids = [...missing];
    for (const from of ['catalogs.storages', 'catalogs.firms'] as const) {
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
              fields: { id: 'id', name: 'name', id__pr: 'id__pr' },
              filters: [{ alias: 'id', operator: 'IL', value: chunk }],
            },
          });
          const rows = Array.isArray(resp) ? resp : [];
          for (const row of rows as Array<{ id?: unknown; name?: unknown; id__pr?: unknown }>) {
            const id = unwrapDilovodId(row.id);
            const name = unwrapDilovodName(row.name) || unwrapDilovodName(row.id__pr);
            if (id && name) labels.set(id, name);
          }
        }
      } catch (error) {
        logServer(`WarehouseStatement: назви ${from}`, error);
      }
    }
  }

  private async loadFirms() {
    try {
      const rows = await this.api.getFirms();
      return rows.map((f: { id?: unknown; name?: unknown }) => {
        const id = unwrapDilovodId(f.id) || String(f.id ?? '');
        return {
          id,
          name: unwrapDilovodName(f.name) || id,
        };
      }).filter((f: { id: string }) => f.id);
    } catch (error) {
      logServer('WarehouseStatement: фірми', error);
      return [];
    }
  }

  private async loadPriceTypes() {
    try {
      const rows = await productsDilovodGateway.fetchCachedDict('priceTypes');
      return rows.map((p) => ({ id: p.id, name: p.name || p.id }));
    } catch (error) {
      logServer('WarehouseStatement: типи цін', error);
      return [];
    }
  }

  private async loadGroups() {
    try {
      const rows = await prisma.catalogGood.findMany({
        where: { isGroup: true, delMark: false },
        select: { id: true, name: true, parentId: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return flattenCatalogGroups(rows);
    } catch (error) {
      logServer('WarehouseStatement: групи catalog_goods', error);
      return [];
    }
  }
}

export const warehouseStatementService = new WarehouseStatementService();

function isCatalogRootParent(parentId: string | null | undefined): boolean {
  return !parentId || parentId === '0';
}

function isCatalogInactive(
  node: CatalogNode | undefined,
  catalog: Map<string, CatalogNode>,
): boolean {
  if (!node) return true;
  if (node.delMark) return true;
  if (node.parentId === CATALOG_TRASH_ID) return true;
  const parent = node.parentId ? catalog.get(node.parentId) : undefined;
  if (parent && isArchiveFolderName(parent.name)) return true;
  return false;
}

function compareUk(a: string, b: string): number {
  return a.localeCompare(b, 'uk', { numeric: true, sensitivity: 'base' });
}

function compareSortPath(a: CatalogSortSeg[], b: CatalogSortSeg[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left && !right) return 0;
    if (!left) return -1;
    if (!right) return 1;
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    const byName = compareUk(left.name, right.name);
    if (byName !== 0) return byName;
  }
  return 0;
}

function compareCatalogLeaves(a: LeafRecord, b: LeafRecord): number {
  const byGroup = compareSortPath(a.groupSortPath, b.groupSortPath);
  if (byGroup !== 0) return byGroup;
  if (a.goodRank !== b.goodRank) return a.goodRank - b.goodRank;
  return compareUk(a.goodName || a.sku || '', b.goodName || b.sku || '');
}

function compareBuckets(
  dimId: WarehouseStatementDimensionId,
  a: LeafRecord,
  b: LeafRecord,
  goodsDimensionName?: string,
): number {
  if (dimId === WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP) {
    if (a.groupId === UNGROUPED_ID && b.groupId !== UNGROUPED_ID) return 1;
    if (b.groupId === UNGROUPED_ID && a.groupId !== UNGROUPED_ID) return -1;
    const byPath = compareSortPath(a.groupSortPath, b.groupSortPath);
    if (byPath !== 0) return byPath;
    return compareUk(a.groupLabel, b.groupLabel);
  }
  if (goodsDimensionName && dimId === goodsDimensionName) {
    return compareCatalogLeaves(a, b);
  }
  const labelA = a.labels[dimId] || a.dimValues[dimId] || '';
  const labelB = b.labels[dimId] || b.dimValues[dimId] || '';
  return compareUk(labelA, labelB);
}

function assignGroupTreeRanks(map: Map<string, CatalogNode>): void {
  const groups = [...map.values()]
    .filter((node) => node.isGroup)
    .map((node) => ({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      sortOrder: node.sortOrder,
    }));
  flattenCatalogGroups(groups).forEach((item, index) => {
    const node = map.get(item.id);
    if (node) {
      node.treeRank = index;
    }
  });
}

function assignGroupSortPaths(map: Map<string, CatalogNode>): void {
  const memo = new Map<string, CatalogSortSeg[]>();
  const pathOf = (id: string | null | undefined): CatalogSortSeg[] => {
    if (!id || isCatalogRootParent(id)) return [];
    const cached = memo.get(id);
    if (cached) return cached;
    const node = map.get(id);
    if (!node) return [];
    const next = [...pathOf(node.parentId), { sortOrder: node.sortOrder, name: node.name }];
    memo.set(id, next);
    return next;
  };
  for (const node of map.values()) {
    if (node.isGroup) {
      node.sortPath = pathOf(node.id);
    }
  }
}

function flattenCatalogGroups(
  rows: Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>,
): WarehouseStatementDirectoryItem[] {
  const byParent = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = isCatalogRootParent(row.parentId) ? '__root__' : row.parentId!;
    const list = byParent.get(key) ?? [];
    list.push(row);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return compareUk(a.name, b.name);
    });
  }

  const out: WarehouseStatementDirectoryItem[] = [];
  const seen = new Set<string>();

  const walk = (parentKey: string, depth: number) => {
    const children = byParent.get(parentKey) ?? [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push({
        id: child.id,
        name: child.name,
        parentId: isCatalogRootParent(child.parentId) ? null : child.parentId,
        depth,
      });
      walk(child.id, depth + 1);
    }
  };

  walk('__root__', 0);

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      id: row.id,
      name: row.name,
      parentId: isCatalogRootParent(row.parentId) ? null : row.parentId,
      depth: 0,
    });
    walk(row.id, 1);
  }

  return out;
}

function toSlimShape(shape: DilovodRegisterShape): WarehouseStatementRegisterShape {
  const slimField = (f: DilovodRegisterField): WarehouseStatementRegisterField => ({
    name: f.name,
    presentation: f.presentation,
    valueType: f.valueType,
    kind: f.kind,
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

function resolveShapeNames(shape: WarehouseStatementRegisterShape): WarehouseStatementResolvedShapeNames {
  const byVt = (vt: string) =>
    shape.dimensions.find((d) => warehouseStatementValueTypeIncludes(d.valueType, vt))?.name;
  const qty = pickQtyResource(shape.resources);
  return {
    ...(byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.goods)
      ? { goodsDimensionName: byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.goods) }
      : {}),
    ...(byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.storages)
      ? { storageDimensionName: byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.storages) }
      : {}),
    ...(byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.firms)
      ? { firmDimensionName: byVt(WAREHOUSE_STATEMENT_VALUE_TYPES.firms) }
      : {}),
    ...(qty ? { qtyResourceName: qty.name } : {}),
  };
}

function pickQtyResource(
  resources: WarehouseStatementRegisterField[],
): WarehouseStatementRegisterField | undefined {
  const byName = resources.find((f) => f.name === 'qty');
  if (byName) return byName;
  const byRole = resources.find((f) => classifyResourceRole(f) === 'qty');
  return byRole ?? resources[0];
}

function pickCostResource(
  resources: WarehouseStatementRegisterField[],
): WarehouseStatementRegisterField | undefined {
  const money = resources.filter((field) => classifyResourceRole(field) === 'money');
  const byName = money.find((field) => field.name.toLowerCase() === 'amount');
  if (byName) return byName;
  const byPresentation = money.find((field) => (field.presentation || '').toLowerCase().includes('собіварт'));
  return byPresentation ?? money[0];
}

function classifyResourceRole(field: WarehouseStatementRegisterField): WarehouseStatementResourceRole {
  const name = field.name.toLowerCase();
  const vt = (field.valueType || '').toLowerCase();
  const presentation = (field.presentation || '').toLowerCase();
  if (name === 'qty' || vt.includes('qty') || presentation.includes('кільк')) return 'qty';
  if (
    ['amount', 'cost', 'sum', 'price', 'money'].some((h) => name === h || name.includes(h))
    || ['money', 'amount', 'currency'].some((h) => vt.includes(h))
    || presentation.includes('собіварт')
    || presentation.includes('сума')
  ) {
    return 'money';
  }
  return 'other';
}

function buildDimensionMeta(shape: WarehouseStatementRegisterShape): WarehouseStatementDimensionMeta[] {
  const dims: WarehouseStatementDimensionMeta[] = shape.dimensions.map((d) => ({
    id: d.name,
    source: 'register',
    presentation: d.presentation || d.name,
    valueType: d.valueType,
  }));
  dims.push({
    id: WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP,
    source: 'synthetic',
    presentation: 'Група товарів',
  });
  return dims;
}

function buildBatColumns(shape: WarehouseStatementRegisterShape): WarehouseStatementBatColumnMeta[] {
  const cols: WarehouseStatementBatColumnMeta[] = [];
  for (const resource of shape.resources) {
    const bat = warehouseStatementVirtualBatFields(resource.name);
    for (const slot of WAREHOUSE_STATEMENT_BAT_SLOTS) {
      cols.push({
        id: bat[slot],
        resourceName: resource.name,
        slot,
        presentation: `${resource.presentation} (${BAT_SLOT_LABEL[slot]})`,
      });
    }
  }
  return cols;
}

function buildMetricMeta(
  shape: WarehouseStatementRegisterShape,
  resources: WarehouseStatementResourceMeta[],
  batColumns: WarehouseStatementBatColumnMeta[],
): WarehouseStatementMetricMeta[] {
  const metrics: WarehouseStatementMetricMeta[] = batColumns.map((col) => {
    const role = resources.find((r) => r.name === col.resourceName)?.role ?? 'other';
    return {
      id: col.id,
      kind: 'bat',
      presentation: col.presentation,
      format: role === 'qty' ? 'qty' : 'money',
      resourceName: col.resourceName,
      slot: col.slot,
    };
  });

  for (const resource of resources) {
    if (resource.role !== 'money') continue;
    metrics.push({
      id: warehouseStatementUnitCostMetricId(resource.name),
      kind: 'unitCost',
      presentation: `Собівартість од. (${resource.presentation})`,
      format: 'money',
      resourceName: resource.name,
    });
  }

  for (const slot of WAREHOUSE_STATEMENT_BAT_SLOTS) {
    metrics.push({
      id: warehouseStatementSalesValueMetricId(slot),
      kind: 'salesValue',
      presentation: `Вартість продажу (${BAT_SLOT_LABEL[slot]})`,
      format: 'money',
      slot,
    });
  }
  metrics.push({
    id: WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID,
    kind: 'salesUnitPrice',
    presentation: 'Ціна продажу',
    format: 'money',
  });
  metrics.push({
    id: WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID,
    kind: 'salesProfitability',
    presentation: 'Рентабельність',
    format: 'percent',
  });
  return metrics;
}

function buildDefaultGrouping(
  dimensions: WarehouseStatementDimensionMeta[],
  resolved: WarehouseStatementResolvedShapeNames,
): WarehouseStatementDimensionId[] {
  const ids = new Set(dimensions.map((d) => d.id));
  const out: WarehouseStatementDimensionId[] = [];
  if (resolved.storageDimensionName && ids.has(resolved.storageDimensionName)) {
    out.push(resolved.storageDimensionName);
  }
  if (ids.has(WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP)) {
    out.push(WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP);
  }
  if (resolved.goodsDimensionName && ids.has(resolved.goodsDimensionName)) {
    out.push(resolved.goodsDimensionName);
  }
  return out;
}

function isCurrencyResourcePresentation(presentation: string | undefined): boolean {
  return /валют/i.test(presentation || '');
}

function defaultConstructorResources(
  slim: WarehouseStatementRegisterShape,
  resolved: WarehouseStatementResolvedShapeNames,
): WarehouseStatementRegisterField[] {
  const byTitle = slim.resources.filter((resource) => {
    const title = (resource.presentation || '').trim();
    if (!title || isCurrencyResourcePresentation(title)) return false;
    return title === 'Кількість' || title === 'Собівартість';
  });
  if (byTitle.length > 0) {
    return [...byTitle].sort((left, right) => {
      const leftRank = classifyResourceRole(left) === 'qty' ? 0 : 1;
      const rightRank = classifyResourceRole(right) === 'qty' ? 0 : 1;
      return leftRank - rightRank;
    });
  }

  const fallback: WarehouseStatementRegisterField[] = [];
  const qty = slim.resources.find((resource) => resource.name === resolved.qtyResourceName);
  if (qty) fallback.push(qty);
  const cost = slim.resources.find(
    (resource) =>
      classifyResourceRole(resource) === 'money' && !isCurrencyResourcePresentation(resource.presentation),
  );
  if (cost) fallback.push(cost);
  return fallback;
}

function buildDefaultColumns(
  slim: WarehouseStatementRegisterShape,
  resolved: WarehouseStatementResolvedShapeNames,
  batColumns: WarehouseStatementBatColumnMeta[],
): WarehouseStatementMetricId[] {
  const ids: WarehouseStatementMetricId[] = [];
  for (const resource of defaultConstructorResources(slim, resolved)) {
    ids.push(
      ...batColumns.filter((column) => column.resourceName === resource.name).map((column) => column.id),
    );
    if (classifyResourceRole(resource) === 'money') {
      ids.push(warehouseStatementUnitCostMetricId(resource.name));
    }
  }
  if (ids.length > 0) return ids;
  return batColumns.slice(0, 4).map((column) => column.id);
}

function allMetricIds(slim: WarehouseStatementRegisterShape, qtyName: string): string[] {
  const ids: string[] = [];
  for (const resource of slim.resources) {
    const bat = warehouseStatementVirtualBatFields(resource.name);
    ids.push(bat.start, bat.receipt, bat.expense, bat.final);
    if (classifyResourceRole(resource) === 'money') {
      ids.push(warehouseStatementUnitCostMetricId(resource.name));
    }
  }
  ids.push(...Object.values(WAREHOUSE_STATEMENT_SALES_VALUE_METRIC_IDS));
  ids.push(WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID);
  ids.push(WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID);
  void qtyName;
  return ids;
}

function needsQtyForSynthetic(colSet: Set<string>): boolean {
  if (colSet.has(WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID)) return true;
  if (colSet.has(WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID)) return true;
  return WAREHOUSE_STATEMENT_BAT_SLOTS.some((slot) => colSet.has(warehouseStatementSalesValueMetricId(slot)));
}

function needsCostForSynthetic(colSet: Set<string>): boolean {
  return colSet.has(WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID);
}

function assertYmd(value: string | undefined, field: string): string {
  if (!value || !DATE_YMD.test(value)) {
    throw new WarehouseStatementQueryError(`Поле ${field} має бути датою YYYY-MM-DD`);
  }
  return value;
}

function normalizeIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return uniqueStrings(raw.map((v) => String(v ?? '').trim()).filter(Boolean));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function str(value: unknown): string {
  const id = unwrapDilovodId(value);
  if (id) return id;
  if (value == null) return '';
  return String(value).trim();
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function expenseKey(goodId: string, storageId: string): string {
  return `${goodId}::${storageId}`;
}

function isSaleExpenseDocument(name: string): boolean {
  if (!name.startsWith('documents.sale')) return false;
  if (name.startsWith('documents.saleOrder')) return false;
  if (name.startsWith('documents.saleReturn')) return false;
  return true;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length > 0 ? out : [[]];
}

function splitIlFilters(
  filters: Array<{ alias: string; operator: string; value: unknown }>,
): Array<Array<{ alias: string; operator: string; value: unknown }>> {
  const oversized = filters.find(
    (f) => f.operator === 'IL' && Array.isArray(f.value) && (f.value as unknown[]).length > IL_CHUNK,
  );
  if (!oversized || !Array.isArray(oversized.value)) return [filters];
  const rest = filters.filter((f) => f !== oversized);
  return chunkArray(oversized.value as unknown[], IL_CHUNK).map((chunk) => [
    ...rest,
    { ...oversized, value: chunk },
  ]);
}

function pickColumns(
  metrics: Record<string, number>,
  columns: WarehouseStatementMetricId[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of columns) {
    const value = metrics[id];
    if (id === WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID) {
      if (value == null || !Number.isFinite(value)) continue;
      out[id] = value;
      continue;
    }
    out[id] = value ?? 0;
  }
  return out;
}

function mergeBreakdowns(
  parts: Array<Partial<Record<WarehouseStatementExpenseKind, number>> | undefined>,
): Partial<Record<WarehouseStatementExpenseKind, number>> | undefined {
  const out: Partial<Record<WarehouseStatementExpenseKind, number>> = {};
  let any = false;
  for (const part of parts) {
    if (!part) continue;
    for (const kind of WAREHOUSE_STATEMENT_EXPENSE_KINDS) {
      if (part[kind] == null) continue;
      out[kind] = (out[kind] ?? 0) + (part[kind] ?? 0);
      any = true;
    }
  }
  return any ? out : undefined;
}

function isRatioMetricId(id: string): boolean {
  return (
    id.endsWith('UnitCost')
    || id === WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID
    || id === WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID
  );
}

/** Кількість менша за це вважаємо нулем: Dilovod часто лишає float-пил (1e-15) при нульовому залишку. */
const QTY_EPSILON = 1e-6;

function hasMeaningfulQty(qty: number): boolean {
  return Math.abs(qty) > QTY_EPSILON;
}

/** Не рахуємо, якщо собівартість ≤ 0 або немає ціни продажу. */
function profitabilityRatio(salePrice: number, unitCost: number): number | undefined {
  if (!Number.isFinite(salePrice) || !Number.isFinite(unitCost)) return undefined;
  if (unitCost <= 0) return undefined;
  if (Math.abs(salePrice) < 1e-9) return undefined;
  return (salePrice - unitCost) / salePrice;
}

function ratioOrFallback(
  qtyFinal: number,
  moneyFinal: number,
  qtyStart: number,
  moneyStart: number,
): number {
  if (hasMeaningfulQty(qtyFinal)) return moneyFinal / qtyFinal;
  if (hasMeaningfulQty(qtyStart)) return moneyStart / qtyStart;
  return 0;
}

function aggregateMetrics(
  list: Record<string, number>[],
  columns: WarehouseStatementMetricId[],
  slim?: WarehouseStatementRegisterShape,
  qtyName?: string,
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const metrics of list) {
    for (const [id, value] of Object.entries(metrics)) {
      if (isRatioMetricId(id)) continue;
      sums[id] = (sums[id] ?? 0) + (value ?? 0);
    }
  }

  const out: Record<string, number> = {};
  for (const id of columns) {
    out[id] = sums[id] ?? 0;
  }

  const qty = qtyName
    ?? slim?.resources.find((field) => classifyResourceRole(field) === 'qty')?.name;
  const qtyBat = qty ? warehouseStatementVirtualBatFields(qty) : undefined;
  const qtyFinal = qtyBat ? (sums[qtyBat.final] ?? 0) : 0;
  const qtyStart = qtyBat ? (sums[qtyBat.start] ?? 0) : 0;

  for (const id of columns) {
    if (id === WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID) {
      out[id] = ratioOrFallback(
        qtyFinal,
        sums[warehouseStatementSalesValueMetricId('final')] ?? 0,
        qtyStart,
        sums[warehouseStatementSalesValueMetricId('start')] ?? 0,
      );
      continue;
    }
    if (id === WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID) {
      const salePrice = ratioOrFallback(
        qtyFinal,
        sums[warehouseStatementSalesValueMetricId('final')] ?? 0,
        qtyStart,
        sums[warehouseStatementSalesValueMetricId('start')] ?? 0,
      );
      const costResource = slim ? pickCostResource(slim.resources) : undefined;
      const moneyBat = costResource ? warehouseStatementVirtualBatFields(costResource.name) : undefined;
      const unitCost = moneyBat
        ? ratioOrFallback(
          qtyFinal,
          sums[moneyBat.final] ?? 0,
          qtyStart,
          sums[moneyBat.start] ?? 0,
        )
        : 0;
      const profitability = profitabilityRatio(salePrice, unitCost);
      if (profitability == null) {
        delete out[id];
      } else {
        out[id] = profitability;
      }
      continue;
    }
    if (!id.endsWith('UnitCost')) continue;
    const resourceName = id.slice(0, -'UnitCost'.length);
    const moneyBat = warehouseStatementVirtualBatFields(resourceName);
    out[id] = ratioOrFallback(
      qtyFinal,
      sums[moneyBat.final] ?? 0,
      qtyStart,
      sums[moneyBat.start] ?? 0,
    );
  }

  return out;
}
