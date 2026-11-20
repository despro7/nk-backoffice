import { useState } from 'react';
import { Alert } from '@heroui/react';
import type { WarehouseStatementMetaResponse } from '@shared/types/warehouseStatement';
import type { HierarchicalTableRowView } from '../shared/constructor';
import UndoActionBanner from '@/components/UndoActionBanner';
import ConstructorPanel from './components/ConstructorPanel';
import PresetBar from './components/PresetBar';
import ProductHistoryDrawer, { type ProductHistoryTarget } from './components/ProductHistoryDrawer';
import StatementTable from './components/StatementTable';
import Toolbar from './components/Toolbar';
import useWarehouseStatement from './useWarehouseStatement';
import useWarehouseStatementMeta from './useWarehouseStatementMeta';
import useWarehouseStatementPresets from './useWarehouseStatementPresets';

/**
 * Відбір для графіка історії: фільтри складу / фірми з конструктора, звужені до
 * значень з шляху рядка в дереві (`…/storage:ID/…`), якщо рядок лежить під групою складу.
 */
function buildHistoryTarget(
  row: HierarchicalTableRowView,
  meta: WarehouseStatementMetaResponse,
  dimensionFilters: Record<string, string[]> | undefined,
): ProductHistoryTarget | null {
  const goodsDim = meta.resolved.goodsDimensionName;
  if (!row.valueId || !goodsDim) {
    return null;
  }
  const filters: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(dimensionFilters ?? {})) {
    if (key !== goodsDim && values.length > 0) filters[key] = values;
  }
  const registerDims = new Set(
    meta.dimensions.filter((item) => item.source === 'register').map((item) => item.id),
  );
  for (const segment of row.id.split('/')) {
    const separator = segment.indexOf(':');
    const dimId = separator > 0 ? segment.slice(0, separator) : '';
    const valueId = separator > 0 ? segment.slice(separator + 1) : '';
    if (dimId && dimId !== goodsDim && registerDims.has(dimId) && valueId) {
      filters[dimId] = [valueId];
    }
  }
  const storageDim = meta.resolved.storageDimensionName;
  const storages = storageDim ? (filters[storageDim] ?? []) : [];
  const storageNames = storages.map((id) => meta.storages.find((item) => item.id === id)?.name ?? id);
  return {
    goodId: row.valueId,
    label: row.label,
    sku: row.sku,
    dimensionFilters: filters,
    scopeLabel: storageNames.length > 0 ? storageNames.join(', ') : 'усі склади',
    storageId: storages.length === 1 ? storages[0] : undefined,
  };
}

export default function ReportsWarehouseStatementPage() {
  const { meta, loading: metaLoading, error: metaError } = useWarehouseStatementMeta();
  const statement = useWarehouseStatement(meta);
  const presets = useWarehouseStatementPresets();
  const [historyTarget, setHistoryTarget] = useState<ProductHistoryTarget | null>(null);
  const storageDimensionName = meta?.resolved.storageDimensionName;
  const selectedStorages = storageDimensionName
    ? (statement.draft?.dimensionFilters?.[storageDimensionName] ?? [])
    : [];

  return (
    <div className="flex flex-col gap-4 h-full min-w-0 w-full">
      <Toolbar
        periodMode={statement.periodMode}
        onPeriodModeChange={statement.setPeriodMode}
        dateRange={statement.dateRange}
        datePresetKey={statement.datePresetKey}
        asOfDate={statement.asOfDate}
        onDateRangeChange={statement.handleDateRangeChange}
        onDatePresetChange={statement.handleDatePresetChange}
        onAsOfDateChange={statement.handleAsOfDateChange}
        onGenerate={statement.generate}
        onExport={statement.exportToExcel}
        generating={statement.loading}
        canExport={Boolean(statement.result)}
      />

      {metaError ? (
        <Alert color="danger" variant="faded" title="Не вдалося завантажити схему" description={metaError} />
      ) : null}

      {statement.error ? (
        <Alert color="danger" variant="faded" title="Помилка Dilovod / відомості" description={statement.error} />
      ) : null}

      {meta && statement.draft ? (
        <ConstructorPanel
          meta={meta}
          draft={statement.draft}
          isOpen={statement.constructorOpen}
          onToggle={() => statement.setConstructorOpen(!statement.constructorOpen)}
          onDimensionFilterChange={statement.setDimensionFilter}
          onGroupIdsChange={statement.setGroupIds}
          onExpenseKindsChange={statement.setExpenseKinds}
          onPriceTypeChange={statement.setPriceType}
          onHideZeroQtyChange={statement.setHideZeroQty}
          onHideInactiveChange={statement.setHideInactive}
          onGroupingChange={statement.setGrouping}
          onColumnsChange={statement.setColumns}
          onColumnHeaderStyleChange={statement.setColumnHeaderStyle}
          onPinTotalsChange={statement.setPinTotals}
          onExclusionsChange={statement.setExclusions}
          onBeginUndo={statement.beginUndo}
          headerExtra={
            <PresetBar
              presets={presets.presets}
              activePresetId={statement.activePresetId}
              datePresetKey={statement.datePresetKey}
              saving={presets.saving}
              history={statement.history}
              currentSpec={statement.currentSpec}
              onApply={(preset) => statement.applySpec(preset.spec, preset.id)}
              onApplyHistory={(entry) => statement.applySpec(entry.spec, null)}
              onClearHistory={statement.clearHistory}
              onDetach={() => statement.setActivePresetId(null)}
              onCreate={async ({ name, visibility }) => {
                const spec = statement.currentSpec(visibility);
                if (!spec) {
                  return undefined;
                }
                const created = await presets.createPreset({ name, visibility, spec });
                statement.setActivePresetId(created.id);
                return created;
              }}
              onUpdate={presets.updatePreset}
              onDelete={presets.deletePreset}
            />
          }
        />
      ) : null}

      {metaLoading && !meta ? (
        <Alert
          color="primary"
          variant="faded"
          title="Завантаження схеми регістру…"
          description="Конструктор з’явиться після відповіді GET /meta."
        />
      ) : null}

      <div className="h-full min-h-0 min-w-0 w-full">
        <StatementTable
          meta={meta}
          result={statement.result}
          loading={statement.loading}
          hasGenerated={statement.hasGenerated}
          columnHeaderStyle={statement.draft?.columnHeaderStyle ?? 'short'}
          pinTotals={statement.draft?.pinTotals ?? true}
          onPinTotalsChange={statement.setPinTotals}
          collapseStorageGroup={selectedStorages.length === 1}
          exclusions={statement.draft?.exclusions}
          onShowHistory={(row) => {
            if (meta) {
              setHistoryTarget(buildHistoryTarget(row, meta, statement.draft?.dimensionFilters));
            }
          }}
          onExclude={(row) => {
            if (!row.dimensionId || !row.valueId) {
              return;
            }
            statement.addExclusion({
              dimensionId: row.dimensionId,
              valueId: row.valueId,
              label: row.label,
            });
          }}
        />
      </div>

      <ProductHistoryDrawer
        target={historyTarget}
        reportPeriod={statement.submittedPeriod ?? statement.draft?.period ?? null}
        onClose={() => setHistoryTarget(null)}
      />

      {statement.actionUndo ? (
        <UndoActionBanner
          key={`${statement.actionUndo.prefix}:${statement.actionUndo.label}:${statement.actionUndo.restore ? '1' : '0'}`}
          prefix={statement.actionUndo.prefix}
          productName={statement.actionUndo.label}
          onUndo={statement.undoAction}
          onElapsed={statement.dismissActionUndo}
          className="fixed inset-x-3 bottom-24 lg:bottom-8 z-[100] mx-auto max-w-lg"
        />
      ) : null}
    </div>
  );
}
