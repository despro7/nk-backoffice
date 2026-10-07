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
import { formatMoney } from '@/lib/formatUtils';
import { HR_BTN_PRIMARY } from '@/lib/buttonStyles';

interface EmploymentOption {
  id: number;
  displayName: string;
  legalEntityName: string;
}

interface BonusDrawerProps {
  isOpen: boolean;
  bonus: HrBonusDto | null;
  employments: EmploymentOption[];
  defaultYear: number;
  defaultMonth: number;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: HrBonusWritePayload) => Promise<void>;
}

const MONTH_OPTIONS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
] as const;

function buildPeriodOptions(now: Date): Array<{ key: string; year: number; month: number; label: string }> {
  const options: Array<{ key: string; year: number; month: number; label: string }> = [];
  for (let offset = 0; offset < 3; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    options.push({
      key: `${year}-${month}`,
      year,
      month,
      label: `${MONTH_OPTIONS[month - 1]} ${year}`,
    });
  }
  return options;
}

function normalizeMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,.\s]/g, '').replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return '';
  const parts = cleaned.split('.');
  const intPart = parts[0] ?? '';
  const decPart = parts[1] ?? '';
  if (parts.length > 2) return raw;
  return decPart ? `${intPart}.${decPart.slice(0, 2)}` : intPart;
}

function formatMoneyInput(raw: string): string {
  const normalized = normalizeMoneyInput(raw);
  if (!normalized) return '';
  const [intPart, decPart] = normalized.split('.');
  const intNum = Number(intPart);
  if (!Number.isFinite(intNum)) return raw;
  const formattedInt = intNum.toLocaleString('uk-UA');
  return decPart !== undefined ? `${formattedInt},${decPart}` : formattedInt;
}

const emptyForm = (): HrBonusWritePayload => ({
  employmentId: 0,
  amount: '',
  kind: 'manual',
  status: 'draft',
});

function snapshotBonusState(
  form: HrBonusWritePayload,
  periodKey: string | null,
  isEdit: boolean,
): string {
  return JSON.stringify({
    employmentId: form.employmentId,
    amount: form.amount.trim(),
    kind: form.kind,
    note: form.note?.trim() ?? '',
    status: form.status,
    periodKey: isEdit ? null : periodKey,
  });
}

export function BonusDrawer({
  isOpen,
  bonus,
  employments,
  defaultYear,
  defaultMonth,
  saving,
  onClose,
  onSave,
}: BonusDrawerProps) {
  const [form, setForm] = useState<HrBonusWritePayload>(emptyForm());
  const [amountDisplay, setAmountDisplay] = useState('');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const baselineRef = useRef('');
  const [baselineVersion, setBaselineVersion] = useState(0);
  const isEdit = bonus != null;
  const periodOptions = useMemo(() => buildPeriodOptions(new Date()), []);

  const commitBaseline = useCallback((nextForm: HrBonusWritePayload, periodKey: string | null) => {
    baselineRef.current = snapshotBonusState(nextForm, periodKey, isEdit);
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
        periodYear: bonus.periodYear,
        periodMonth: bonus.periodMonth,
      };
      setForm(nextForm);
      setAmountDisplay(formatMoney(bonus.amount));
      setSelectedPeriodKey(null);
      commitBaseline(nextForm, null);
      return;
    }
    const nextForm = emptyForm();
    setForm(nextForm);
    setAmountDisplay('');
    const presetKey = `${defaultYear}-${defaultMonth}`;
    const periodKey = periodOptions.some((item) => item.key === presetKey)
      ? presetKey
      : periodOptions[0]?.key ?? null;
    setSelectedPeriodKey(periodKey);
    commitBaseline(nextForm, periodKey);
  }, [bonus, commitBaseline, defaultMonth, defaultYear, isOpen, periodOptions]);

  const isDirty = useMemo(() => {
    if (!isOpen) return false;
    if (!baselineRef.current) return false;
    void baselineVersion;
    return snapshotBonusState(form, selectedPeriodKey, isEdit) !== baselineRef.current;
  }, [form, isEdit, isOpen, selectedPeriodKey, baselineVersion]);

  const handleSave = useCallback(async () => {
    if (!form.employmentId || !form.amount) {
      throw new Error('Заповніть обовʼязкові поля');
    }
    if (!isEdit) {
      const period = periodOptions.find((item) => item.key === selectedPeriodKey);
      if (!period) throw new Error('Оберіть місяць');
      await onSave({
        ...form,
        periodYear: period.year,
        periodMonth: period.month,
      });
      return;
    }
    await onSave(form);
  }, [form, isEdit, onSave, periodOptions, selectedPeriodKey]);

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
                    label="Місяць"
                    selectedKeys={selectedPeriodKey ? [selectedPeriodKey] : []}
                    onSelectionChange={(keys) => {
                      const value = String(Array.from(keys)[0] ?? '');
                      if (value) setSelectedPeriodKey(value);
                    }}
                  >
                    {periodOptions.map((period) => (
                      <SelectItem key={period.key} textValue={period.label}>
                        {period.label}
                      </SelectItem>
                    ))}
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
                  value={amountDisplay}
                  onValueChange={(value) => {
                    const normalized = normalizeMoneyInput(value);
                    setAmountDisplay(formatMoneyInput(value));
                    setForm((prev) => ({ ...prev, amount: normalized }));
                  }}
                  onBlur={() => {
                    if (form.amount) setAmountDisplay(formatMoney(form.amount));
                  }}
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
                  onPress={() => void handleSave()}
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
