import { useEffect, useState } from 'react';
import { Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import type { HrAuditLogDto } from '@shared/types/hr';
import { HrAuditLogList } from '../components/HrAuditLogEntry';

interface TimesheetCellAuditPopoverProps {
  entryId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TimesheetCellAuditPopover({ entryId, isOpen, onClose }: TimesheetCellAuditPopoverProps) {
  const { hasPermission } = useRoleAccess();
  const canView = hasPermission(PERMISSIONS.ACTION_HR_AUDIT_VIEW);
  const [logs, setLogs] = useState<HrAuditLogDto[]>([]);

  useEffect(() => {
    if (!isOpen || !canView || !entryId) {
      setLogs([]);
      return;
    }
    void fetch(`/api/hr/audit?entityType=timesheet_entry&entityId=${entryId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data.data) ? data.data : []))
      .catch(() => setLogs([]));
  }, [isOpen, canView, entryId]);

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }} size="md">
      <ModalContent>
        <ModalHeader>Логи змін комірки</ModalHeader>
        <ModalBody>
          {!canView ? (
            <p className="text-sm text-default-500">Немає доступу до журналу</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-default-500">Змін не знайдено</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              <HrAuditLogList logs={logs} variant="timesheet" />
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
