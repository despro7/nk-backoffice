import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Input,
  Spinner,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { PersonStatusChip } from '@/components/hr/PersonStatusChip';
import { PersonDrawer } from '../components/PersonDrawer';
import { PersonMergeModal } from '../components/PersonMergeModal';
import PageTabs from '@/components/PageTabs';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import { FormattedPhone } from '@/components/FormattedPhone';
import type { HrPersonDto } from '@shared/types/hr';
import { HR_BTN_PRIMARY } from '@/lib/buttonStyles';
import { HR_BTN_NEUTRAL, HR_TABLE_CLASS_NAMES } from '../hrUi';

type PersonFilter = 'employees' | 'outOfGroup' | 'duplicates';

export default function HrPersonsPage() {
  const { hasPermission } = useRoleAccess();
  const canManage = hasPermission(PERMISSIONS.ACTION_HR_PERSONS_MANAGE);
  const [filter, setFilter] = useState<PersonFilter>('employees');
  const [persons, setPersons] = useState<HrPersonDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<HrPersonDto | null>(null);
  const [mergeSource, setMergeSource] = useState<HrPersonDto | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  const [moveTarget, setMoveTarget] = useState<HrPersonDto | null>(null);
  const [moving, setMoving] = useState(false);

  const fetchPersons = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (filter === 'employees') params.set('group', 'employees');
      if (filter === 'outOfGroup') params.set('group', 'out');
      if (filter === 'duplicates') params.set('duplicates', 'true');
      const qs = params.toString() ? `?${params}` : '';
      const response = await fetch(`/api/hr/persons${qs}`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Не вдалося завантажити довідник', color: 'danger' });
        return;
      }
      setPersons(Array.isArray(data.data) ? data.data : []);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    void fetchPersons();
  }, [fetchPersons]);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (person: HrPersonDto) => {
    setEditing(person);
    setDrawerOpen(true);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/hr/persons/sync/pull', { method: 'POST', credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Синхронізація не вдалась', color: 'danger' });
        return;
      }
      ToastService.show({
        title: `Синхронізовано: +${data.data?.pulled ?? 0}, оновлено ${data.data?.updated ?? 0}`,
        color: 'success',
      });
      void fetchPersons();
    } finally {
      setSyncing(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeSource || !mergeTargetId) return;
    setMerging(true);
    try {
      const response = await fetch(`/api/hr/persons/${mergeSource.id}/merge`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPersonId: mergeTargetId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Не вдалося об\'єднати', color: 'danger' });
        return;
      }
      ToastService.show({ title: 'Особи об\'єднано', color: 'success' });
      setMergeSource(null);
      setMergeTargetId(null);
      void fetchPersons();
    } finally {
      setMerging(false);
    }
  };

  const handleMoveToEmployees = async (person: HrPersonDto) => {
    const response = await fetch(`/api/hr/persons/${person.id}/move-to-employees`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      ToastService.show({ title: data.message || 'Не вдалося перемістити', color: 'danger' });
      return;
    }
    ToastService.show({ title: 'Переміщено в групу Працівники', color: 'success' });
    void fetchPersons();
  };

  return (
    <div className="space-y-4">
      <PageTabs selectedKey={filter} onSelectionChange={(key) => setFilter(String(key) as PersonFilter)}>
        <Tab key="employees" title="Працівники" />
        <Tab key="outOfGroup" title="Поза групою" />
        <Tab key="duplicates" title="Дублікати" />
      </PageTabs>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          classNames={{ 
            base: 'max-w-xs',
            inputWrapper: 'data-[hover=true]:bg-white',
          }}
          placeholder="Пошук за ПІБ, телефоном, ІПН"
          value={search}
          isClearable
          onValueChange={setSearch}
          onKeyDown={(e) => { if (e.key === 'Enter') void fetchPersons(); }}
          startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <>
              <Button
                variant="flat" 
                onPress={() => void handleSync()}
                className={`${HR_BTN_NEUTRAL} bg-slate-50!`} 
                startContent={<DynamicIcon name="refresh-cw" size={16} className={`shrink-0 ${syncing ? 'animate-spin' : ''}`} />}
              >
                Синхронізувати з Dilovod
              </Button>
              <Button className={HR_BTN_PRIMARY} startContent={<DynamicIcon name="plus" size={16} />} onPress={openCreate}>
                Нова особа
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardBody>
          {loading && persons.length === 0 ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : persons.length === 0 ? (
            <div className="p-10 text-center">
              <DynamicIcon name="contact" size={28} className="mx-auto mb-2 text-default-500/50" />
              <p className="text-sm text-default-500">Немає записів</p>
            </div>
          ) : (
            <Table aria-label="Фізичні особи" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
              <TableHeader>
                <TableColumn>Контрагент</TableColumn>
                <TableColumn width={120}>ІПН</TableColumn>
                <TableColumn width={160}>Телефон</TableColumn>
                <TableColumn width={180}> Email</TableColumn>
                <TableColumn width={140}>Статус</TableColumn>
                {canManage ? <TableColumn width={120} align="center"> </TableColumn> : <TableColumn> </TableColumn>}
              </TableHeader>
              <TableBody>
                {persons.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <button type="button" className="text-left" onClick={() => openEdit(person)}>
                        <div className="font-medium text-default-900">{person.displayName}</div>
                        {person.dilovodCode ? (
                          <div className="text-xs text-default-500 font-mono mt-0.5">#{person.dilovodCode}</div>
                        ) : null}
                      </button>
                    </TableCell>
                    <TableCell>{person.taxCode || '—'}</TableCell>
                    <TableCell>
                      <FormattedPhone phone={person.phone} style="national" />
                    </TableCell>
                    <TableCell>{person.email || '—'}</TableCell>
                    <TableCell>
                      <PersonStatusChip person={person} />
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex justify-end gap-0.5">
                          {filter === 'outOfGroup' ? (
                            <Tooltip
                              content="Перемістити в групу Працівники"
                              placement='top-end'
                              showArrow
                              classNames={{
                                base: 'before:rounded-[3px] before:bg-amber-500 before:z-[10] before:shadow-none',
                                content: 'bg-amber-500 text-white rounded-sm',
                              }}
                            >
                              <Button
                                size="sm"
                                variant="light"
                                isIconOnly
                                aria-label="Перемістити в групу Працівники"
                                className="text-amber-600/70 hover:bg-amber-500/10!"
                                onPress={() => setMoveTarget(person)}
                              >
                                <DynamicIcon name="folder-input" size={16} />
                              </Button>
                            </Tooltip>
                          ) : null}
                          {filter === 'duplicates' ? (
                            <Tooltip
                              content="Об'єднати особи"
                              placement='top'
                              showArrow
                              classNames={{
                                base: 'before:rounded-[3px] before:bg-blue-500 before:z-[10] before:shadow-none',
                                content: 'bg-blue-500 text-white rounded-sm',
                              }}
                            >
                              <Button
                                size="sm"
                                variant="light"
                                isIconOnly
                                aria-label="Об'єднати особи"
                                className="text-blue-500 hover:bg-blue-500/10!"
                                onPress={() => {
                                  setMergeSource(person);
                                  setMergeTargetId(null);
                                }}
                              >
                                <DynamicIcon name="merge" size={16} />
                              </Button>
                            </Tooltip>
                          ) : null}
                          <Tooltip
                            content="Редагувати особу"
                            placement='top-end'
                            showArrow
                            classNames={{
                              base: 'before:rounded-[3px] before:bg-slate-600 before:z-[10] before:shadow-none',
                              content: 'bg-slate-600 text-white rounded-sm',
                            }}
                          >
                            <Button
                              size="sm"
                              variant="light"
                              isIconOnly
                              aria-label={`Редагувати ${person.displayName}`}
                              className="text-slate-700"
                              onPress={() => openEdit(person)}
                            >
                              <DynamicIcon name="pencil" size={16} />
                            </Button>
                          </Tooltip>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <ConfirmModal
        isOpen={moveTarget != null}
        title="Перемістити в групу «Працівники»?"
        message={
          moveTarget
            ? `Підтвердьте перенесення «${moveTarget.displayName}» до групи «Працівники» в Dilovod.`
            : ''
        }
        confirmText="Перемістити"
        cancelText="Скасувати"
        confirmColor="primary"
        confirmLoading={moving}
        onConfirm={async () => {
          if (!moveTarget || moving) return;
          setMoving(true);
          try {
            await handleMoveToEmployees(moveTarget);
            setMoveTarget(null);
          } finally {
            setMoving(false);
          }
        }}
        onCancel={() => {
          if (moving) return;
          setMoveTarget(null);
        }}
      />

      <PersonMergeModal
        isOpen={mergeSource != null}
        isLoading={merging}
        variant="select"
        sourcePerson={mergeSource}
        candidates={persons.filter((person) => person.id !== mergeSource?.id)}
        selectedId={mergeTargetId}
        onSelectedIdChange={setMergeTargetId}
        onClose={() => {
          setMergeSource(null);
          setMergeTargetId(null);
        }}
        onConfirm={() => void handleMerge()}
      />

      <PersonDrawer
        isOpen={drawerOpen}
        person={editing}
        canManage={canManage}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { void fetchPersons(); }}
      />
    </div>
  );
}
