import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  HR_LEGAL_ENTITY_KIND_LABELS,
  HR_LEGAL_ENTITY_KINDS,
  type HrLegalEntityDto,
  type HrLegalEntityKind,
  type HrLegalEntityWritePayload,
} from '@shared/types/hr';
import {
  HR_BTN_PRIMARY,
  HR_TABLE_CLASS_NAMES,
  HrSpecChip,
  hrLegalEntityKindTokens,
  hrStatusTokens,
} from '../hrUi';

const SEED_CODES = new Set(['fop', 'tov', 'unofficial_cash']);

const INPUT_CLASS_NAMES = {
  inputWrapper: 'shadow-none border border-border-subtle bg-surface-card group-data-[focus=true]:border-sky-500 group-data-[focus=true]:ring-1 group-data-[focus=true]:ring-sky-500/30',
};

const SELECT_CLASS_NAMES = {
  trigger: 'shadow-none border border-border-subtle bg-surface-card data-[focus=true]:border-sky-500 data-[focus=true]:ring-1 data-[focus=true]:ring-sky-500/30',
};

interface EmployerFormState {
  name: string;
  kind: HrLegalEntityKind;
  isActive: boolean;
}

const emptyForm = (): EmployerFormState => ({
  name: '',
  kind: 'fop',
  isActive: true,
});

const kindOptions = HR_LEGAL_ENTITY_KINDS.map((kind) => ({
  key: kind,
  label: HR_LEGAL_ENTITY_KIND_LABELS[kind],
}));

export default function HrEmployersPage() {
  const { hasPermission } = useRoleAccess();
  const canView = hasPermission(PERMISSIONS.PAGE_HR_EMPLOYEES);
  const canManage = hasPermission(PERMISSIONS.ACTION_HR_EMPLOYEES_MANAGE);

  const [employers, setEmployers] = useState<HrLegalEntityDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EmployerFormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deletingItem = useMemo(
    () => (deleteId != null ? employers.find((item) => item.id === deleteId) ?? null : null),
    [deleteId, employers],
  );
  const mergeTargetOptions = useMemo(() => {
    if (!deletingItem) return [];
    return employers.filter(
      (item) => item.id !== deletingItem.id && item.isActive && item.kind === deletingItem.kind,
    );
  }, [deletingItem, employers]);

  const editingItem = useMemo(
    () => (editingId != null ? employers.find((item) => item.id === editingId) ?? null : null),
    [editingId, employers],
  );
  const isSeedEditing = Boolean(editingItem && SEED_CODES.has(editingItem.code));

  const fetchEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/hr/legal-entities?includeInactive=true', { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Не вдалося завантажити роботодавців', color: 'danger' });
        return;
      }
      setEmployers(Array.isArray(data.data) ? data.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    void fetchEmployers();
  }, [canView, fetchEmployers]);

  const visibleEmployers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employers;
    return employers.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        HR_LEGAL_ENTITY_KIND_LABELS[item.kind].toLowerCase().includes(q),
    );
  }, [employers, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (item: HrLegalEntityDto) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      kind: item.kind,
      isActive: item.isActive,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const openDelete = (item: HrLegalEntityDto) => {
    if (SEED_CODES.has(item.code)) return;
    setDeleteId(item.id);
    const fallback = employers.find(
      (row) => row.id !== item.id && row.isActive && row.kind === item.kind && SEED_CODES.has(row.code),
    );
    setDeleteTargetId(fallback?.id ?? null);
  };

  const closeDelete = () => {
    setDeleteId(null);
    setDeleteTargetId(null);
  };

  const confirmDelete = async () => {
    if (!canManage || !deleteId || !deleteTargetId) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/hr/legal-entities/${deleteId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLegalEntityId: deleteTargetId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося видалити', color: 'danger' });
        return;
      }
      ToastService.show({ title: 'Роботодавця видалено, дані перенесено', color: 'success' });
      closeDelete();
      await fetchEmployers();
    } finally {
      setDeleting(false);
    }
  };

  const save = async () => {
    if (!canManage) return;
    const payload: HrLegalEntityWritePayload = {
      name: form.name.trim(),
      kind: form.kind,
      isActive: form.isActive,
    };
    if (!payload.name) {
      ToastService.show({ title: 'Вкажіть назву роботодавця', color: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const url = editingId ? `/api/hr/legal-entities/${editingId}` : '/api/hr/legal-entities';
      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося зберегти', color: 'danger' });
        return;
      }
      ToastService.show({
        title: editingId ? 'Роботодавця оновлено' : 'Роботодавця створено',
        color: 'success',
      });
      closeForm();
      await fetchEmployers();
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-text-primary mb-4">Доступ заборонено</h2>
          <p className="text-text-secondary">У вас немає прав доступу до довідника роботодавців.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          size="md"
          placeholder="Пошук за назвою або типом"
          value={search}
          onValueChange={setSearch}
          className="max-w-xs"
          startContent={<DynamicIcon name="search" size={14} className="text-default-400" />}
        />
        {canManage ? (
          <Button
            size="md"
            className={HR_BTN_PRIMARY}
            startContent={<DynamicIcon name="plus" size={14} />}
            onPress={openCreate}
          >
            Додати роботодавця
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-text-secondary">
        Конкретизуйте роботодавців для табеля та розрахунку — наприклад «ФОП Бубнова М.В.» або «ТОВ Нова Кухня».
      </p>

      <Card className="border border-border-subtle shadow-surface">
        <CardBody>
          {loading && employers.length === 0 ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : visibleEmployers.length === 0 ? (
            <div className="p-10 text-center">
              <DynamicIcon name="building-2" size={28} className="mx-auto mb-2 text-text-secondary/50" />
              <p className="text-sm text-text-secondary">
                {search.trim() ? 'Нічого не знайдено.' : 'Немає роботодавців.'}
              </p>
            </div>
          ) : (
            <Table
              aria-label="Роботодавці"
              removeWrapper
              classNames={HR_TABLE_CLASS_NAMES}
            >
              <TableHeader>
                <TableColumn>Назва</TableColumn>
                <TableColumn width={160}>Тип</TableColumn>
                <TableColumn width={140}>Статус</TableColumn>
                {canManage ? <TableColumn width={96} align="center"> </TableColumn> : <TableColumn> </TableColumn>}
              </TableHeader>
              <TableBody>
                {visibleEmployers.map((item) => (
                  <TableRow key={item.id} className={!item.isActive ? 'opacity-50' : undefined}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => canManage && openEdit(item)}
                      >
                        <div className="font-medium text-text-primary">{item.name}</div>
                        {!SEED_CODES.has(item.code) ? (
                          <div className="text-xs text-text-secondary font-mono mt-0.5">{item.code}</div>
                        ) : null}
                      </button>
                    </TableCell>
                    <TableCell>
                      <HrSpecChip tokens={hrLegalEntityKindTokens(item.kind)}>
                        {HR_LEGAL_ENTITY_KIND_LABELS[item.kind]}
                      </HrSpecChip>
                    </TableCell>
                    <TableCell>
                      <HrSpecChip
                        tokens={hrStatusTokens(item.isActive ? 'active' : 'inactive')}
                        icon={item.isActive ? 'success' : 'error'}
                      >
                        {item.isActive ? 'активний' : 'неактивний'}
                      </HrSpecChip>
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex justify-start gap-0.5">
                          <Button
                            size="sm"
                            variant="light"
                            isIconOnly
                            aria-label={`Редагувати ${item.name}`}
                            className="text-slate-700"
                            onPress={() => openEdit(item)}
                          >
                            <DynamicIcon name="pencil" size={16} className="shrink-0" />
                          </Button>
                          {!SEED_CODES.has(item.code) ? (
                            <Button
                              size="sm"
                              variant="light"
                              isIconOnly
                              aria-label={`Видалити ${item.name}`}
                              className="text-rose-600"
                              onPress={() => openDelete(item)}
                            >
                              <DynamicIcon name="trash-2" size={16} className="shrink-0" />
                            </Button>
                          ) : null}
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

      <Modal isOpen={formOpen} onClose={closeForm} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingId ? 'Редагувати роботодавця' : 'Новий роботодавець'}
              </ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                <Input
                  label="Назва"
                  labelPlacement="outside"
                  variant="bordered"
                  placeholder="ФОП Бубнова М.В."
                  value={form.name}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
                  isRequired
                  autoFocus
                  classNames={INPUT_CLASS_NAMES}
                />
                {isSeedEditing ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm text-text-primary">Тип</span>
                    <div>
                      <HrSpecChip tokens={hrLegalEntityKindTokens(form.kind)}>
                        {HR_LEGAL_ENTITY_KIND_LABELS[form.kind]}
                      </HrSpecChip>
                    </div>
                    <p className="text-xs text-text-secondary">Тип базового запису зафіксовано системою</p>
                  </div>
                ) : (
                  <Select
                    label="Тип"
                    labelPlacement="outside"
                    variant="bordered"
                    placeholder="Оберіть тип"
                    items={kindOptions}
                    selectedKeys={[form.kind]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0];
                      if (selected && HR_LEGAL_ENTITY_KINDS.includes(selected as HrLegalEntityKind)) {
                        setForm((prev) => ({ ...prev, kind: selected as HrLegalEntityKind }));
                      }
                    }}
                    classNames={SELECT_CLASS_NAMES}
                    renderValue={(items) =>
                      items.map((item) => (
                        <HrSpecChip key={item.key} tokens={hrLegalEntityKindTokens(String(item.key))}>
                          {item.textValue}
                        </HrSpecChip>
                      ))
                    }
                  >
                    {(item) => (
                      <SelectItem key={item.key} textValue={item.label}>
                        {item.label}
                      </SelectItem>
                    )}
                  </Select>
                )}
                {editingId ? (
                  <Switch
                    size="sm"
                    isSelected={form.isActive}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value }))}
                  >
                    Активний
                  </Switch>
                ) : null}
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose} isDisabled={saving}>
                  Скасувати
                </Button>
                <Button color="primary" onPress={() => void save()} isLoading={saving}>
                  Зберегти
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={deleteId != null} onClose={closeDelete} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Видалити роботодавця</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                <p className="text-sm text-text-secondary">
                  Роботодавця «{deletingItem?.name}» буде видалено. Усі зайнятості, записи табеля,
                  ставки та виплати буде перенесено до обраного роботодавця.
                </p>
                {mergeTargetOptions.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Немає іншого активного роботодавця цього типу для перенесення даних.
                  </p>
                ) : (
                  <Select
                    label="Перенести дані до"
                    labelPlacement="outside"
                    variant="bordered"
                    placeholder="Оберіть роботодавця"
                    items={mergeTargetOptions.map((item) => ({
                      key: String(item.id),
                      label: item.name,
                    }))}
                    selectedKeys={deleteTargetId != null ? [String(deleteTargetId)] : []}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0];
                      setDeleteTargetId(selected ? Number(selected) : null);
                    }}
                    classNames={SELECT_CLASS_NAMES}
                  >
                    {(item) => (
                      <SelectItem key={item.key} textValue={item.label}>
                        {item.label}
                      </SelectItem>
                    )}
                  </Select>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose} isDisabled={deleting}>
                  Скасувати
                </Button>
                <Button
                  color="danger"
                  onPress={() => void confirmDelete()}
                  isLoading={deleting}
                  isDisabled={!deleteTargetId || mergeTargetOptions.length === 0}
                >
                  Видалити та перенести
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
