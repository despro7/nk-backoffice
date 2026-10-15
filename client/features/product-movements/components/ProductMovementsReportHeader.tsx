import { DynamicIcon } from 'lucide-react/dynamic';
import type {
  ProductMovementsFilterState,
  ProductMovementsMetaResponse,
  ProductMovementsQueryResponse,
} from '../types';
import {
  buildProductMovementsGrandTotals,
  buildProductMovementsReportMetrics,
} from '../productMovementsUtils';
import ProductMovementsSummaryCards from './ProductMovementsSummaryCards';

interface ProductMovementsReportHeaderProps {
  result: ProductMovementsQueryResponse;
  filters: ProductMovementsFilterState;
  meta?: ProductMovementsMetaResponse | null;
  /** Показати блок назви/SKU/періоду/складу (сторінка звіту). У drawer — false. */
  showIdentity?: boolean;
}

export default function ProductMovementsReportHeader({
  result,
  filters,
  meta,
  showIdentity = true,
}: ProductMovementsReportHeaderProps) {
  const title = result.product.name?.trim() || result.product.sku;
  const metrics = buildProductMovementsReportMetrics(
    {
      ...filters,
      startDate: result.period.startDate,
      endDate: result.period.endDate,
    },
    meta,
    result.product.sku,
  );
  const totals = buildProductMovementsGrandTotals(result.groups);

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3 py-3 w-full">
      {showIdentity ? (
        <div className="flex min-w-0 shrink-0 flex-col gap-1 max-w-md">
          <h2 className="text-2xl font-semibold text-default-900">{title}</h2>
          {metrics.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {metrics.map((metric) => (
                <span
                  key={`${metric.icon}-${metric.label}`}
                  className="inline-flex items-center gap-1.5 text-sm text-default-500"
                >
                  <DynamicIcon
                    name={metric.icon as 'barcode'}
                    size={14}
                    className="shrink-0 text-default-400"
                  />
                  <span>{metric.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <ProductMovementsSummaryCards totals={totals} />
    </div>
  );
}
