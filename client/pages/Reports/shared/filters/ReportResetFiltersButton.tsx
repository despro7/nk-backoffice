import { Button } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";

interface ReportResetFiltersButtonProps {
  onPress: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  iconSize?: number;
}

export default function ReportResetFiltersButton({
  onPress,
  disabled = false,
  size = "md",
  className = "h-10 px-3 gap-2 bg-transparent border-1.5 border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500",
  iconSize = 16,
}: ReportResetFiltersButtonProps) {
  return (
    <Button onPress={onPress} disabled={disabled} size={size} variant="flat" className={className}>
      <DynamicIcon name="rotate-ccw" size={iconSize} className="shrink-0" />
      Скинути
    </Button>
  );
}