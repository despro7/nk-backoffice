import LalAudiencesTable from './components/LalAudiencesTable';
import LalFiltersPanel from './components/LalFiltersPanel';
import LalPresetsPanel from './components/LalPresetsPanel';
import LalSummaryCard from './components/LalSummaryCard';
import useLalAudiences from './useLalAudiences';

export default function LalAudiencesPage() {
  const {
    allStatusesSelected,
    customRange,
    error,
    exportAudience,
    exportColumns,
    handleLtvChange,
    handleOrderCountChange,
    handleSortChange,
    isExporting,
    limit,
    loading,
    logic,
    ltvRange,
    orderCountRange,
    page,
    pagination,
    period,
    preset,
    resetFilters,
    rows,
    sortBy,
    sortDir,
    setCustomRange,
    setExportColumns,
    setLimit,
    setLogic,
    setPage,
    setPeriod,
    statuses,
    summary,
    toggleAllStatuses,
    togglePreset,
    toggleStatus,
  } = useLalAudiences();

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <div className="w-full lg:w-[30%] lg:max-w-sm shrink-0 flex flex-col gap-4">
        <LalPresetsPanel selected={preset} onToggle={togglePreset} />
        <LalFiltersPanel
          allStatusesSelected={allStatusesSelected}
          customRange={customRange}
          logic={logic}
          ltvRange={ltvRange}
          orderCountRange={orderCountRange}
          period={period}
          statuses={statuses}
          onLogicChange={setLogic}
          onLtvChange={handleLtvChange}
          onOrderCountChange={handleOrderCountChange}
          onPeriodChange={setPeriod}
          onRangeChange={setCustomRange}
          onReset={resetFilters}
          onToggleAllStatuses={toggleAllStatuses}
          onToggleStatus={toggleStatus}
        />
      </div>

      <div className="w-full lg:flex-1 min-w-0 flex flex-col gap-4">
        {error && (
          <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-danger-700 text-sm">
            ❌ {error}
          </div>
        )}

        <LalSummaryCard
          exportColumns={exportColumns}
          isExporting={isExporting}
          loading={loading}
          summary={summary}
          onExport={exportAudience}
          onExportColumnsChange={setExportColumns}
        />

        <LalAudiencesTable
          limit={limit}
          loading={loading}
          page={page}
          pagination={pagination}
          rows={rows}
          sortBy={sortBy}
          sortDir={sortDir}
          onLimitChange={setLimit}
          onPageChange={setPage}
          onSortChange={handleSortChange}
        />
      </div>
    </div>
  );
}
