import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  HR_LEGAL_ENTITY_KIND_LABELS,
  HR_LEGAL_ENTITY_KINDS,
  type HrLegalEntityDto,
  type HrLegalEntityKind,
  type HrLegalEntityWritePayload,
} from '@shared/types/hr';
import { PayGroupsTab } from './PayGroupsTab';
import { TaxRulesTab } from './TaxRulesTab';
import { ProductionCalendarTab, type ProductionCalendarTabHandle } from './ProductionCalendarTab';
import { HR_BTN_PRIMARY } from '@/lib/buttonStyles';
import {
  HR_TABLE_CLASS_NAMES,
  HrSpecChip,
  hrLegalEntityKindTokens,
  hrStatusTokens,
} from '../hrUi';

const SEED_CODES = new Set(['fop', 'tov', 'unofficial_cash']);

const INPUT_CLASS_NAMES = {
  inputWrapper: 'shadow-none border border-default-200 bg-background-paper group-data-[focus=true]:border-sky-500 group-data-[focus=true]:ring-1 group-data-[focus=true]:ring-sky-500/30',
};

const SELECT_CLASS_NAMES = {
  trigger: 'shadow-none border border-default-200 bg-background-paper data-[focus=true]:border-sky-500 data-[focus=true]:ring-1 data-[focus=true]:ring-sky-500/30',
};

interface EmployerFormState {
  name: string;
  kind: HrLegalEntityKind;
  isActive: boolean;
}

interface TypeFormState {
  name: string;
  isActive: boolean;
}

const emptyForm = (): EmployerFormState => ({
  name: '',
  kind: 'fop',
  isActive: true,
});

const emptyTypeForm = (): TypeFormState => ({
  name: '',
  isActive: true,
});

function kindLabel(kind: HrLegalEntityKind, employers: HrLegalEntityDto[]): string {
  const seed = employers.find((item) => item.code === kind);
  return seed?.name ?? HR_LEGAL_ENTITY_KIND_LABELS[kind];
}

export default function HrEmployersPage() {
  const { hasPermission } = useRoleAccess();
  const canView = hasPermission(PERMISSIONS.PAGE_HR_EMPLOYEES);
  const canManage = hasPermission(PERMISSIONS.ACTION_HR_EMPLOYEES_MANAGE);
  const canManageTaxRules = hasPermission(PERMISSIONS.ACTION_HR_TAXRULES_MANAGE);

  const [employers, setEmployers] = useState<HrLegalEntityDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EmployerFormState>(emptyForm);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [typeForm, setTypeForm] = useState<TypeFormState>(emptyTypeForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'employers' | 'types' | 'paygroups' | 'taxrules' | 'production'>('employers');
  const [syncingFirms, setSyncingFirms] = useState(false);
  const [productionDirty, setProductionDirty] = useState(false);
  const productionCalendarRef = useRef<ProductionCalendarTabHandle>(null);
  const pendingTabRef = useRef<typeof activeTab | null>(null);

  const productionGuard = useUnsavedGuard({
    isDirty: activeTab === 'production' && productionDirty,
    onSaveDraft: async () => {
      await productionCalendarRef.current?.save();
    },
  });

  const requestProductionTabLeave = productionGuard.guardAction(() => {
    if (pendingTabRef.current) {
      setActiveTab(pendingTabRef.current);
      pendingTabRef.current = null;
    }
  }, {
    title: 'Незбережені зміни',
    message: 'У виробничому календарі є незбережені зміни. Що зробити перед виходом з таба?',
    saveText: 'Зберегти і вийти',
    leaveText: 'Вийти без збереження',
    cancelText: 'Залишитись',
  });

  const handleTabChange = (key: string | number) => {
    const next = String(key) as typeof activeTab;
    if (activeTab === 'production' && next !== 'production' && productionDirty) {
      pendingTabRef.current = next;
      requestProductionTabLeave();
      return;
    }
    setActiveTab(next);
  };

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

  const editingTypeItem = useMemo(
    () => (editingTypeId != null ? employers.find((item) => item.id === editingTypeId) ?? null : null),
    [editingTypeId, employers],
  );
  const regularEmployers = useMemo(
    () => employers.filter((item) => !SEED_CODES.has(item.code)),
    [employers],
  );
  const seedEmployers = useMemo(
    () =>
      HR_LEGAL_ENTITY_KINDS
        .map((kind) => employers.find((item) => item.code === kind))
        .filter((item): item is HrLegalEntityDto => item != null),
    [employers],
  );
  const kindOptions = useMemo(
    () =>
      HR_LEGAL_ENTITY_KINDS.map((kind) => ({
        key: kind,
        label: kindLabel(kind, employers),
      })),
    [employers],
  );

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
    if (!q) return regularEmployers;
    return regularEmployers.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        kindLabel(item.kind, employers).toLowerCase().includes(q),
    );
  }, [employers, regularEmployers, search]);

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

  const openTypeEdit = (item: HrLegalEntityDto) => {
    setEditingTypeId(item.id);
    setTypeForm({
      name: item.name,
      isActive: item.isActive,
    });
    setTypeFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const closeTypeForm = () => {
    setTypeFormOpen(false);
    setEditingTypeId(null);
    setTypeForm(emptyTypeForm());
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

  const saveLegalEntity = async (
    id: number | null,
    payload: HrLegalEntityWritePayload,
    messages: { emptyName: string; success: string },
    onClose: () => void,
  ) => {
    if (!canManage) return;
    if (!payload.name?.trim()) {
      ToastService.show({ title: messages.emptyName, color: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const url = id ? `/api/hr/legal-entities/${id}` : '/api/hr/legal-entities';
      const response = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося зберегти', color: 'danger' });
        return;
      }
      ToastService.show({ title: messages.success, color: 'success' });
      onClose();
      await fetchEmployers();
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    await saveLegalEntity(
      editingId,
      {
        name: form.name.trim(),
        kind: form.kind,
        isActive: form.isActive,
      },
      {
        emptyName: 'Вкажіть назву роботодавця',
        success: editingId ? 'Роботодавця оновлено' : 'Роботодавця створено',
      },
      closeForm,
    );
  };

  const saveType = async () => {
    if (!editingTypeItem) return;
    await saveLegalEntity(
      editingTypeId,
      {
        name: typeForm.name.trim(),
        kind: editingTypeItem.kind,
        isActive: typeForm.isActive,
      },
      {
        emptyName: 'Вкажіть назву типу',
        success: 'Тип оновлено',
      },
      closeTypeForm,
    );
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-default-900 mb-4">Доступ заборонено</h2>
          <p className="text-default-500">У вас немає прав доступу до довідника роботодавців.</p>
        </div>
      </div>
    );
  }

  const syncFirms = async () => {
    setSyncingFirms(true);
    try {
      const response = await fetch('/api/hr/sync/firms', { method: 'POST', credentials: 'include' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Помилка синхронізації', color: 'danger' });
        return;
      }
      ToastService.show({
        title: `Синхронізовано: +${json.data?.created ?? 0}, оновлено ${json.data?.matched ?? 0}`,
        color: 'success',
      });
      await fetchEmployers();
    } finally {
      setSyncingFirms(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageTabs selectedKey={activeTab} onSelectionChange={handleTabChange}>
        <Tab key="employers" title="Роботодавці" />
        <Tab key="types" title="Типи" />
        <Tab key="paygroups" title="Групи оплати" />
        <Tab key="taxrules" title="Податки та ЄСВ" />
        <Tab key="production" title="Виробничий календар" />
      </PageTabs>

      {activeTab === 'paygroups' ? <PayGroupsTab canManage={canManage} /> : null}
      {activeTab === 'taxrules' ? <TaxRulesTab canManage={canManageTaxRules} /> : null}
      {activeTab === 'production' ? (
        <ProductionCalendarTab
          ref={productionCalendarRef}
          canManage={canManageTaxRules}
          onDirtyChange={setProductionDirty}
        />
      ) : null}

      {activeTab === 'types' ? (
        <>
          <p className="text-xs text-default-500">
            Назви типів (ФОП, ТОВ, Нештатні) використовуються при створенні роботодавця. Технічний код типу не
            змінюється. Ці записи не показуються у списку роботодавців.
          </p>
          <Card className="border border-default-200 shadow-sm">
            <CardBody>
              <Table aria-label="Типи роботодавців" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
                <TableHeader>
                  <TableColumn>Назва</TableColumn>
                  <TableColumn width={200}>Код</TableColumn>
                  {canManage ? <TableColumn width={72} align="center"> </TableColumn> : <TableColumn> </TableColumn>}
                </TableHeader>
                <TableBody>
                  {seedEmployers.map((item) => (
                    <TableRow key={item.code}>
                      <TableCell>
                        <HrSpecChip tokens={hrLegalEntityKindTokens(item.kind)} rounded="sm">
                          {item.name}
                        </HrSpecChip>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-default-500">{item.kind}</span>
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Button
                            size="sm"
                            variant="light"
                            isIconOnly
                            aria-label={`Редагувати тип ${item.name}`}
                            className="text-slate-700"
                            onPress={() => openTypeEdit(item)}
                          >
                            <DynamicIcon name="pencil" size={16} />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        </>
      ) : null}

      {activeTab === 'employers' ? (
        <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          size="md"
          placeholder="Пошук за назвою або типом"
          value={search}
          onValueChange={setSearch}
          classNames={{ 
            base: 'max-w-xs',
            inputWrapper: 'data-[hover=true]:bg-white',
          }}
          autoComplete="off"
          startContent={<DynamicIcon name="search" size={14} className="text-default-400" />}
        />
        {canManage ? (
          <div className="flex gap-2">
            <Button
              variant="flat" 
              onPress={() => void syncFirms()}
              className="font-medium bg-slate-50!" 
              startContent={<DynamicIcon name="refresh-cw" size={14} className={`shrink-0 ${syncingFirms ? 'animate-spin' : ''}`} />}
            >
              Синхронізувати з Dilovod
            </Button>
            <Button
              size="md"
              className={HR_BTN_PRIMARY}
              startContent={<DynamicIcon name="plus" size={14} />}
              onPress={openCreate}
            >
              Додати роботодавця
            </Button>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-default-500">
        Конкретизуйте роботодавців для табеля та розрахунку — наприклад «ФОП Бубнова М.В.» або «ТОВ Нова Кухня».
      </p>

      <Card className="border border-default-200 shadow-sm">
        <CardBody>
          {loading && regularEmployers.length === 0 ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : visibleEmployers.length === 0 ? (
            <div className="p-10 text-center">
              <DynamicIcon name="building-2" size={28} className="mx-auto mb-2 text-default-500/50" />
              <p className="text-sm text-default-500">
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
                        <div className="font-medium text-default-900">{item.name}</div>
                        {!SEED_CODES.has(item.code) ? (
                          <div className="text-xs text-default-500 font-mono mt-0.5">{item.code}</div>
                        ) : null}
                      </button>
                    </TableCell>
                    <TableCell>
                      <HrSpecChip tokens={hrLegalEntityKindTokens(item.kind)} rounded="sm">
                        {kindLabel(item.kind, employers)}
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
        </>
      ) : null}

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
                      <HrSpecChip key={item.key} tokens={hrLegalEntityKindTokens(String(item.key))} rounded="sm">
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

      <Modal isOpen={typeFormOpen} onClose={closeTypeForm} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Редагувати тип</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                {editingTypeItem ? (
                  <p className="text-xs text-default-500">
                    Код: <span className="font-mono">{editingTypeItem.kind}</span> — технічний ідентифікатор типу,
                    його не можна змінити.
                  </p>
                ) : null}
                <Input
                  label="Назва"
                  labelPlacement="outside"
                  variant="bordered"
                  placeholder="ФОП"
                  value={typeForm.name}
                  onValueChange={(value) => setTypeForm((prev) => ({ ...prev, name: value }))}
                  isRequired
                  autoFocus
                  classNames={INPUT_CLASS_NAMES}
                />
                <Switch
                  size="sm"
                  isSelected={typeForm.isActive}
                  onValueChange={(value) => setTypeForm((prev) => ({ ...prev, isActive: value }))}
                >
                  Активний
                </Switch>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose} isDisabled={saving}>
                  Скасувати
                </Button>
                <Button color="primary" onPress={() => void saveType()} isLoading={saving}>
                  Зберегти
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <UnsavedChangesModal {...productionGuard.modalProps} />

      <Modal isOpen={deleteId != null} onClose={closeDelete} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Видалити роботодавця</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                <p className="text-sm text-default-500">
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
