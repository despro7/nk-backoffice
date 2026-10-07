import { useMemo, useState } from 'react';
import { Select, SelectItem } from '@heroui/react';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import type { HrEmploymentDto } from '@shared/types/hr';
import { HR_PAY_GROUP_LABELS } from '@shared/types/hr';

interface EmploymentTransferModalProps {
  isOpen: boolean;
  sourceEmployment: HrEmploymentDto | null;
  targetEmployments: HrEmploymentDto[];
  loading?: boolean;
  onConfirm: (targetEmploymentId: number) => void;
  onCancel: () => void;
}

export function EmploymentTransferModal({
  isOpen,
  sourceEmployment,
  targetEmployments,
  loading = false,
  onConfirm,
  onCancel,
}: EmploymentTransferModalProps) {
  const [targetId, setTargetId] = useState('');

  const options = useMemo(
    () =>
      targetEmployments.map((employment) => ({
        key: String(employment.id),
        label: `${employment.legalEntity.name} · ${HR_PAY_GROUP_LABELS[employment.payGroup]}`,
        textValue: `${employment.legalEntity.name} ${HR_PAY_GROUP_LABELS[employment.payGroup]}`,
      })),
    [targetEmployments],
  );

  const selectedTarget = targetId ? Number(targetId) : null;

  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Перенести табель і видалити зайнятість?"
      message={
        sourceEmployment ? (
          <div className="space-y-3 text-sm text-default-900">
            <p>
              У цієї зайнятості є повʼязані дані (табель, розрахунок або виплати). Оберіть іншу
              зайнятість того ж співробітника — дані будуть перенесені, після чого поточну зайнятість
              буде видалено.
            </p>
            <Select
              label="Цільова зайнятість"
              labelPlacement="outside"
              placeholder="Оберіть зайнятість"
              items={options}
              selectedKeys={targetId ? [targetId] : []}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];
                setTargetId(typeof value === 'string' ? value : '');
              }}
            >
              {(item) => (
                <SelectItem key={item.key} textValue={item.textValue}>
                  {item.label}
                </SelectItem>
              )}
            </Select>
            {options.length === 0 ? (
              <p className="text-xs text-danger-500">Немає іншої зайнятості для переносу.</p>
            ) : null}
          </div>
        ) : (
          ''
        )
      }
      confirmText="Перенести і видалити"
      cancelText="Скасувати"
      confirmColor="danger"
      confirmLoading={loading}
      onConfirm={() => {
        if (selectedTarget == null || options.length === 0) return;
        onConfirm(selectedTarget);
      }}
      onCancel={onCancel}
    />
  );
}
