import * as React from "react"
import { cn } from "../../lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, ...props }, ref) => {
    const progressValue = Math.max(0, Math.min(100, value || 0));

    return (
      <div
        ref={ref}
        className={cn("relative h-4 w-full overflow-hidden rounded-full bg-success-400", className)}
        {...props}
      >
        <div
          className="h-full bg-success-500 transition-all duration-300 ease-out"
          style={{ 
            width: `${progressValue}%`,
            minWidth: '0%',
            maxWidth: '100%'
          }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };