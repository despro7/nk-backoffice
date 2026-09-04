import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Input,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useUrlHashSync } from '@/hooks/useUrlHashSync';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  HR_PAY_GROUP_LABELS,
  type HrEmployeeListItemDto,
  type HrLegalEntityDto,
} from '@shared/types/hr';
import { EmployeeDrawer } from './EmployeeDrawer';
import { TimesheetImportModal } from './TimesheetImportModal';
import { HR_BTN_NEUTRAL, HR_BTN_PRIMARY, HR_TABLE_CLASS_NAMES, HrSpecChip, hrEmployerTokensFromName, hrPayGroupTokens, hrStatusTokens } from '../hrUi';

export default function HrEmployeesPage() {
  const { hasPermission } = useRoleAccess();
  const canManage = hasPermission(PERMISSIONS.ACTION_HR_EMPLOYEES_MANAGE);
  const canManagePayTerms = hasPermission(PERMISSIONS.ACTION_HR_PAYTERMS_MANAGE);
  const canRevealCard = hasPermission(PERMISSIONS.ACTION_HR_PAYOUTS_VIEW);

  const [employees, setEmployees] = useState<HrEmployeeListItemDto[]>([]);
  const [legalEntities, setLegalEntities] = useState<HrLegalEntityDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const fetchEmployees = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const qs = q?.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
      const response = await fetch(`/api/hr/employees${qs}`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Не вдалося завантажити співробітників', color: 'danger' });
        return;
      }
      setEmployees(Array.isArray(data.data) ? data.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLegalEntities = useCallback(async () => {
    const response = await fetch('/api/hr/legal-entities', { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    setLegalEntities(Array.isArray(data.data) ? data.data : []);
  }, []);

  useEffect(() => {
    void fetchEmployees();
    void fetchLegalEntities();
  }, [fetchEmployees, fetchLegalEntities]);

  useUrlHashSync(
    { emp: drawerOpen && editingId != null ? editingId : null },
    (params) => {
      const raw = params.get('emp');
      if (!raw) {
        if (drawerOpen && editingId != null) {
          setDrawerOpen(false);
          setEditingId(null);
        }
        return;
      }
      const id = Number(raw);
      if (!Number.isInteger(id) || id <= 0) return;
      setEditingId(id);
      setDrawerOpen(true);
    },
    { replace: true },
  );

  const openCreate = () => {
    setEditingId(null);
    setDrawerOpen(true);
  };

  const openEdit = (id: number) => {
    setEditingId(id);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
  };

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/hr/employees/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      ToastService.show({ title: data.message || 'Не вдалося видалити', color: 'danger' });
      return;
    }
    ToastService.show({ title: 'Співробітника видалено', color: 'success' });
    await fetchEmployees(search);
  };

  if (!hasPermission(PERMISSIONS.PAGE_HR_EMPLOYEES)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Доступ заборонено</h2>
          <p className="text-gray-600">У вас немає прав доступу до цієї сторінки.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          className="max-w-xs"
          placeholder="Пошук за ПІБ"
          value={search}
          onValueChange={setSearch}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void fetchEmployees(search);
          }}
          startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
        />
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button className={`${HR_BTN_NEUTRAL} bg-slate-50! `} startContent={<DynamicIcon name="upload" size={16} className="shrink-0" />} onPress={() => setImportOpen(true)}>
              Імпорт Excel
            </Button>
            <Button className={HR_BTN_PRIMARY} startContent={<DynamicIcon name="plus" size={16} className="shrink-0" />} onPress={openCreate}>
              Новий співробітник
            </Button>
          </div>
        ) : null}
      </div>

      <Card className="hover:shadow-md transition-shadow">
        <CardBody className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Завантаження...</div>
          ) : employees.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Немає співробітників</div>
          ) : (
            <Table
              aria-label="Співробітники"
              removeWrapper
              classNames={HR_TABLE_CLASS_NAMES}
            >
              <TableHeader>
                <TableColumn>ПІБ</TableColumn>
                <TableColumn>Роботодавець</TableColumn>
                <TableColumn>Група</TableColumn>
                <TableColumn>Картка</TableColumn>
                <TableColumn className="text-center">Статус</TableColumn>
                <TableColumn className="text-center">Керування</TableColumn>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id} className={employee.status === 'active' ? undefined : 'opacity-40'}>
                    <TableCell>
                      <button type="button" className="text-left" onClick={() => openEdit(employee.id)}>
                        <div className="font-medium">{employee.displayName}</div>
                        {employee.userName ? <div className="text-xs text-gray-500">{employee.userName}</div> : null}
                      </button>
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
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">{employee.cardMasked || '—'}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {employee.status === 'active' ? (
                        <HrSpecChip tokens={hrStatusTokens('active')} icon="success">активний</HrSpecChip>
                      ) : (
                        <HrSpecChip tokens={hrStatusTokens('inactive')} icon="error">неактивний</HrSpecChip>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="light" isIconOnly aria-label="Відкрити" className="text-slate-700 hover:bg-slate-700/10!" onPress={() => openEdit(employee.id)}>
                          <DynamicIcon name="pencil" size={16} className="shrink-0" />
                        </Button>
                        {canManage ? (
                          <Button
                            size="sm"
                            variant="light"
                            isIconOnly
                            aria-label="Видалити"
                            className="text-rose-600 hover:bg-rose-600/10!"
                            onPress={() => setDeleteId(employee.id)}
                          >
                            <DynamicIcon name="trash-2" size={16} className="shrink-0" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <EmployeeDrawer
        isOpen={drawerOpen}
        employeeId={editingId}
        legalEntities={legalEntities}
        canManage={canManage}
        canManagePayTerms={canManagePayTerms}
        canRevealCard={canRevealCard}
        onClose={closeDrawer}
        onSaved={() => void fetchEmployees(search)}
      />

      <TimesheetImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void fetchEmployees(search)}
      />

      <ConfirmModal
        isOpen={deleteId != null}
        title="Видалити співробітника?"
        message="Картку буде видалено. Після появи табеля видалення стане мʼяким."
        confirmText="Так, видалити"
        cancelText="Скасувати"
        onConfirm={async () => {
          if (deleteId != null) await handleDelete(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
