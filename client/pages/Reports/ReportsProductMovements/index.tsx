import { useCallback, useState } from 'react';
import { Alert, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import * as XLSX from 'xlsx';
import ProductMovementsFilters from '@/features/product-movements/components/ProductMovementsFilters';
import ProductMovementsRecentSearches from '@/features/product-movements/components/ProductMovementsRecentSearches';
import ProductMovementsReportHeader from '@/features/product-movements/components/ProductMovementsReportHeader';
import ProductMovementsTable from '@/features/product-movements/components/ProductMovementsTable';
import useProductMovementsMeta from '@/features/product-movements/hooks/useProductMovementsMeta';
import useProductMovementsQuery from '@/features/product-movements/hooks/useProductMovementsQuery';
import { createDefaultFilters } from '@/features/product-movements/productMovementsUtils';
import type { ProductMovementsFilterState } from '@/features/product-movements/types';

export default function ReportsProductMovementsPage() {
  const { meta, loading: metaLoading, error: metaError } = useProductMovementsMeta();
  const query = useProductMovementsQuery();
  const [filters, setFilters] = useState<ProductMovementsFilterState>(createDefaultFilters());

  const handleRecentSearchSelect = useCallback((nextFilters: ProductMovementsFilterState) => {
    setFilters(nextFilters);
    query.generate(nextFilters, meta);
  }, [meta, query]);

  const exportToExcel = useCallback(() => {
    if (!query.result) return;

    const rows: Array<Array<string | number>> = [[
      'Група',
      '№',
      'Дата',
      'Документ',
      'Надходження',
      'Витрата',
      'Залишок',
    ]];

    for (const group of query.result.groups) {
      rows.push([group.label, '', '', `Початковий залишок: ${group.openingBalance}`, '', '', '']);
      for (const [index, line] of group.lines.entries()) {
        rows.push([
          group.label,
          index + 1,
          line.date,
          line.documentLabel,
          line.receiptQty ?? '',
          line.expenseQty ?? '',
          line.balanceQty,
        ]);
      }
      rows.push([
        group.label,
        '',
        '',
        'Разом',
        group.totals.receiptQty,
        group.totals.expenseQty,
        group.totals.balanceQty,
      ]);
    }

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Рухи');
    const periodLabel = `${query.result.period.startDate}_${query.result.period.endDate}`;
    XLSX.writeFile(workbook, `Рухи_товару_${query.result.product.sku}_${periodLabel}.xlsx`);
  }, [query.result]);

  const filterActions = (
    <>
      <Button
        color="primary"
        className="bg-blue-500 text-white"
        startContent={<DynamicIcon name={query.loading ? 'loader-circle' : 'table-properties'} size={16} className={query.loading ? 'animate-spin' : ''} />}
        onPress={() => query.generate(filters, meta)}
      >
        Сформувати
      </Button>
      <Button
        variant="flat"
        color="primary"
        startContent={<DynamicIcon name="download" size={16} />}
        isDisabled={!query.result}
        onPress={exportToExcel}
      >
        Excel
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4 h-full min-w-0 w-full">
      {metaError ? (
        <Alert color="danger" variant="faded" title="Не вдалося завантажити схему" description={metaError} />
      ) : null}

      {query.error ? (
        <Alert color="danger" variant="faded" title="Помилка Dilovod" description={query.error} />
      ) : null}

      <ProductMovementsFilters
        meta={meta}
        filters={filters}
        onChange={setFilters}
        onRecentSearchSelect={handleRecentSearchSelect}
        actions={filterActions}
      />

      <ProductMovementsRecentSearches
        meta={meta}
        onSelect={(item) => handleRecentSearchSelect(item.filters)}
      />

      {query.result && query.generatedFilters ? (
        <ProductMovementsReportHeader
          result={query.result}
          filters={query.generatedFilters}
          meta={meta}
        />
      ) : null}

      {metaLoading && !meta ? (
        <Alert
          color="primary"
          variant="faded"
          title="Завантаження схеми регістру…"
          description="Фільтри з’являться після відповіді GET /meta."
        />
      ) : null}

      <div className="h-full min-h-0 min-w-0 w-full">
        <ProductMovementsTable
          result={query.result}
          loading={query.loading}
          hasGenerated={query.hasGenerated}
        />
      </div>
    </div>
  );
}
