import { Chip } from "@heroui/react";
import { getValueColor } from "@/lib/utils";
import type { GroupBy } from "./ReportsSalesDynamicsTypes";

export const GROUP_BY_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "week4", label: "4 рівні тижні" },
  { key: "calendarWeek", label: "Календарні тижні" },
  { key: "day", label: "По днях" },
];

const COLOR_THRESHOLDS = [
  { min: 100, color: "success" as const, bg: "bg-green-100", text: "text-green-800" },
  { min: 20, color: "warning" as const, bg: "bg-yellow-100", text: "text-yellow-800" },
  { min: 5, color: "default" as const, bg: "bg-orange-100", text: "text-orange-700" },
  { min: 0, color: "danger" as const, bg: "bg-red-100", text: "text-red-700" },
];

export function getSalePercent(totalSold: number, openingStock: number): number | null {
  if (openingStock === 0) {
    return null;
  }

  return Math.round((totalSold / openingStock) * 100);
}

export function getPercentChip(totalSold: number, openingStock: number | undefined) {
  if (openingStock === undefined) {
    return <span className="text-default-400 text-xs">—</span>;
  }

  if (openingStock === 0) {
    if (totalSold === 0) {
      return (
        <Chip size="sm" variant="flat" color="danger" className="text-xs font-medium">
          0,00%
        </Chip>
      );
    }

    return (
      <Chip size="sm" variant="light" color="default" className="text-xs font-medium">
        ∞
      </Chip>
    );
  }

  const percent = getSalePercent(totalSold, openingStock);

  if (percent === null) {
    return null;
  }

  return (
    <Chip
      size="sm"
      variant="flat"
      className="text-xs font-medium"
      classNames={{
        base: getValueColor(percent, COLOR_THRESHOLDS.map((threshold) => threshold.min)).base,
        content: getValueColor(percent, COLOR_THRESHOLDS.map((threshold) => threshold.min)).content,
      }}
    >
      {percent.toFixed(0)}%
    </Chip>
  );
}

export function getPercentSortValue(totalSold: number, openingStock: number | undefined): number {
  if (openingStock === undefined) {
    return -1;
  }

  if (openingStock === 0) {
    return totalSold > 0 ? Infinity : 0;
  }

  return (totalSold / openingStock) * 100;
}