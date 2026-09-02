import { Alert } from '@heroui/react';
import UndoActionBanner from '@/components/UndoActionBanner';
import ConstructorPanel from './components/ConstructorPanel';
import StatementTable from './components/StatementTable';
import Toolbar from './components/Toolbar';
import useWarehouseStatement from './useWarehouseStatement';
import useWarehouseStatementMeta from './useWarehouseStatementMeta';

export default function ReportsWarehouseStatementPage() {
  const { meta, loading: metaLoading, error: metaError } = useWarehouseStatementMeta();
  const statement = useWarehouseStatement(meta);
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
          onGroupingChange={statement.setGrouping}
          onColumnsChange={statement.setColumns}
          onColumnHeaderStyleChange={statement.setColumnHeaderStyle}
          onPinTotalsChange={statement.setPinTotals}
          onExclusionsChange={statement.setExclusions}
          onBeginUndo={statement.beginUndo}
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
