import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Spinner,
  Switch,
  Tooltip,
} from '@heroui/react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { ToastService } from '@/services/ToastService';
import type { HrPayGroupDto, HrPayGroupWritePayload } from '@shared/types/hr';
import { HR_BTN_PRIMARY, HrSpecChip, hrStatusTokens } from '../hrUi';

interface PayGroupsTabProps {
  canManage: boolean;
}

const PAY_GROUP_ROW_GRID = 'grid grid-cols-[24px_minmax(0,1fr)_160px_140px_96px] gap-2 items-center';

function snapshotPayGroupForm(form: HrPayGroupWritePayload): string {
  return JSON.stringify({
    label: form.label?.trim() ?? '',
    isActive: form.isActive ?? true,
  });
}

export function PayGroupsTab({ canManage }: PayGroupsTabProps) {
  const [groups, setGroups] = useState<HrPayGroupDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [editing, setEditing] = useState<HrPayGroupDto | null>(null);
  const [form, setForm] = useState<HrPayGroupWritePayload>({ label: '', isActive: true });
  const [open, setOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<HrPayGroupDto | null>(null);
  const baselineRef = useRef('');
  const [baselineVersion, setBaselineVersion] = useState(0);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/hr/pay-groups?includeInactive=true', { credentials: 'include' });
      const json = await response.json().catch(() => ({}));
      if (response.ok) setGroups(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  const commitBaseline = useCallback((nextForm: HrPayGroupWritePayload) => {
    baselineRef.current = snapshotPayGroupForm(nextForm);
    setBaselineVersion((version) => version + 1);
  }, []);

  const openEdit = (group: HrPayGroupDto) => {
    const nextForm = { label: group.label, isActive: group.isActive };
    setEditing(group);
    setForm(nextForm);
    commitBaseline(nextForm);
    setOpen(true);
  };

  const closeDrawer = useCallback(() => {
    baselineRef.current = '';
    setOpen(false);
    setEditing(null);
  }, []);

  const isDirty = useMemo(() => {
    if (!open || !canManage) return false;
    if (!baselineRef.current) return false;
    void baselineVersion;
    return snapshotPayGroupForm(form) !== baselineRef.current;
  }, [baselineVersion, canManage, form, open]);

  const save = useCallback(async () => {
    if (!editing || !form.label?.trim()) {
      throw new Error('Вкажіть назву');
    }
    const response = await fetch(`/api/hr/pay-groups/${editing.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = json.message || 'Помилка збереження';
      ToastService.show({ title: message, color: 'danger' });
      throw new Error(message);
    }
    ToastService.show({ title: 'Збережено', color: 'success' });
    closeDrawer();
    await fetchGroups();
  }, [closeDrawer, editing, fetchGroups, form]);

  const guard = useUnsavedGuard({
    isDirty,
    onSaveDraft: save,
  });

  const requestCloseDrawer = guard.guardAction(closeDrawer, {
    title: 'Незбережені зміни',
    message: 'У формі групи оплати є незбережені зміни. Що зробити перед закриттям?',
    saveText: 'Зберегти і закрити',
    leaveText: 'Закрити без збереження',
    cancelText: 'Залишитись',
  });

  const deactivate = async (id: number) => {
    const response = await fetch(`/api/hr/pay-groups/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      ToastService.show({ title: json.message || 'Помилка', color: 'danger' });
      return;
    }
    await fetchGroups();
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!canManage || savingOrder) return;
    if (!result.destination || result.destination.index === result.source.index) return;

    const previous = groups;
    const next = [...groups];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setGroups(next);
    setSavingOrder(true);
    try {
      const response = await fetch('/api/hr/pay-groups/reorder', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((group) => group.id) }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.message || 'Не вдалося зберегти порядок');
      }
      if (Array.isArray(json.data)) setGroups(json.data);
    } catch (error) {
      setGroups(previous);
      ToastService.show({
        title: error instanceof Error ? error.message : 'Не вдалося зберегти порядок',
        color: 'danger',
      });
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <>
      <p className="text-xs text-text-secondary">
        Групи оплати визначають логіку розрахунку в табелі та нарахуваннях. Технічний код (slug) зафіксований у системі —
        редагується лише назва для відображення. Порядок змінюється перетягуванням рядків.
      </p>

      <Card className="border border-border-subtle shadow-surface">
        <CardBody className="p-3">
          {loading && groups.length === 0 ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : groups.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-text-secondary">Немає груп оплати.</p>
            </div>
          ) : (
            <>
              <div className={`${PAY_GROUP_ROW_GRID} px-3 py-2 text-xs font-semibold text-foreground-500 tracking-wide bg-default-100 h-10 rounded-md`}>
                <div />
                <div>Назва</div>
                <div>Код</div>
                <div>Статус</div>
                <div className="text-center">{canManage ? ' ' : ''}</div>
              </div>
              <DragDropContext onDragEnd={(result) => void handleDragEnd(result)}>
                <Droppable droppableId="pay-groups" isDropDisabled={!canManage || savingOrder}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {groups.map((group, index) => (
                        <Draggable
                          key={group.id}
                          draggableId={String(group.id)}
                          index={index}
                          isDragDisabled={!canManage || savingOrder}
                        >
                          {(drag, snapshot) => (
                            <div
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              className={`${PAY_GROUP_ROW_GRID} px-3 py-2 my-0.5 rounded-md transition-colors ${
                                !group.isActive ? 'opacity-50' : ''
                              } ${snapshot.isDragging ? 'bg-neutral-100 shadow-surface' : 'hover:bg-neutral-100/60'}`}
                            >
                              <div
                                {...drag.dragHandleProps}
                                className={`flex items-center justify-center text-secondary/40 ${
                                  canManage
                                    ? 'cursor-grab active:cursor-grabbing hover:text-secondary'
                                    : 'cursor-default'
                                }`}
                                title={canManage ? 'Перетягніть для зміни порядку' : undefined}
                              >
                                <DynamicIcon name="grip-vertical" size={16} />
                              </div>
                              <div className="font-medium text-text-primary">{group.label}</div>
                              <div>
                                <span className="font-mono text-xs text-text-secondary">{group.slug}</span>
                              </div>
                              <div>
                                <HrSpecChip
                                  tokens={hrStatusTokens(group.isActive ? 'active' : 'inactive')}
                                  icon={group.isActive ? 'success' : 'error'}
                                >
                                  {group.isActive ? 'активна' : 'неактивна'}
                                </HrSpecChip>
                              </div>
                              <div>
                                {canManage ? (
                                  <div className="flex justify-center gap-0.5">
                                    <Tooltip content="Редагувати групу оплати" placement="top-end" showArrow classNames={{ base: 'before:bg-slate-700 before:rounded-[3px]', content: 'bg-slate-700 border-0 text-white text-xs' }}>
                                      <Button
                                        size="sm"
                                        variant="light"
                                        isIconOnly
                                        aria-label={`Редагувати ${group.label}`}
                                        className="text-slate-700"
                                        onPress={() => openEdit(group)}
                                      >
                                        <DynamicIcon name="pencil" size={16} />
                                      </Button>
                                    </Tooltip>
                                    {group.isActive ? (
                                      <Tooltip content="Деактивувати групу оплати" placement="top-end" showArrow classNames={{ base: 'before:bg-danger before:rounded-[3px]', content: 'bg-danger border-0 text-white text-xs' }}>
                                        <Button
                                          size="sm"
                                          variant="light"
                                          isIconOnly
                                          aria-label={`Деактивувати ${group.label}`}
                                          className="text-rose-600 hover:bg-rose-600/10!"
                                          onPress={() => setDeactivateTarget(group)}
                                        >
                                          <DynamicIcon name="ban" size={16} />
                                        </Button>
                                      </Tooltip>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </>
          )}
        </CardBody>
      </Card>

      <Drawer
        isOpen={open}
        onOpenChange={(isDrawerOpen) => { if (!isDrawerOpen) requestCloseDrawer(); }}
        placement="right"
        size="md"
        classNames={{
          wrapper: '!z-[60]',
          backdrop: '!z-[55] bg-overlay/20',
          base: 'flex flex-col shadow-2xl',
          body: 'flex-1 min-h-0 overflow-y-auto',
          closeButton: 'top-4',
        }}
      >
        <DrawerContent>
          {() => (
            <>
              <DrawerHeader className="border-b border-border-subtle shrink-0">
                Редагувати групу оплати
              </DrawerHeader>
              <DrawerBody className="gap-5 py-5 overflow-y-auto">
                {editing ? (
                  <p className="text-xs text-text-secondary">
                    Код: <span className="font-mono">{editing.slug}</span> — технічний ідентифікатор для формул і табеля,
                    його не можна змінити.
                  </p>
                ) : null}
                <Input
                  label="Назва"
                  value={form.label ?? ''}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, label: value }))}
                />
                <Switch
                  size="sm"
                  className="pl-1"
                  isSelected={form.isActive ?? true}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value }))}
                >
                  Активна
                </Switch>
              </DrawerBody>
              <DrawerFooter className="border-t border-border-subtle shrink-0">
                <Button variant="light" onPress={requestCloseDrawer}>Скасувати</Button>
                <Button className={HR_BTN_PRIMARY} onPress={() => void save()} isDisabled={!isDirty}>
                  Зберегти
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <UnsavedChangesModal {...guard.modalProps} overlayZClassName="z-[2000]" />

      <ConfirmModal
        isOpen={deactivateTarget != null}
        title="Деактивувати групу оплати?"
        message={
          deactivateTarget
            ? `Групу «${deactivateTarget.label}» (${deactivateTarget.slug}) буде позначено як неактивну. Існуючі зайнятості не зміняться.`
            : ''
        }
        confirmText="Деактивувати"
        cancelText="Скасувати"
        onConfirm={() => {
          if (deactivateTarget) void deactivate(deactivateTarget.id).finally(() => setDeactivateTarget(null));
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </>
  );
}
