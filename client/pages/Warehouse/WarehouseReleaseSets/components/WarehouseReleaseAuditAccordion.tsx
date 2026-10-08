import { useEffect, useState } from 'react';
import { Accordion, AccordionItem, Spinner } from '@heroui/react';
import { pluralize } from '@/lib/formatUtils';
import {
  formatWarehouseReleaseAuditAction,
  formatWarehouseReleaseAuditDetails,
  formatWarehouseReleaseAuditHeader,
} from '@shared/utils/warehouseReleaseAuditFormat';
import type { WarehouseReleaseAuditLogDto } from '../warehouseReleaseAuditTypes';
import { hrAccordionClassNames } from '@/components/hr/HrAuditAccordion';

interface Props {
  releaseId: number | null;
  refreshKey?: number;
  className?: string;
  onLayoutChange?: () => void;
}

export function WarehouseReleaseAuditAccordion({
  releaseId,
  refreshKey = 0,
  className,
  onLayoutChange,
}: Props) {
  const [logs, setLogs] = useState<WarehouseReleaseAuditLogDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!releaseId) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/warehouse/releases/${releaseId}/audit`, { credentials: 'include' });
        const json = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && json?.success) {
          setLogs(Array.isArray(json.data) ? json.data : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [releaseId, refreshKey]);

  if (!releaseId) return null;

  return (
    <div className={className}>
      <Accordion
        variant="bordered"
        className="border-1 px-0 overflow-hidden"
        onSelectionChange={() => onLayoutChange?.()}
      >
        <AccordionItem
          key="release-audit"
          title="Історія змін"
          subtitle={`${logs.length} ${pluralize(logs.length, 'запис', 'записи', 'записів')}`}
          classNames={hrAccordionClassNames}
        >
          {loading ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-default-500/75">Змін ще немає...</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {logs.map((item) => {
                const details = formatWarehouseReleaseAuditDetails(item.action, item.payload);
                return (
                  <div key={item.id} className="py-2 first:pt-0 last:pb-0">
                    <div className="text-[11px] text-secondary">
                      {formatWarehouseReleaseAuditHeader(item.createdAt, item.userName)}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-700">
                      <span className="font-medium text-default-800">
                        {formatWarehouseReleaseAuditAction(item.action)}
                      </span>
                      {details ? (
                        <div className="mt-1 whitespace-pre-line text-default-600">{details}</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AccordionItem>
      </Accordion>
    </div>
  );
}
