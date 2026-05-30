import { useMemo } from "react";
import type { SalesData } from "./ReportsSalesTypes";

export type SalesReportTableRowMetrics = {
  ordersCounts: number[];
  portionsCounts: number[];
  totalPrices: number[];
  sourceWebsiteCounts: number[];
  sourceRozetkaCounts: number[];
  sourcePromCounts: number[];
  sourceChatCounts: number[];
  discountReasonCounts: number[];
};

export function useSalesReportTableMetrics(
  filteredSalesData: SalesData[],
): SalesReportTableRowMetrics {
  return useMemo(
    () => ({
      ordersCounts: filteredSalesData.map((item) => item.ordersCount),
      portionsCounts: filteredSalesData.map((item) => item.portionsCount),
      totalPrices: filteredSalesData.map((item) => item.totalPrice || 0),
      sourceWebsiteCounts: filteredSalesData.map(
        (item) => item.ordersBySource["nk-food.shop"] || 0,
      ),
      sourceRozetkaCounts: filteredSalesData.map(
        (item) => item.ordersBySource["rozetka"] || 0,
      ),
      sourcePromCounts: filteredSalesData.map(
        (item) => item.ordersBySource["prom.ua"] || 0,
      ),
      sourceChatCounts: filteredSalesData.map(
        (item) => item.ordersBySource["інше"] || 0,
      ),
      discountReasonCounts: filteredSalesData.map(
        (item) => item.ordersWithDiscountReason,
      ),
    }),
    [filteredSalesData],
  );
}