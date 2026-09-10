import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { ToastService } from '@/services/ToastService';
import { HR_PAY_GROUP_LABELS, type HrEmployeeListItemDto } from '@shared/types/hr';
import { HR_BTN_NEUTRAL, HR_TABLE_CLASS_NAMES, HrSpecChip, hrEmployerTokensFromName, hrPayGroupTokens } from '../hrUi';

interface EmployeesArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
}

const deletedAtFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDeletedAt(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return deletedAtFormatter.format(parsed);
}

export function EmployeesArchiveModal({ isOpen, onClose, onRestored }: EmployeesArchiveModalProps) {
  const [employees, setEmployees] = useState<HrEmployeeListItemDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoreId, setRestoreId] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  const fetchArchived = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ archived: 'true' });
      const trimmed = q?.trim();
      if (trimmed) params.set('search', trimmed);
      const response = await fetch(`/api/hr/employees?${params.toString()}`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Не вдалося завантажити архів', color: 'danger' });
        return;
      }
      setEmployees(Array.isArray(data.data) ? data.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void fetchArchived();
  }, [fetchArchived, isOpen]);

  const handleClose = () => {
    if (restoring) return;
    setSearch('');
    setRestoreId(null);
    onClose();
  };

  const handleRestore = async (id: number) => {
    setRestoring(true);
    try {
      const response = await fetch(`/api/hr/employees/${id}/restore`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Не вдалося відновити', color: 'danger' });
        return;
      }
      ToastService.show({ title: 'Співробітника відновлено', color: 'success' });
      await fetchArchived(search);
      onRestored();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} size="4xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
            <DynamicIcon name="archive" size={18} className="shrink-0 text-text-secondary" />
            Архів співробітників
          </ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              className="max-w-xs"
              placeholder="Пошук за ПІБ"
              value={search}
              onValueChange={setSearch}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void fetchArchived(search);
              }}
              startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
            />

            {loading ? (
              <div className="py-10 text-center text-text-secondary">Завантаження...</div>
            ) : employees.length === 0 ? (
              <div className="py-10 text-center text-text-secondary">Архів порожній</div>
            ) : (
              <Table aria-label="Архів співробітників" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
                <TableHeader>
                  <TableColumn>ПІБ</TableColumn>
                  <TableColumn>Роботодавець</TableColumn>
                  <TableColumn>Група</TableColumn>
                  <TableColumn>Видалено</TableColumn>
                  <TableColumn className="text-center">Керування</TableColumn>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id} className="opacity-70">
                      <TableCell>
                        <div className="font-medium">{employee.displayName}</div>
                        {employee.userName ? <div className="text-xs text-text-secondary">{employee.userName}</div> : null}
                      </TableCell>
                      <TableCell>
                        {employee.currentLegalEntityName ? (
                          <HrSpecChip tokens={hrEmployerTokensFromName(employee.currentLegalEntityName)}>
                            {employee.currentLegalEntityName}
                          </HrSpecChip>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {employee.currentPayGroup ? (
                          <HrSpecChip tokens={hrPayGroupTokens(employee.currentPayGroup)}>
                            {HR_PAY_GROUP_LABELS[employee.currentPayGroup]}
                          </HrSpecChip>
                        ) : (
                          <span className="text-sm text-text-secondary">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-text-secondary">{formatDeletedAt(employee.deletedAt)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          <Button
                            size="sm"
                            variant="light"
                            className="text-emerald-700 hover:bg-emerald-700/10!"
                            startContent={<DynamicIcon name="undo-2" size={16} className="shrink-0" />}
                            onPress={() => setRestoreId(employee.id)}
                          >
                            Відновити
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ModalBody>
          <ModalFooter>
            <Button className={HR_BTN_NEUTRAL} variant="flat" onPress={handleClose}>
              Закрити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={restoreId != null}
        title="Відновити співробітника?"
        message="Запис повернеться до основного списку зі статусом «активний»."
        confirmText="Так, відновити"
        confirmColor="success"
        cancelText="Скасувати"
        confirmLoading={restoring}
        onConfirm={async () => {
          if (restoreId != null) await handleRestore(restoreId);
          setRestoreId(null);
        }}
        onCancel={() => setRestoreId(null)}
      />
    </>
  );
}
