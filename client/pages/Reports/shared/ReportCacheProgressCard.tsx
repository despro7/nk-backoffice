import { DynamicIcon } from "lucide-react/dynamic";
import type { ReportCacheProgress } from "./ReportsSharedTypes";

type ReportCacheProgressCardProps = {
  progress: ReportCacheProgress | null;
  className?: string;
};

export function ReportCacheProgressCard({
  progress,
  className = "mt-4",
}: ReportCacheProgressCardProps) {
  if (!progress) {
    return null;
  }

  const progressPercent =
    progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;

  return (
    <div className={`${className} p-4 bg-blue-50 border border-blue-200 rounded-lg`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <DynamicIcon
            name="database"
            size={20}
            className="text-blue-600"
          />
          <span className="text-sm font-medium text-blue-800">
            Оновлення кеша статистики
          </span>
        </div>
        <span className="text-sm text-blue-600">
          {progress.processed} / {progress.total}
        </span>
      </div>

      <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-blue-600">
        <span>Оброблено: {progress.processed}</span>
        <span>Помилки: {progress.errors}</span>
      </div>
    </div>
  );
}