import { useEffect, useState } from 'react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import { HrAuditLogList } from '@/pages/Hr/components/HrAuditLogEntry';
import { AuditAccordion } from '@/components/audit/AuditAccordion';
import type { HrAuditEntityType, HrAuditLogDto } from '@shared/types/hr';

interface HrAuditAccordionProps {
  entityType: HrAuditEntityType;
  entityId: number | null;
  title?: string;
  refreshKey?: number;
  className?: string;
}

export function HrAuditAccordion({
  entityType,
  entityId,
  title = 'Історія змін',
  refreshKey = 0,
  className,
}: HrAuditAccordionProps) {
  const { hasPermission } = useRoleAccess();
  const canView = hasPermission(PERMISSIONS.ACTION_HR_AUDIT_VIEW);
  const [logs, setLogs] = useState<HrAuditLogDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canView || !entityId) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          entityType,
          entityId: String(entityId),
          limit: '50',
        });
        const response = await fetch(`/api/hr/audit?${qs}`, { credentials: 'include' });
        const json = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) {
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
  }, [canView, entityId, entityType, refreshKey]);

  if (!canView || !entityId) return null;

  return (
    <AuditAccordion title={title} count={logs.length} loading={loading} className={className}>
      <HrAuditLogList logs={logs} />
    </AuditAccordion>
  );
}

