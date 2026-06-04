import { Chip, TableCell, TableRow } from "@heroui/react";
import { getValueColor } from "@/lib";
import type { SalesData } from "../ReportsSalesTypes";
import type { SalesReportTableRowMetrics } from "../useSalesReportTableMetrics";

export type SalesReportTableRowProps = {
  item: SalesData;
  colored: boolean;
  metrics: SalesReportTableRowMetrics;
  onOpenDetails: (item: SalesData) => void;
};

function formatSalesDate(date: string) {
  const dateObj = new Date(date);
  const day = dateObj.getDay();
  const isWeekend = day === 0 || day === 6;
  const dateStr = dateObj.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "short",
  });

  return {
    dateStr,
    isWeekend,
  };
}

function renderMetricChip(value: number, compareValues: number[], colored: boolean) {
  const color = getValueColor(value, compareValues, colored);

  return {
    base: color.base,
    content: color.content,
  };
}

export function renderSalesReportTableRow({
  item,
  colored,
  metrics,
  onOpenDetails,
}: SalesReportTableRowProps) {
  const { dateStr, isWeekend } = formatSalesDate(item.date);

  return (
    <TableRow
      key={item.date}
      onClick={() => onOpenDetails(item)}
    >
      <TableCell className="font-medium text-[15px]">
        <span className={`${isWeekend ? "text-gray-400" : ""} whitespace-nowrap`}>
          {dateStr}
        </span>
      </TableCell>
      <TableCell className="text-center text-base">
        <Chip
          size="md"
          variant="flat"
          classNames={renderMetricChip(item.ordersCount, metrics.ordersCounts, colored)}
        >
          {item.ordersCount}
        </Chip>
      </TableCell>
      <TableCell className="text-center text-base">
        <Chip
          size="md"
          variant="flat"
          classNames={renderMetricChip(item.portionsCount, metrics.portionsCounts, colored)}
        >
          {item.portionsCount}
        </Chip>
      </TableCell>
      <TableCell className="text-center text-base">
        <Chip
          size="md"
          variant="flat"
          classNames={renderMetricChip(item.totalPrice || 0, metrics.totalPrices, colored)}
        >
          {item.totalPrice !== undefined
            ? item.totalPrice
                .toLocaleString("uk-UA", {
                  style: "currency",
                  currency: "UAH",
                  maximumFractionDigits: 0,
                })
                .replace(/\s?грн\.?|UAH|₴/gi, "")
            : "—"}
        </Chip>
      </TableCell>
      <TableCell className="text-center text-base">
        <Chip
          size="md"
          variant="flat"
          classNames={renderMetricChip(
            item.ordersBySource["nk-food.shop"] || 0,
            metrics.sourceWebsiteCounts,
            colored,
          )}
        >
          {item.ordersBySource["nk-food.shop"] || 0} / {item.portionsBySource["nk-food.shop"] || 0}
        </Chip>
      </TableCell>
      <TableCell className="text-center text-base">
        <Chip
          size="md"
          variant="flat"
          classNames={renderMetricChip(
            item.ordersBySource["rozetka"] || 0,
            metrics.sourceRozetkaCounts,
            colored,
          )}
        >
          {item.ordersBySource["rozetka"] || 0} / {item.portionsBySource["rozetka"] || 0}
        </Chip>
      </TableCell>
      <TableCell className="text-center text-base">
        <Chip
          size="md"
          variant="flat"
          classNames={renderMetricChip(
            item.ordersBySource["prom.ua"] || 0,
            metrics.sourcePromCounts,
            colored,
          )}
        >
          {item.ordersBySource["prom.ua"] || 0} / {item.portionsBySource["prom.ua"] || 0}
        </Chip>
      </TableCell>
      <TableCell className="text-center text-base">
        <Chip
          size="md"
          variant="flat"
          classNames={renderMetricChip(
            item.ordersBySource["інше"] || 0,
            metrics.sourceChatCounts,
            colored,
          )}
        >
          {item.ordersBySource["інше"] || 0} / {item.portionsBySource["інше"] || 0}
        </Chip>
      </TableCell>
      <TableCell className="text-center text-base">
        <Chip
          size="md"
          variant="flat"
          classNames={renderMetricChip(
            item.ordersWithDiscountReason,
            metrics.discountReasonCounts,
            colored,
          )}
        >
          {item.ordersWithDiscountReason} / {item.portionsWithDiscountReason}
        </Chip>
      </TableCell>
    </TableRow>
  );
}