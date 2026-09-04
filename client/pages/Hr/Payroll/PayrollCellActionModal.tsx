import { useEffect, useState } from 'react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { HrPayrollLineDto, HrTimesheetWeekDto } from '@shared/types/hr';

const INPUT_CLASS_NAMES = {
  inputWrapper:
    'shadow-none border-1.5 border-slate-200 bg-white',
  input: 'tabular-nums text-lg font-semibold',
};

interface PayrollCellActionModalProps {
  isOpen: boolean;
  line: HrPayrollLineDto | null;
  week: HrTimesheetWeekDto | null;
  rawAmount: string;
  isPaid: boolean;
  canMarkPaid: boolean;
  marking: boolean;
  onClose: () => void;
  onMarkPaid: (amount: string) => void;
  onOpenDrawer: () => void;
}

function formatForInput(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseInputAmount(value: string): string | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

export function PayrollCellActionModal({
  isOpen,
  line,
  week,
  rawAmount,
  isPaid,
  canMarkPaid,
  marking,
  onClose,
  onMarkPaid,
  onOpenDrawer,
}: PayrollCellActionModalProps) {
  const periodLabel = week ? week.label : 'Разом за місяць';
  const [amountInput, setAmountInput] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setAmountInput(formatForInput(rawAmount));
  }, [isOpen, rawAmount]);

  const parsedAmount = parseInputAmount(amountInput);
  const canSubmit = Boolean(canMarkPaid && !isPaid && parsedAmount);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      placement="center"
      classNames={{
        base: 'max-w-md rounded-xl shadow-lg',
        header: 'pl-4 pb-1 pr-8',
        body: 'px-4 py-3',
        footer: 'px-4 justify-end gap-2',
        closeButton: 'absolute right-3 top-3',
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col items-start gap-0.5">
          <span className="text-base font-semibold text-neutral-900 capitalize">{line?.displayName ?? '—'}</span>
          <span className="text-sm font-normal text-default-500">{periodLabel}</span>
        </ModalHeader>
        <ModalBody className="gap-3">
          <Input
            label="Сума виплати"
            labelPlacement="outside"
            variant="bordered"
            value={amountInput}
            onValueChange={setAmountInput}
            isReadOnly={isPaid || !canMarkPaid}
            classNames={INPUT_CLASS_NAMES}
            description={
              isPaid
                ? 'Цю суму вже відмічено як виплачену.'
                : !canMarkPaid
                  ? 'Спочатку збережіть розрахунок кнопкою «Розрахувати».'
                  : 'Можна змінити суму перед відміткою виплати.'
            }
            endContent={<span className="text-xs text-default-400">грн</span>}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={marking}>
            Скасувати
          </Button>
          <Button
            variant="flat"
            startContent={<DynamicIcon name="panel-right-open" size={14} className="shrink-0" />}
            onPress={onOpenDrawer}
            isDisabled={marking}
          >
            Деталі
          </Button>
          <Button
            color="primary"
            isDisabled={!canSubmit}
            isLoading={marking}
            startContent={!marking ? <DynamicIcon name="check" size={14} className="shrink-0" /> : undefined}
            onPress={() => {
              if (!parsedAmount) return;
              onMarkPaid(parsedAmount);
            }}
          >
            Відмітити виплаченою
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
