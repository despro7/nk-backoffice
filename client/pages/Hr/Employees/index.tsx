import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SortDescriptor } from '@heroui/react';
import {
  Button,
  Card,
  CardBody,
  Input,
  Select,
  SelectItem,
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
import { filterSelectableLegalEntities } from '@shared/utils/hrEmploymentDedupe';
import {
  HR_PAY_GROUP_LABELS,
  type HrEmployeeListItemDto,
  type HrLegalEntityDto,
} from '@shared/types/hr';
import { EmployeeDrawer } from './EmployeeDrawer';
import { EmployeesArchiveModal } from './EmployeesArchiveModal';
import { DEFAULT_EMPLOYEE_SORT, sortHrEmployees } from './employeeTableSort';
import { getEmployerEmployeeCount, type EmployerEmployeeCounts } from './employeeEmployerFilter';
import { HR_BTN_PRIMARY } from '@/lib/buttonStyles';
import { HR_BTN_NEUTRAL, HR_TABLE_CLASS_NAMES, HrLinkedAccountIndicator, SpecChip, hrEmployerTokensFromName, hrPayGroupTokens, hrStatusTokens } from '../hrUi';
import { useHrPayGroupHues } from '../useHrPayGroupHues';

export default function HrEmployeesPage() {
  const { hasPermission } = useRoleAccess();
  const canManage = hasPermission(PERMISSIONS.ACTION_HR_EMPLOYEES_MANAGE);
  const canRevealCard = hasPermission(PERMISSIONS.ACTION_HR_PAYOUTS_VIEW);

  const { hueOverrides: payGroupHueOverrides } = useHrPayGroupHues();
  const [employees, setEmployees] = useState<HrEmployeeListItemDto[]>([]);
  const [legalEntities, setLegalEntities] = useState<HrLegalEntityDto[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [employerFilterId, setEmployerFilterId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [syncingEmployees, setSyncingEmployees] = useState(false);
  const [employerCounts, setEmployerCounts] = useState<EmployerEmployeeCounts>({});
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>(DEFAULT_EMPLOYEE_SORT);

  const sortedEmployees = useMemo(
    () => sortHrEmployees(employees, sortDescriptor),
    [employees, sortDescriptor],
  );

  const employerSelectOptions = useMemo(
    () =>
      filterSelectableLegalEntities(legalEntities).sort((a, b) =>
        a.name.localeCompare(b.name, 'uk'),
      ),
    [legalEntities],
  );

  const fetchEmployerCounts = useCallback(async () => {
    const response = await fetch('/api/hr/employees/employer-counts', { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    setEmployerCounts(data.data && typeof data.data === 'object' ? data.data : {});
  }, []);

  const fetchEmployees = useCallback(async (q?: string, employerId?: number | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q?.trim()) params.set('search', q.trim());
      if (employerId != null && employerId > 0) params.set('legalEntityId', String(employerId));
      const qs = params.toString() ? `?${params.toString()}` : '';
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
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void fetchEmployees(debouncedSearch, employerFilterId);
  }, [fetchEmployees, debouncedSearch, employerFilterId]);

  useEffect(() => {
    void fetchLegalEntities();
    void fetchEmployerCounts();
  }, [fetchLegalEntities, fetchEmployerCounts]);

  useUrlHashSync(
    {
      emp: drawerOpen && editingId != null ? editingId : null,
      employer: employerFilterId,
    },
    (params) => {
      const rawEmployer = params.get('employer');
      if (rawEmployer) {
        const employerId = Number(rawEmployer);
        setEmployerFilterId(Number.isInteger(employerId) && employerId > 0 ? employerId : null);
      } else {
        setEmployerFilterId(null);
      }

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

  const handleSyncEmployees = async () => {
    setSyncingEmployees(true);
    try {
      const response = await fetch('/api/hr/sync/employees', { method: 'POST', credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Синхронізація не вдалась', color: 'danger' });
        return;
      }
      const result = data.data ?? {};
      ToastService.show({
        title: `Синхронізовано: оновлено ${result.updated ?? 0}, створено ${result.created ?? 0}, без пари ${result.unmatched ?? 0}`,
        color: 'success',
      });
      await fetchEmployees(search, employerFilterId);
      await fetchEmployerCounts();
    } finally {
      setSyncingEmployees(false);
    }
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
    ToastService.show({ title: 'Співробітника видалено', color: 'success', icon: 'user-round-x' });
    await fetchEmployees(search, employerFilterId);
    await fetchEmployerCounts();
  };

  if (!hasPermission(PERMISSIONS.PAGE_HR_EMPLOYEES)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-default-900 mb-4">Доступ заборонено</h2>
          <p className="text-default-500">У вас немає прав доступу до цієї сторінки.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          classNames={{
            base: 'max-w-3xs',
            inputWrapper: 'data-[hover=true]:bg-white',
          }}
          autoComplete="off"
          placeholder="Пошук за ПІБ"
          value={search}
          isClearable
          onValueChange={setSearch}
          startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
        />
        <Select
          aria-label="Роботодавець"
          placeholder="Роботодавець"
          className="max-w-46 mr-auto"
          classNames={{
            trigger: 'data-[hover=true]:bg-white',
          }}
          popoverProps={{
            classNames: {
              base: 'w-60',
              content: 'p-1'
            },
          }}
          selectedKeys={employerFilterId != null ? [String(employerFilterId)] : []}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0];
            if (selected == null || selected === '') {
              setEmployerFilterId(null);
              return;
            }
            const id = Number(selected);
            setEmployerFilterId(Number.isInteger(id) && id > 0 ? id : null);
          }}
          items={employerSelectOptions}
          isClearable
          onClear={() => setEmployerFilterId(null)}
        >
          {(item) => {
            const count = getEmployerEmployeeCount(employerCounts, item.id);
            const label = `${item.name} (${count})`;
            return (
              <SelectItem key={String(item.id)} textValue={label}>
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 tabular-nums text-default-400"> ({count})</span>
              </SelectItem>
            );
          }}
        </Select>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              className={`${HR_BTN_NEUTRAL} bg-slate-50!`}
              startContent={<DynamicIcon name="refresh-cw" size={16} className={`shrink-0 ${syncingEmployees ? 'animate-spin' : ''}`} />}
              onPress={() => void handleSyncEmployees()}
            >
              Синхронізувати
            </Button>
            <Button
              className={`${HR_BTN_NEUTRAL} bg-slate-50!`}
              startContent={<DynamicIcon name="archive" size={16} className="shrink-0" />}
              onPress={() => setArchiveOpen(true)}
            >
              Архів
            </Button>
            <Button className={HR_BTN_PRIMARY} startContent={<DynamicIcon name="plus" size={16} className="shrink-0" />} onPress={openCreate}>
              Новий співробітник
            </Button>
          </div>
        ) : null}
      </div>

      <Card className="shadow-none rounded-lg">
        <CardBody className="p-3">
          {loading ? (
            <div className="p-8 text-center text-default-500">Завантаження...</div>
          ) : sortedEmployees.length === 0 ? (
            <div className="p-8 text-center text-default-500">
              {employerFilterId != null || debouncedSearch.trim()
                ? 'Нічого не знайдено за обраними фільтрами'
                : 'Немає співробітників'}
            </div>
          ) : (
            <Table
              aria-label="Співробітники"
              removeWrapper
              classNames={HR_TABLE_CLASS_NAMES}
              sortDescriptor={sortDescriptor}
              onSortChange={setSortDescriptor}
            >
              <TableHeader>
                <TableColumn key="index" width={48}>№</TableColumn>
                <TableColumn key="displayName" allowsSorting>ПІБ</TableColumn>
                <TableColumn key="currentLegalEntityName" allowsSorting>Роботодавець</TableColumn>
                <TableColumn key="currentPayGroup" allowsSorting>Група</TableColumn>
                <TableColumn key="cardMasked" allowsSorting>Картка</TableColumn>
                <TableColumn key="status" allowsSorting>Статус</TableColumn>
                <TableColumn key="actions">Керування</TableColumn>
              </TableHeader>
              <TableBody>
                {sortedEmployees.map((employee, index) => (
                  <TableRow key={employee.id} className={employee.status === 'active' ? undefined : 'opacity-40'}>
                    <TableCell className="text-default-400 tabular-nums text-sm">{index + 1}</TableCell>
                    <TableCell>
                      <button type="button" className="text-left max-w-full" onClick={() => openEdit(employee.id)}>
                        <div className="flex items-center gap-1.5 font-medium">
                          <span>{employee.displayName}</span>
                          {employee.userName ? <HrLinkedAccountIndicator userName={employee.userName} /> : null}
                          {employee.hasPayWarning ? (
                            <DynamicIcon
                              name="triangle-alert"
                              size={15}
                              className="shrink-0 text-rose-600"
                              aria-label="Перевірте ставки"
                            />
                          ) : null}
                        </div>
                        {employee.notes ? (
                          <div className="text-xs truncate max-w-full text-gray-400">{employee.notes}</div>
                        ) : null}
                      </button>
                    </TableCell>
                    <TableCell>
                      {employee.currentLegalEntityName ? (
                        <SpecChip tokens={hrEmployerTokensFromName(employee.currentLegalEntityName)} rounded="sm">
                          {employee.currentLegalEntityName}
                        </SpecChip>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {employee.currentPayGroup ? (
                        <SpecChip tokens={hrPayGroupTokens(employee.currentPayGroup, 'soft', payGroupHueOverrides)} rounded="sm">
                          {HR_PAY_GROUP_LABELS[employee.currentPayGroup]}
                        </SpecChip>
                      ) : (
                        <span className="text-sm text-default-500">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">{employee.cardMasked || '—'}</span>
                    </TableCell>
                    <TableCell>
                      {employee.status === 'active' ? (
                        <SpecChip tokens={hrStatusTokens('active')} icon="success">активний</SpecChip>
                      ) : (
                        <SpecChip tokens={hrStatusTokens('inactive')} icon="error">неактивний</SpecChip>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
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
        canRevealCard={canRevealCard}
        onClose={closeDrawer}
        onSaved={() => {
          void fetchEmployees(search, employerFilterId);
          void fetchEmployerCounts();
        }}
      />

      <EmployeesArchiveModal
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onRestored={() => {
          void fetchEmployees(search, employerFilterId);
          void fetchEmployerCounts();
        }}
      />

      <ConfirmModal
        isOpen={deleteId != null}
        title="Видалити співробітника?"
        message="Співробітника буде переміщено в архів."
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
