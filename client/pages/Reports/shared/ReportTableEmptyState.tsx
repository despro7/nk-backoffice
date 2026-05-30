import { Spinner } from "@heroui/react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";

type ReportTableEmptyStateProps = {
  loading: boolean;
  emptyMessage?: string;
  emptyIconName?: IconName;
  loadingMessage?: string;
};

export function ReportTableEmptyState({
  loading,
  emptyMessage = "Немає даних для відображення",
  emptyIconName = "inbox",
  loadingMessage = "Завантаження...",
}: ReportTableEmptyStateProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" color="primary" />
        <span className="ml-3 text-gray-600">{loadingMessage}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-8 h-110 text-gray-500">
      <DynamicIcon
        name={emptyIconName}
        size={48}
        className="text-gray-300"
      />
      <span className="ml-3">{emptyMessage}</span>
    </div>
  );
}