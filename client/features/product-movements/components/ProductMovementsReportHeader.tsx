import { DynamicIcon } from 'lucide-react/dynamic';
import type {
  ProductMovementsFilterState,
  ProductMovementsMetaResponse,
  ProductMovementsQueryResponse,
} from '../types';
import {
  buildProductMovementsGrandTotals,
  buildProductMovementsReportMetrics,
  formatQty,
} from '../productMovementsUtils';

interface ProductMovementsReportHeaderProps {
  result: ProductMovementsQueryResponse;
  filters: ProductMovementsFilterState;
  meta?: ProductMovementsMetaResponse | null;
}

export default function ProductMovementsReportHeader({
  result,
  filters,
  meta,
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
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-5">
      <div className="flex min-w-0 flex-col gap-1">
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

      <div className="shrink-0 text-right flex flex-col gap-2">
        <div className="text-sm text-default-500">
          Початковий залишок:{' '}
          <span className="font-mono font-semibold text-foreground">
            {formatQty(totals.openingBalance) || '0'}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm text-default-500">
          <span>
            Надходження:{' '}
            <span className="font-mono font-semibold text-foreground">
              {formatQty(totals.receiptQty) || '0'}
            </span>
          </span>
          <span>
            Витрата:{' '}
            <span className="font-mono font-semibold text-foreground">
              {formatQty(totals.expenseQty) || '0'}
            </span>
          </span>
          <span>
            Залишок:{' '}
            <span
              className={`font-mono font-semibold ${totals.balanceQty < 0 ? 'text-danger' : 'text-foreground'}`}
            >
              {formatQty(totals.balanceQty) || '0'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
