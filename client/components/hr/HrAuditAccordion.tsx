import { useEffect, useState } from 'react';
import { Accordion, AccordionItem, Spinner } from '@heroui/react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import type { HrAuditEntityType, HrAuditLogDto } from '@shared/types/hr';
import { HrAuditLogList } from '@/pages/Hr/components/HrAuditLogEntry';

const ACCORDION_CLASS_NAMES = {
  base: 'px-1',
  trigger: 'my-1 py-2 px-2 rounded-sm [&>div]:flex-row [&>div]:items-baseline [&>div]:gap-2 data-[open=true]:bg-default-100/75 transition-colors duration-200',
  indicator: '-rotate-180',
  title: 'text-sm font-medium text-default-500 data-[open=true]:text-default-900 transition-colors duration-200',
  subtitle: 'text-xs text-default-500',
  content: 'pb-3 px-2',
};

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
    <div className={className}>
      <Accordion variant="bordered" className="border-1 px-0 overflow-hidden">
        <AccordionItem
          key="audit"
          title={title}
          subtitle={`(${logs.length} записів)`}
          classNames={ACCORDION_CLASS_NAMES}
        >
          {loading ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-default-500/75">Змін ще немає...</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              <HrAuditLogList logs={logs} />
            </div>
          )}
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export { ACCORDION_CLASS_NAMES as hrAccordionClassNames };
