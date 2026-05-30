import type { ReactNode } from "react";

interface ReportsSectionCardProps {
  children: ReactNode;
  title?: string;
  className?: string;
}

export default function ReportsSectionCard({
  children,
  title,
  className,
}: ReportsSectionCardProps) {
  const cardClassName = className ? `bg-white rounded-lg p-6 ${className}` : "bg-white rounded-lg p-6";

  return (
    <div className={cardClassName}>
      {title ? <h2 className="text-xl font-semibold mb-6">{title}</h2> : null}
      {children}
    </div>
  );
}