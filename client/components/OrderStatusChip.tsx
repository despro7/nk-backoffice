import type { ReactNode } from "react";
import { Chip, Tooltip } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatDate, getStatusColor, getStatusLabel } from "@/lib";

export type OrderStatusHistoryEntry = {
  status: string;
  statusText: string;
  changedAt: string;
};

const STATUS_ICONS: Record<string, string> = {
  "1": "circle-dashed",
  "2": "circle-check",
  "3": "package-check",
  "4": "truck",
  "5": "check-check",
  "6": "rotate-ccw",
  "7": "ban",
  "8": "trash-2",
  "9": "pause-circle",
};

const STATUS_CONFIRMED = "2";
const STATUS_READY_TO_SHIP = "3";
const STATUS_DEDUPE_WINDOW_MS = 60_000;

function toLocalDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Звітна дата з урахуванням години початку звітного дня (як на сервері). */
function getReportingDateKey(value: string | Date, dayStartHour: number): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (date.getHours() >= dayStartHour) {
    date.setDate(date.getDate() + 1);
  }

  return formatLocalDateKey(date);
}

/** Якщо звітна дата випадає на сб/нд — переносимо на понеділок. */
function skipWeekendsToMonday(dateKey: string): string {
  const date = parseLocalDateKey(dateKey);
  if (!date) return dateKey;

  const weekday = date.getDay(); // 0 = нд, 6 = сб
  if (weekday === 6) {
    date.setDate(date.getDate() + 2);
  } else if (weekday === 0) {
    date.setDate(date.getDate() + 1);
  }

  return formatLocalDateKey(date);
}

/** Прибирає підряд однакові статуси, якщо різниця в часі ≤ 1 хв. */
function dedupeNearbyStatusHistory(
  statusHistory: OrderStatusHistoryEntry[],
): OrderStatusHistoryEntry[] {
  const result: OrderStatusHistoryEntry[] = [];

  for (const entry of statusHistory) {
    const prev = result[result.length - 1];
    if (prev && prev.status === entry.status) {
      const prevTime = new Date(prev.changedAt).getTime();
      const entryTime = new Date(entry.changedAt).getTime();
      if (
        Number.isFinite(prevTime) &&
        Number.isFinite(entryTime) &&
        Math.abs(entryTime - prevTime) <= STATUS_DEDUPE_WINDOW_MS
      ) {
        continue;
      }
    }
    result.push(entry);
  }

  return result;
}

function findLastStatusEntry(
  statusHistory: OrderStatusHistoryEntry[],
  status: string,
): OrderStatusHistoryEntry | undefined {
  for (let index = statusHistory.length - 1; index >= 0; index -= 1) {
    if (statusHistory[index].status === status) {
      return statusHistory[index];
    }
  }
  return undefined;
}

function getReadyToShipDayMismatch(
  statusHistory: OrderStatusHistoryEntry[] | undefined,
  dayStartHour: number,
): {
  mismatched: boolean;
  lastReadyToShipChangedAt: string | null;
} {
  if (!statusHistory?.length) {
    return { mismatched: false, lastReadyToShipChangedAt: null };
  }

  const visibleHistory = dedupeNearbyStatusHistory(statusHistory);
  const lastConfirmed = findLastStatusEntry(visibleHistory, STATUS_CONFIRMED);
  const lastReadyToShip = findLastStatusEntry(visibleHistory, STATUS_READY_TO_SHIP);

  if (!lastConfirmed || !lastReadyToShip) {
    return { mismatched: false, lastReadyToShipChangedAt: null };
  }

  const confirmedCalendarDateKey = toLocalDateKey(lastConfirmed.changedAt);
  const confirmedReportingDateKey = getReportingDateKey(lastConfirmed.changedAt, dayStartHour);
  const expectedDateKey = confirmedReportingDateKey
    ? skipWeekendsToMonday(confirmedReportingDateKey)
    : null;
  const actualDateKey = toLocalDateKey(lastReadyToShip.changedAt);

  if (
    expectedDateKey == null ||
    actualDateKey == null ||
    expectedDateKey === actualDateKey
  ) {
    return {
      mismatched: false,
      lastReadyToShipChangedAt: lastReadyToShip.changedAt,
    };
  }

  // Виняток: «На відправку» того ж календарного дня, що й підтвердження,
  // а «інший день» з’явився лише через зсув звітної години (без правила вихідних).
  const isReportingHourSameDayException =
    confirmedCalendarDateKey != null &&
    confirmedReportingDateKey != null &&
    actualDateKey === confirmedCalendarDateKey &&
    confirmedReportingDateKey !== confirmedCalendarDateKey &&
    expectedDateKey === confirmedReportingDateKey;

  return {
    mismatched: !isReportingHourSameDayException,
    lastReadyToShipChangedAt: lastReadyToShip.changedAt,
  };
}

export function OrderStatusHistoryTooltip({
  dayStartHour,
  statusHistory,
}: {
  dayStartHour?: number;
  statusHistory?: OrderStatusHistoryEntry[];
}) {
  if (!statusHistory || statusHistory.length === 0) {
    return <span className="text-xs text-neutral-400">Немає історії статусів</span>;
  }

  const visibleHistory = dedupeNearbyStatusHistory(statusHistory);
  const mismatch =
    dayStartHour == null
      ? { mismatched: false, lastReadyToShipChangedAt: null }
      : getReadyToShipDayMismatch(visibleHistory, dayStartHour);

  return (
    <div className="flex flex-col gap-1.5 py-0.5 min-w-[220px]">
      {visibleHistory.map((entry, index) => {
        const iconName = STATUS_ICONS[entry.status] ?? "circle";
        const entryLabel = entry.statusText || getStatusLabel(entry.status);
        const isDifferentDay =
          mismatch.mismatched &&
          entry.status === STATUS_READY_TO_SHIP &&
          entry.changedAt === mismatch.lastReadyToShipChangedAt;

        return (
          <div
            key={`${entry.status}-${entry.changedAt}-${index}`}
            className="flex items-start gap-2 text-xs"
          >
            <DynamicIcon
              name={iconName as Parameters<typeof DynamicIcon>[0]["name"]}
              size={14}
              className={`mt-0.5 shrink-0 ${isDifferentDay ? "text-amber-500" : "text-neutral-500"}`}
            />
            <div className="flex min-w-0 flex-col leading-snug">
              <span className={isDifferentDay ? "font-medium text-amber-700" : "font-medium text-neutral-800"}>
                {isDifferentDay ? `${entryLabel} (інший день)` : entryLabel}
              </span>
              <span className="text-neutral-500">{formatDate(entry.changedAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type OrderStatusChipProps = {
  status: string;
  label?: string;
  statusHistory?: OrderStatusHistoryEntry[];
  /** Якщо задано — підсвічує «На відправку» в інший звітний день і показує іконку попередження. */
  dayStartHour?: number;
  showMismatchWarning?: boolean;
  extraTooltip?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  chipClassNames?: {
    base?: string;
    content?: string;
  };
  tooltipPlacement?: "top" | "bottom" | "left" | "right" | "top-start" | "top-end";
};

export function OrderStatusChip({
  status,
  label,
  statusHistory,
  dayStartHour,
  showMismatchWarning = true,
  extraTooltip,
  size = "sm",
  className,
  chipClassNames,
  tooltipPlacement = "left",
}: OrderStatusChipProps) {
  const displayLabel = label || getStatusLabel(status);
  const mismatch =
    dayStartHour == null
      ? { mismatched: false }
      : getReadyToShipDayMismatch(statusHistory, dayStartHour);
  const showHistoryTooltip = statusHistory !== undefined;
  const showTooltip = showHistoryTooltip || extraTooltip != null;

  const chip = (
    <Chip
      size={size}
      variant="flat"
      className={size === "sm" ? "text-xs" : undefined}
      classNames={{
        base: [getStatusColor(status), chipClassNames?.base].filter(Boolean).join(" "),
        content: chipClassNames?.content,
      }}
    >
      {displayLabel}
    </Chip>
  );

  const trigger = (
    <span
      className={`inline-flex items-center gap-1 ${showTooltip ? "cursor-help" : ""} ${className ?? ""}`.trim()}
    >
      {chip}
      {showMismatchWarning && mismatch.mismatched && (
        <DynamicIcon
          name="alert-triangle"
          size={14}
          className="shrink-0 text-red-500"
          aria-label="День «На відправку» не збігається з очікуваним після підтвердження"
        />
      )}
    </span>
  );

  if (!showTooltip) {
    return trigger;
  }

  return (
    <Tooltip
      showArrow
      placement={tooltipPlacement}
      classNames={{
        content: "bg-white border border-neutral-200 text-neutral-700 px-3 py-2 shadow-md",
      }}
      content={
        <div className="flex flex-col gap-2">
          {extraTooltip ? <div className="text-xs text-neutral-600">{extraTooltip}</div> : null}
          {showHistoryTooltip ? (
            <OrderStatusHistoryTooltip
              dayStartHour={dayStartHour}
              statusHistory={statusHistory}
            />
          ) : null}
        </div>
      }
    >
      {trigger}
    </Tooltip>
  );
}
