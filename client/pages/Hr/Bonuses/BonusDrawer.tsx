import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import {
  HR_BONUS_KINDS,
  HR_BONUS_KIND_LABELS,
  type HrBonusDto,
  type HrBonusKind,
  type HrBonusWritePayload,
} from '@shared/types/hr';
import type { HrPeriodOption } from '@shared/utils/hrWorkWeekPeriods';
import { formatHrPeriodOptionLabel } from '@shared/utils/hrProductionWeek';
import { HR_BTN_PRIMARY } from '@/lib/buttonStyles';

export type BonusPeriodOption = HrPeriodOption;

interface EmploymentOption {
  id: number;
  displayName: string;
  legalEntityName: string;
}

interface BonusDrawerProps {
  isOpen: boolean;
  bonus: HrBonusDto | null;
  employments: EmploymentOption[];
  periods: BonusPeriodOption[];
  defaultPeriodId?: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: HrBonusWritePayload) => Promise<void>;
}

const emptyForm = (): HrBonusWritePayload => ({
  employmentId: 0,
  amount: '',
  kind: 'manual',
  status: 'draft',
});

function periodToPayload(period: BonusPeriodOption | null): Pick<HrBonusWritePayload, 'productionWeekId' | 'calendarWeekId'> {
  if (!period) {
    return { productionWeekId: null, calendarWeekId: null };
  }
  if (period.kind === 'production') {
    return { productionWeekId: Number(period.id) || null, calendarWeekId: null };
  }
  return { productionWeekId: null, calendarWeekId: period.id };
}

function snapshotBonusState(
  form: HrBonusWritePayload,
  selectedPeriodId: string | null,
  isEdit: boolean,
): string {
  return JSON.stringify({
    employmentId: form.employmentId,
    amount: form.amount.trim(),
    kind: form.kind,
    note: form.note?.trim() ?? '',
    status: form.status,
    periodId: isEdit ? null : selectedPeriodId,
  });
}

export function BonusDrawer({
  isOpen,
  bonus,
  employments,
  periods,
  defaultPeriodId,
  saving,
  onClose,
  onSave,
}: BonusDrawerProps) {
  const [form, setForm] = useState<HrBonusWritePayload>(emptyForm());
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const baselineRef = useRef('');
  const [baselineVersion, setBaselineVersion] = useState(0);
  const isEdit = bonus != null;

  const commitBaseline = useCallback((nextForm: HrBonusWritePayload, periodId: string | null) => {
    baselineRef.current = snapshotBonusState(nextForm, periodId, isEdit);
    setBaselineVersion((version) => version + 1);
  }, [isEdit]);

  useEffect(() => {
    if (!isOpen) {
      baselineRef.current = '';
      return;
    }
    if (bonus) {
      const nextForm: HrBonusWritePayload = {
        employmentId: bonus.employmentId,
        amount: bonus.amount,
        kind: bonus.kind,
        note: bonus.note,
        status: bonus.status,
        productionWeekId: bonus.productionWeekId,
        calendarWeekId: bonus.calendarWeekId,
      };
      setForm(nextForm);
      setSelectedPeriodId(null);
      commitBaseline(nextForm, null);
      return;
    }
    const nextForm = emptyForm();
    setForm(nextForm);
    const presetId = defaultPeriodId && periods.some((item) => item.id === defaultPeriodId)
      ? defaultPeriodId
      : periods[0]?.id ?? null;
    setSelectedPeriodId(presetId);
    commitBaseline(nextForm, presetId);
  }, [bonus, commitBaseline, defaultPeriodId, isOpen, periods]);

  const isDirty = useMemo(() => {
    if (!isOpen) return false;
    if (!baselineRef.current) return false;
    void baselineVersion;
    return snapshotBonusState(form, selectedPeriodId, isEdit) !== baselineRef.current;
  }, [form, isEdit, isOpen, selectedPeriodId, baselineVersion]);

  const handleSave = useCallback(async () => {
    if (!form.employmentId || !form.amount) {
      throw new Error('Заповніть обовʼязкові поля');
    }
    if (!isEdit) {
      const period = periods.find((item) => item.id === selectedPeriodId) ?? null;
      if (!period) {
        throw new Error('Оберіть тиждень');
      }
      await onSave({ ...form, ...periodToPayload(period) });
      return;
    }
    await onSave(form);
  }, [form, isEdit, onSave, periods, selectedPeriodId]);

  const guard = useUnsavedGuard({
    isDirty,
    onSaveDraft: handleSave,
  });

  const requestClose = guard.guardAction(onClose, {
    title: 'Незбережені зміни',
    message: 'У формі премії є незбережені зміни. Що зробити перед закриттям?',
    saveText: 'Зберегти і закрити',
    leaveText: 'Закрити без збереження',
    cancelText: 'Залишитись',
  });

  const closeDrawer = useCallback(() => {
    if (saving) return;
    requestClose();
  }, [requestClose, saving]);

  const submitSave = () => {
    void handleSave();
  };

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onOpenChange={(open) => { if (!open) closeDrawer(); }}
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
              <DrawerHeader className="border-b border-default-200 shrink-0">
                {isEdit ? 'Редагувати премію' : 'Нова премія'}
              </DrawerHeader>
              <DrawerBody className="gap-5 py-5 overflow-y-auto">
                {!isEdit ? (
                  <Select
                    label="Тиждень"
                    selectedKeys={selectedPeriodId ? [selectedPeriodId] : []}
                    onSelectionChange={(keys) => {
                      const value = String(Array.from(keys)[0] ?? '');
                      if (value) setSelectedPeriodId(value);
                    }}
                  >
                    {periods.map((period) => {
                      const label = formatHrPeriodOptionLabel(period);
                      return (
                        <SelectItem key={period.id} textValue={label}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </Select>
                ) : null}
                <Select
                  label="Працівник"
                  isDisabled={isEdit}
                  selectedKeys={form.employmentId ? [String(form.employmentId)] : []}
                  onSelectionChange={(keys) => {
                    const value = Number(Array.from(keys)[0]);
                    if (Number.isInteger(value)) setForm((prev) => ({ ...prev, employmentId: value }));
                  }}
                >
                  {employments.map((item) => (
                    <SelectItem key={String(item.id)} textValue={`${item.displayName} · ${item.legalEntityName}`}>
                      {item.displayName} · {item.legalEntityName}
                    </SelectItem>
                  ))}
                </Select>
                <Input
                  label="Сума"
                  value={form.amount}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, amount: value }))}
                  endContent={<span className="text-secondary text-sm">грн</span>}
                />
                <Select
                  label="Тип"
                  selectedKeys={form.kind ? [form.kind] : []}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0];
                    if (typeof value === 'string' && (HR_BONUS_KINDS as readonly string[]).includes(value)) {
                      setForm((prev) => ({ ...prev, kind: value as HrBonusKind }));
                    }
                  }}
                >
                  {HR_BONUS_KINDS.map((kind) => (
                    <SelectItem key={kind}>{HR_BONUS_KIND_LABELS[kind]}</SelectItem>
                  ))}
                </Select>
                <Input
                  label="Примітка"
                  value={form.note ?? ''}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, note: value }))}
                />
              </DrawerBody>
              <DrawerFooter className="border-t border-default-200 shrink-0">
                <Button variant="light" onPress={closeDrawer} isDisabled={saving}>
                  Скасувати
                </Button>
                <Button
                  className={HR_BTN_PRIMARY}
                  onPress={submitSave}
                  isLoading={saving}
                  isDisabled={!isDirty}
                >
                  Зберегти
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <UnsavedChangesModal {...guard.modalProps} overlayZClassName="z-[2000]" />
    </>
  );
}
