import type { ReactNode } from "react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { formatDate } from "@/lib";

export type EventTimelineTone = "default" | "success" | "warning" | "danger";

export type EventTimelineEntry = {
  key: string;
  icon: IconName;
  label: ReactNode;
  /** ISO / Date; відображається через `formatDate` (Europe/Kyiv). */
  date: string | Date | null | undefined;
  tone?: EventTimelineTone;
};

/** Білий тултіп/поповер для списків подій (історія статусів, документи Dilovod). */
export const EVENT_TIMELINE_OVERLAY_CLASS =
  "bg-white border border-neutral-200 text-neutral-700 px-3 py-2 shadow-md";

const ICON_TONE: Record<EventTimelineTone, string> = {
  default: "text-neutral-500",
  success: "text-green-600",
  warning: "text-amber-500",
  danger: "text-red-500",
};

const LABEL_TONE: Record<EventTimelineTone, string> = {
  default: "text-neutral-800",
  success: "text-neutral-800",
  warning: "text-amber-700",
  danger: "text-red-700",
};

/** Вертикальний список подій: іконка, назва, дата й час. */
export function EventTimelineList({
  entries,
  emptyText,
  header,
}: {
  entries: EventTimelineEntry[];
  emptyText?: ReactNode;
  /** Довільний блок над списком (напр. попередження). */
  header?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-0.5 pr-2">
      {header ? <div className="text-xs">{header}</div> : null}
      {entries.length === 0 && emptyText ? (
        <span className="text-xs text-neutral-400">{emptyText}</span>
      ) : null}
      {entries.map((entry) => {
        const tone = entry.tone ?? "default";
        return (
          <div key={entry.key} className="flex items-start gap-2 text-xs">
            <DynamicIcon name={entry.icon} size={14} className={`mt-0.5 shrink-0 ${ICON_TONE[tone]}`} />
            <div className="flex min-w-0 flex-col leading-snug">
              <span className={`font-medium ${LABEL_TONE[tone]}`}>{entry.label}</span>
              <span className="text-neutral-500">{formatDate(entry.date ?? null)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
