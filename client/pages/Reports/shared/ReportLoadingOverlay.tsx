import { Spinner } from "@heroui/react";

type ReportLoadingOverlayProps = {
  loading: boolean;
  message?: string;
  className?: string;
};

export function ReportLoadingOverlay({
  loading,
  message = "Завантаження даних...",
  className = "",
}: ReportLoadingOverlayProps) {
  return (
    <div
      className={`absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10 transition-all duration-300 ease-in-out ${className} ${
        loading ? "opacity-100 visible" : "opacity-0 invisible"
      }`}
    >
      <div className="flex flex-col items-center">
        <Spinner size="lg" color="primary" />
        <span className="mt-3 text-gray-700 font-medium">{message}</span>
      </div>
    </div>
  );
}