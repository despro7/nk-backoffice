import { useMemo } from 'react';
import type {
  WarehouseStatementColumnHeaderStyle,
  WarehouseStatementExclusion,
  WarehouseStatementMetaResponse,
  WarehouseStatementQueryResponse,
  WarehouseStatementRow,
} from '@shared/types/warehouseStatement';
import { useHasTouchScreen } from '@/hooks/useTouchUi';
import { HierarchicalReportTable, type HierarchicalTableColumn, type HierarchicalTableRowView } from '../../shared/constructor';
import {
  groupMetricsForConstructor,
  metricColumnHeader,
  orderColumnsByConstructor,
  pruneRowsByExclusions,
  sumLeafValues,
  UNIT_COST_COLUMN_TOOLTIP,
  PROFITABILITY_COLUMN_TOOLTIP,
} from '../warehouseStatementUtils';

interface StatementTableProps {
  meta: WarehouseStatementMetaResponse | null;
  result: WarehouseStatementQueryResponse | null;
  loading: boolean;
  hasGenerated: boolean;
  columnHeaderStyle?: WarehouseStatementColumnHeaderStyle;
  pinTotals?: boolean;
  onPinTotalsChange?: (value: boolean) => void;
  /** Один склад у відборі — не показувати зайвий рядок групи складу. */
  collapseStorageGroup?: boolean;
  exclusions?: WarehouseStatementExclusion[];
  onExclude?: (row: HierarchicalTableRowView) => void;
}

function shiftRowDepth(row: WarehouseStatementRow, delta: number): WarehouseStatementRow {
  return {
    ...row,
    depth: Math.max(0, row.depth + delta),
    children: row.children?.map((child) => shiftRowDepth(child, delta)),
  };
}

function unwrapStorageGroups(
  rows: WarehouseStatementRow[],
  storageDimensionName: string,
): WarehouseStatementRow[] {
  const next: WarehouseStatementRow[] = [];
  for (const row of rows) {
    if (row.dimensionId === storageDimensionName && row.children && row.children.length > 0) {
      for (const child of unwrapStorageGroups(row.children, storageDimensionName)) {
        next.push(shiftRowDepth(child, -1));
      }
      continue;
    }
    next.push({
      ...row,
      children: row.children
        ? unwrapStorageGroups(row.children, storageDimensionName)
        : undefined,
    });
  }
  return next;
}

function toViewRows(
  rows: WarehouseStatementQueryResponse['rows'],
): HierarchicalTableRowView[] {
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    sku: row.sku,
    inactive: row.inactive,
    depth: row.depth,
    values: row.values,
    dimensionId: row.dimensionId,
    valueId: row.valueId,
    groupId: row.groupId,
    children: row.children ? toViewRows(row.children) : undefined,
  }));
}

export default function StatementTable({
  meta,
  result,
  loading,
  hasGenerated,
  columnHeaderStyle = 'short',
  pinTotals = true,
  onPinTotalsChange,
  collapseStorageGroup = false,
  exclusions,
  onExclude,
}: StatementTableProps) {
  const alwaysShowExclude = useHasTouchScreen();
  const columns = useMemo<HierarchicalTableColumn[]>(() => {
    if (!meta || !result) {
      return [];
    }
    const groups = groupMetricsForConstructor(meta);
    const groupByMetric = new Map<string, string>();
    for (const group of groups) {
      for (const metric of group.metrics) {
        groupByMetric.set(metric.id, group.title);
      }
    }
    const metricById = new Map(meta.metrics.map((metric) => [metric.id, metric]));
    const orderedIds = orderColumnsByConstructor(result.columns, meta);

    return orderedIds.map((id) => {
      const metric = metricById.get(id);
      const header = metric
        ? metricColumnHeader(metric, columnHeaderStyle)
        : { label: id };
      return {
        id,
        label: header.label,
        badge: header.badge,
        headerTooltip:
          metric?.kind === 'unitCost'
            ? UNIT_COST_COLUMN_TOOLTIP
            : metric?.kind === 'salesProfitability'
              ? PROFITABILITY_COLUMN_TOOLTIP
              : undefined,
        groupLabel: groupByMetric.get(id),
        format: metric?.format ?? 'qty',
        align: 'right' as const,
      };
    });
  }, [columnHeaderStyle, meta, result]);

  const rows = useMemo(() => {
    if (!result) {
      return [];
    }
    const storageDimensionName = meta?.resolved.storageDimensionName;
    const unwrapped =
      collapseStorageGroup && storageDimensionName
        ? unwrapStorageGroups(result.rows, storageDimensionName)
        : result.rows;
    const sourceRows = meta ? pruneRowsByExclusions(unwrapped, exclusions, meta) : unwrapped;
    const tree = toViewRows(sourceRows);
    const hasTotalRow = result.rows.some((row) => row.kind === 'total');
    const totals =
      exclusions && exclusions.length > 0
        ? sumLeafValues(sourceRows, meta ?? undefined)
        : result.totals;
    if (hasTotalRow || Object.keys(totals).length === 0) {
      return tree;
    }
    const totalRow: HierarchicalTableRowView = {
      id: '__totals__',
      kind: 'total',
      label: 'Разом',
      depth: 0,
      values: totals,
    };
    return [totalRow, ...tree];
  }, [collapseStorageGroup, exclusions, meta, result]);

  return (
    <HierarchicalReportTable
      columns={columns}
      rows={rows}
      loading={loading}
      pinTotals={pinTotals}
      onPinTotalsChange={onPinTotalsChange}
      alwaysShowExclude={alwaysShowExclude}
      onExclude={onExclude}
      emptyMessage={
        hasGenerated
          ? 'Немає даних для відображення'
          : 'Налаштуйте відбір і натисніть «Сформувати»'
      }
    />
  );
}
