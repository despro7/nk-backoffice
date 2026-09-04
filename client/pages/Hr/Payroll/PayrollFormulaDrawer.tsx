import { useEffect, useState } from 'react';
import { Button, Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, Input } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { HrPayrollFormulaSnapshot } from '@shared/types/hr';

const INPUT_CLASS_NAMES = {
  inputWrapper:
    'shadow-none border border-slate-200 bg-white group-data-[focus=true]:border-sky-500 group-data-[focus=true]:ring-1 group-data-[focus=true]:ring-sky-500/30',
  input: 'tabular-nums',
};

interface PayrollFormulaDrawerProps {
  isOpen: boolean;
  formula: HrPayrollFormulaSnapshot;
  locked: boolean;
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (extraRate: string, grossDivisor: string) => void;
}

export function PayrollFormulaDrawer({
  isOpen,
  formula,
  locked,
  canEdit,
  saving,
  onClose,
  onSave,
}: PayrollFormulaDrawerProps) {
  const [extraRate, setExtraRate] = useState('');
  const [grossDivisor, setGrossDivisor] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setExtraRate(formula.extraRate);
    setGrossDivisor(formula.grossDivisor);
  }, [isOpen, formula.extraRate, formula.grossDivisor]);

  const readOnly = locked || !canEdit;

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="md" scrollBehavior="inside">
      <DrawerContent>
        <DrawerHeader className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <DynamicIcon name="calculator" size={18} className="text-primary" />
          <span className="text-lg font-semibold">Формула Tabell 2026</span>
        </DrawerHeader>
        <DrawerBody className="gap-4 py-4">
          <p className="text-sm text-default-600">
            Коефіцієнти застосовуються для групи «Офіційна ставка» при розрахунку цього місяця. Значення
            зберігаються окремо для кожного періоду.
          </p>

          <Input
            label="Додатковий коефіцієнт (×)"
            labelPlacement="outside"
            variant="bordered"
            value={extraRate}
            onValueChange={setExtraRate}
            isReadOnly={readOnly}
            classNames={INPUT_CLASS_NAMES}
            description="Наприклад 0,23 — множник після нарахування за ставку."
          />

          <Input
            label="Дільник (÷)"
            labelPlacement="outside"
            variant="bordered"
            value={grossDivisor}
            onValueChange={setGrossDivisor}
            isReadOnly={readOnly}
            classNames={INPUT_CLASS_NAMES}
            description="Наприклад 0,77 — дільник для групи офіційної ставки."
          />

          {locked ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Період заблоковано — налаштування формули зафіксовані разом із розрахунком.
            </p>
          ) : (
            <p className="text-xs text-default-400">
              Після зміни натисніть «Зберегти», потім «Розрахувати», щоб застосувати нові коефіцієнти до
              знімка.
            </p>
          )}
        </DrawerBody>
        <DrawerFooter className="border-t border-slate-200">
          <Button variant="light" onPress={onClose} isDisabled={saving}>
            Закрити
          </Button>
          {!readOnly ? (
            <Button
              color="primary"
              isLoading={saving}
              onPress={() => onSave(extraRate, grossDivisor)}
            >
              Зберегти
            </Button>
          ) : null}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
