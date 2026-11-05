import type { ReactNode } from 'react';

interface AuditLogRowProps {
  /** «05.11.2026 12:30 · Імʼя» */
  header: ReactNode;
  action: ReactNode;
  details?: ReactNode;
  /** Бейдж праворуч від дії (напр. джерело «Dilovod»). */
  badge?: ReactNode;
}

/** Один рядок журналу змін у стилі Warehouse/HR. */
export function AuditLogRow({ header, action, details, badge }: AuditLogRowProps) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="text-[11px] text-secondary">{header}</div>
      <div className="mt-0.5 text-xs text-gray-700">
        <span className="font-medium text-default-800">{action}</span>
        {badge ? <span className="ml-1.5 align-middle">{badge}</span> : null}
        {details ? <div className="mt-1 whitespace-pre-line text-default-600">{details}</div> : null}
      </div>
    </div>
  );
}
