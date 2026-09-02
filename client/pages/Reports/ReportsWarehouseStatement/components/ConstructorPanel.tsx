import { useMemo, useState } from 'react';
import { Button, Checkbox, Chip, Radio, RadioGroup, Select, SelectItem, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  WAREHOUSE_STATEMENT_COLUMN_HEADER_STYLES,
  WAREHOUSE_STATEMENT_EXPENSE_KINDS,
  WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID,
  WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP,
  WAREHOUSE_STATEMENT_VALUE_TYPES,
  warehouseStatementValueTypeIncludes,
  type WarehouseStatementColumnHeaderStyle,
  type WarehouseStatementConstructorPreset,
  type WarehouseStatementExclusion,
  type WarehouseStatementExpenseKind,
  type WarehouseStatementMetaResponse,
} from '@shared/types/warehouseStatement';
import {
  ConstructorGroupingChips,
  ReportConstructorPanel,
  type ConstructorTabKey,
} from '../../shared/constructor';
import ReportMultiSelectFilter from '../../shared/filters/ReportMultiSelectFilter';
import {
  constructorMetricCheckboxLabel,
  directoryItemsForDimension,
  EXPENSE_KIND_LABELS,
  groupMetricsForConstructor,
  orderColumnsByConstructor,
  PROFITABILITY_COLUMN_TOOLTIP,
  syncProfitabilityColumn,
  UNIT_COST_COLUMN_TOOLTIP,
} from '../warehouseStatementUtils';

const HEADER_STYLE_LABELS: Record<WarehouseStatementColumnHeaderStyle, string> = {
  full: 'Повні назви',
  short: 'Короткі (Початок, Прихід…)',
};

interface ConstructorPanelProps {
  meta: WarehouseStatementMetaResponse;
  draft: WarehouseStatementConstructorPreset;
  isOpen: boolean;
  onToggle: () => void;
  onDimensionFilterChange: (dimensionId: string, values: string[]) => void;
  onGroupIdsChange: (ids: string[]) => void;
  onExpenseKindsChange: (kinds: WarehouseStatementExpenseKind[]) => void;
  onPriceTypeChange: (priceType: string | undefined) => void;
  onHideZeroQtyChange: (value: boolean) => void;
  onGroupingChange: (ids: string[]) => void;
  onColumnsChange: (ids: string[]) => void;
  onColumnHeaderStyleChange: (style: WarehouseStatementColumnHeaderStyle) => void;
  onPinTotalsChange: (value: boolean) => void;
  onExclusionsChange: (items: WarehouseStatementExclusion[]) => void;
  onClearExclusions: () => void;
}

export default function ConstructorPanel({
  meta,
  draft,
  isOpen,
  onToggle,
  onDimensionFilterChange,
  onGroupIdsChange,
  onExpenseKindsChange,
  onPriceTypeChange,
  onHideZeroQtyChange,
  onGroupingChange,
  onColumnsChange,
  onColumnHeaderStyleChange,
  onPinTotalsChange,
  onExclusionsChange,
  onClearExclusions,
}: ConstructorPanelProps) {
  const [tab, setTab] = useState<ConstructorTabKey>('selection');

  const registerDimensions = useMemo(
    () => meta.dimensions.filter((item) => item.source === 'register'),
    [meta.dimensions],
  );

  const groupingItems = useMemo(
    () => meta.dimensions.map((item) => ({ id: item.id, label: item.presentation })),
    [meta.dimensions],
  );

  const selectedGrouping = useMemo(
    () =>
      draft.grouping
        .map((id) => groupingItems.find((item) => item.id === id))
        .filter((item): item is { id: string; label: string } => Boolean(item)),
    [draft.grouping, groupingItems],
  );
  const availableGrouping = groupingItems.filter((item) => !draft.grouping.includes(item.id));

  const columnGroups = useMemo(() => groupMetricsForConstructor(meta), [meta]);
  const selectedColumns = new Set(draft.columns);
  const headerStyle = draft.columnHeaderStyle ?? 'short';

  const collapsedChips = useMemo(() => {
    const chips: Array<{ key: string; title?: string; value: string }> = [];
    for (const dimension of registerDimensions) {
      const values = draft.dimensionFilters?.[dimension.id] ?? [];
      if (values.length === 0) {
        continue;
      }
      const items = directoryItemsForDimension(dimension.id, meta);
      const names = values
        .map((id) => items.find((item) => item.id === id)?.name ?? id)
        .slice(0, 3);
      const extra = values.length > 3 ? ` +${values.length - 3}` : '';
      chips.push({
        key: dimension.id,
        title: dimension.presentation,
        value: `${names.join(', ')}${extra}`,
      });
    }
    if (draft.groupIds && draft.groupIds.length > 0) {
      chips.push({ key: 'groups', title: 'Групи', value: String(draft.groupIds.length) });
    }
    if (draft.grouping.length > 0) {
      const labels = draft.grouping
        .map((id) => meta.dimensions.find((item) => item.id === id)?.presentation ?? id)
        .join(' → ');
      chips.push({ key: 'grouping', title: 'Групування результатів', value: labels });
    }
    chips.push({ key: 'columns', title: 'Колонок', value: String(draft.columns.length) });
    if (draft.hideZeroQty) {
      chips.push({ key: 'zeros', value: 'Без нульових залишків' });
    }
    return chips;
  }, [draft, meta, registerDimensions]);

  const setOrderedColumns = (ids: string[]) => {
    onColumnsChange(orderColumnsByConstructor(syncProfitabilityColumn(draft.columns, ids), meta));
  };

  const toggleGroupColumns = (metricIds: string[], selected: boolean) => {
    if (selected) {
      const next = [...draft.columns];
      for (const id of metricIds) {
        if (!next.includes(id)) {
          next.push(id);
        }
      }
      setOrderedColumns(next);
      return;
    }
    const drop = new Set(metricIds);
    setOrderedColumns(draft.columns.filter((id) => !drop.has(id)));
  };

  const selection = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {registerDimensions.map((dimension) => {
          if (warehouseStatementValueTypeIncludes(dimension.valueType, WAREHOUSE_STATEMENT_VALUE_TYPES.goods)) {
            return null;
          }
          const options = directoryItemsForDimension(dimension.id, meta).map((item) => ({
            key: item.id,
            label: item.name,
          }));
          if (options.length === 0) {
            return null;
          }
          return (
            <ReportMultiSelectFilter
              key={dimension.id}
              ariaLabel={dimension.presentation}
              placeholder={dimension.presentation + ' (всі)'}
              selectedKeys={new Set(draft.dimensionFilters?.[dimension.id] ?? [])}
              onChange={(keys) => onDimensionFilterChange(dimension.id, Array.from(keys))}
              options={options}
              iconName={dimension.id === 'firm' ? 'users' : 'warehouse'}
              className="w-full"
              size="md"
            />
          );
        })}

        {meta.groups.length > 0 ? (
          <ReportMultiSelectFilter
            ariaLabel="Групи товарів"
            placeholder="Групи товарів (всі)"
            selectedKeys={new Set(draft.groupIds ?? [])}
            onChange={(keys) => onGroupIdsChange(Array.from(keys))}
            options={meta.groups.map((item) => ({
              key: item.id,
              label: item.name,
              depth: item.depth ?? 0,
            }))}
            iconName="folder-tree"
            className="w-full"
            size="md"
          />
        ) : null}

        {meta.groups.length > 0 ? (
          <ReportMultiSelectFilter
            ariaLabel="Виключення груп"
            placeholder="Виключення груп (немає)"
            selectedKeys={new Set(
              (draft.exclusions ?? [])
                .filter((item) => item.dimensionId === WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP)
                .map((item) => item.valueId),
            )}
            onChange={(keys) => {
              const ids = Array.from(keys);
              const rest = (draft.exclusions ?? []).filter(
                (item) => item.dimensionId !== WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP,
              );
              onExclusionsChange([
                ...rest,
                ...ids.map((id) => ({
                  dimensionId: WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP,
                  valueId: id,
                  label: meta.groups.find((group) => group.id === id)?.name ?? id,
                })),
              ]);
            }}
            options={meta.groups.map((item) => ({
              key: item.id,
              label: item.name,
              depth: item.depth ?? 0,
            }))}
            iconName="circle-minus"
            className="w-full"
            size="md"
          />
        ) : null}

        <ReportMultiSelectFilter
          ariaLabel="Тип витрати"
          placeholder="Розкладка витрати (всі)"
          selectedKeys={new Set(draft.expenseKinds ?? [])}
          onChange={(keys) =>
            onExpenseKindsChange(
              Array.from(keys).filter((key): key is (typeof WAREHOUSE_STATEMENT_EXPENSE_KINDS)[number] =>
                (WAREHOUSE_STATEMENT_EXPENSE_KINDS as readonly string[]).includes(key),
              ),
            )
          }
          options={WAREHOUSE_STATEMENT_EXPENSE_KINDS.map((kind) => ({
            key: kind,
            label: EXPENSE_KIND_LABELS[kind],
          }))}
          iconName="split"
          className="w-full"
          size="md"
        />

        {meta.priceTypes.length > 0 ? (
          <Select
            size="md"
            aria-label="Тип цін продажу"
            placeholder="Тип цін (за замовчуванням)"
            selectedKeys={draft.priceType ? [draft.priceType] : []}
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0] as string | undefined;
              onPriceTypeChange(value);
            }}
          >
            {meta.priceTypes.map((item) => (
              <SelectItem key={item.id}>{item.name}</SelectItem>
            ))}
          </Select>
        ) : null}
      </div>

      <Checkbox
        isSelected={draft.hideZeroQty ?? true}
        onValueChange={onHideZeroQtyChange}
      >
        Ховати нульові залишки
      </Checkbox>

      {(draft.exclusions ?? []).some(
        (item) => item.dimensionId !== WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP,
      ) ? (
        <div className="flex flex-wrap gap-1.5">
          {(draft.exclusions ?? [])
            .filter((item) => item.dimensionId !== WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP)
            .map((item) => (
              <Chip
                key={`${item.dimensionId}:${item.valueId}`}
                size="sm"
                variant="flat"
                color="danger"
                onClose={() =>
                  onExclusionsChange(
                    (draft.exclusions ?? []).filter(
                      (entry) =>
                        !(entry.dimensionId === item.dimensionId && entry.valueId === item.valueId),
                    ),
                  )
                }
              >
                {item.label || item.valueId}
              </Chip>
            ))}
        </div>
      ) : null}
    </div>
  );

  const grouping = (
    <ConstructorGroupingChips
      selected={selectedGrouping}
      available={availableGrouping}
      onChange={onGroupingChange}
    />
  );

  const columns = (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {columnGroups.map((group) => {
          const salePriceOn = selectedColumns.has(WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID);
          const visibleMetrics = group.metrics.filter(
            (metric) => metric.kind !== 'salesProfitability' || salePriceOn,
          );
          const ids = visibleMetrics.map((metric) => metric.id);
          const selectedCount = ids.filter((id) => selectedColumns.has(id)).length;
          const allSelected = selectedCount === ids.length && ids.length > 0;
          const someSelected = selectedCount > 0 && !allSelected;

          return (
            <div key={group.title} className="flex flex-col gap-2">
              <Checkbox
                isSelected={allSelected}
                isIndeterminate={someSelected}
                onValueChange={(selected) => toggleGroupColumns(ids, selected)}
                classNames={{ label: 'text-md font-semibold text-default-700' }}
              >
                {group.title}
              </Checkbox>
              {visibleMetrics.map((metric) => (
                <Checkbox
                  key={metric.id}
                  size="sm"
                  className="ml-4"
                  isSelected={selectedColumns.has(metric.id)}
                  onValueChange={(selected) => {
                    if (selected) {
                      setOrderedColumns([...draft.columns, metric.id]);
                      return;
                    }
                    setOrderedColumns(draft.columns.filter((id) => id !== metric.id));
                  }}
                >
                  {constructorMetricCheckboxLabel(metric, group.title)}
                  {metric.kind === 'unitCost' || metric.kind === 'salesProfitability' ? (
                    <Tooltip
                      content={
                        metric.kind === 'salesProfitability'
                          ? PROFITABILITY_COLUMN_TOOLTIP
                          : UNIT_COST_COLUMN_TOOLTIP
                      }
                      placement="top"
                      color="secondary"
                      delay={500}
                      showArrow={true}
                      classNames={{
                        base: 'before:bg-gray-700 before:rounded-[2px]',
                        content: 'bg-gray-700 border-0 text-white text-xs max-w-xs',
                      }}
                    >
                      <span
                        className="inline-flex ml-1 text-default-400 hover:text-default-600"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.preventDefault()}
                      >
                        <DynamicIcon name="circle-question-mark" size={14} />
                      </span>
                    </Tooltip>
                  ) : null}
                </Checkbox>
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-4">
        <RadioGroup
          label="Заголовки колонок"
          orientation="horizontal"
          size="sm"
          value={headerStyle}
          onValueChange={(value) =>
            onColumnHeaderStyleChange(value as WarehouseStatementColumnHeaderStyle)
          }
          classNames={{ wrapper: 'gap-4', label: 'text-sm font-semibold text-default-700' }}
        >
          {WAREHOUSE_STATEMENT_COLUMN_HEADER_STYLES.map((style) => (
            <Radio key={style} value={style}>
              {HEADER_STYLE_LABELS[style]}
            </Radio>
          ))}
        </RadioGroup>
        <Checkbox
          size="sm"
          isSelected={draft.pinTotals ?? true}
          onValueChange={onPinTotalsChange}
        >
          Рядок «Разом» закріплений
        </Checkbox>
      </div>
    </div>
  );

  return (
    <ReportConstructorPanel
      isOpen={isOpen}
      onToggle={onToggle}
      tab={tab}
      onTabChange={setTab}
      selection={selection}
      grouping={grouping}
      columns={columns}
      collapsedChips={collapsedChips.map((chip) => (
        <Chip key={chip.key} size="sm" variant="flat">
          {chip.title ? (
            <>
              <span className="font-semibold">{chip.title}:</span> {chip.value}
            </>
          ) : (
            chip.value
          )}
        </Chip>
      ))}
      headerExtra={
        (draft.exclusions?.length ?? 0) > 0 ? (
          <div className="flex items-center gap-1.5">
            <Chip size="sm" variant="flat" color="danger">
              Виключення: {draft.exclusions?.length}
            </Chip>
            <Button
              size="sm"
              variant="light"
              color="danger"
              aria-label="Скинути список виключення"
              onPress={onClearExclusions}
            >
              Скинути
            </Button>
          </div>
        ) : null
      }
    />
  );
}
