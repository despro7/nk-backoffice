import type { SalesDynamicsResponse } from "../ReportsSalesDynamicsTypes";

interface ReportsSalesDynamicsSummaryProps {
  rowsCount: number;
  salesData: SalesDynamicsResponse | null;
  visible: boolean;
}

export default function ReportsSalesDynamicsSummary({
  rowsCount,
  salesData,
  visible,
}: ReportsSalesDynamicsSummaryProps) {
  if (!visible || !salesData) {
    return null;
  }

  return (
    <div className="text-xs text-default-400 px-1 flex gap-4">
      <span>
        Замовлень: <b>{salesData.metadata.totalOrders}</b>
      </span>
      <span>
        Продуктів: <b>{rowsCount}</b>
      </span>
      <span>
        Кеш: <b>{salesData.metadata.ordersWithCache}</b> / {salesData.metadata.totalOrders}
      </span>
      <span>Оновлено: {new Date(salesData.metadata.generatedAt).toLocaleTimeString("uk-UA")}</span>
    </div>
  );
}