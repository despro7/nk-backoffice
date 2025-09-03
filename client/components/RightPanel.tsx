import { cn } from "@/lib/utils";
import React from "react";

interface RightPanelProps {
  className?: string;
  children: React.ReactNode;
}

export const RightPanel = React.forwardRef<HTMLDivElement, RightPanelProps>(({ className, children }, ref) => {
  return (
    <div ref={ref} className={cn("flex flex-col items-start gap-8 md:w-[320px] shrink-0 self-start sticky top-6", className)}>
      {children}
    </div>
  );
});