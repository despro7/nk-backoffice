import { useEffect, useState } from 'react';
import {
  formatWarehouseReleaseAuditAction,
  formatWarehouseReleaseAuditDetails,
  formatWarehouseReleaseAuditHeader,
} from '@shared/utils/warehouseReleaseAuditFormat';
import type { WarehouseReleaseAuditLogDto } from '../warehouseReleaseAuditTypes';
import { AuditAccordion } from '@/components/audit/AuditAccordion';
import { AuditLogRow } from '@/components/audit/AuditLogRow';
import { formatReleaseAuditAccordionTitle } from '@shared/utils/releaseHistoryDisplayTitle';

interface Props {
  releaseId: number | null;
  refreshKey?: number;
  className?: string;
  onLayoutChange?: () => void;
  /** Додатковий контекст у заголовку (напр. номер документа кроку коригування). */
  titleHint?: string | null;
}

export function WarehouseReleaseAuditAccordion({
  releaseId,
  refreshKey = 0,
  className,
  onLayoutChange,
  titleHint,
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
    <AuditAccordion
      title={formatReleaseAuditAccordionTitle(titleHint)}
      count={logs.length}
      loading={loading}
      className={className}
      onSelectionChange={onLayoutChange}
    >
      {logs.map((item) => (
        <AuditLogRow
          key={item.id}
          header={formatWarehouseReleaseAuditHeader(item.createdAt, item.userName)}
          action={formatWarehouseReleaseAuditAction(item.action)}
          details={formatWarehouseReleaseAuditDetails(item.action, item.payload)}
        />
      ))}
    </AuditAccordion>
  );
}
