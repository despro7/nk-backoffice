import { Select, SelectItem, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ReturnBatch, ReturnItem } from '../../WarehouseReturns/WarehouseReturnsTypes';
import { StepperInput } from '../../shared/StepperInput';

interface WriteOffItemRowProps {
  item: ReturnItem;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onBatchChange: (itemId: string, batchId: string | null) => void;
  editableQuantity?: boolean;
  onDelete?: (itemId: string) => void;
  inactive?: boolean;
}

export function WriteOffItemRow({ item, onQuantityChange, onBatchChange, editableQuantity = true, onDelete, inactive = false }: WriteOffItemRowProps) {
  const batchControl = (() => {
    if (item.availableBatches === null) {
      return <div className="text-xs px-3 py-[11px] text-gray-500 border border-gray-200 rounded-md">Завантаження партій...</div>;
    }
    if ((item.availableBatches ?? []).length === 0) {
      return <div className="text-xs px-3 py-[11px] text-red-500 border border-red-500/50 rounded-md">Партії не знайдено (виключено зі списання)</div>;
    }
    if ((item.availableBatches ?? []).length === 1) {
      const b = item.availableBatches[0];
      return (
        <div className="flex items-center gap-2 justify-between text-sm px-3 py-2 h-10 border border-gray-200 rounded-md">
          <span className="font-medium">{`${b.batchNumber} (${b.quantity} шт.)`}</span>
          <DynamicIcon name="check-circle" className="w-3 h-3 text-green-500 shrink-0" />
        </div>
      );
    }
    return (
      <Select
        aria-label="Партія"
        labelPlacement="outside"
        selectedKeys={[item.selectedBatchKey ?? '']}
        onSelectionChange={(keys) => {
          const next = Array.from(keys)[0] as string | undefined;
          onBatchChange(item.id, next || null);
        }}
        classNames={{ label: 'text-xs font-medium text-gray-500', trigger: 'border border-gray-200 bg-white', value: 'font-medium' }}
      >
        {(item.availableBatches ?? []).map((batch: ReturnBatch) => {
          const label = `${batch.batchNumber} (${batch.quantity} шт.)`;
          return (
            <SelectItem key={batch.id} textValue={label}>{label}</SelectItem>
          );
        })}
      </Select>
    );
  })();

  return (
    <div className={`flex items-end gap-4 w-full ${inactive ? 'opacity-50' : ''}`} aria-disabled={inactive}>
      <div className="flex-1">
				<div className="text-xs font-medium text-gray-500 mb-1">Товар</div>
        <div className="font-semibold text-gray-900">{item.name}</div>
        <div className="text-sm text-gray-500">SKU: {item.sku}</div>
      </div>

      {(() => {
        const current = Number(item.quantity ?? 0);
        const ordered = item.orderedQuantity == null ? undefined : Number(item.orderedQuantity);
        const selectedBatch = (item.availableBatches ?? []).find((b) => b.id === item.selectedBatchKey) as ReturnBatch | undefined;
        const maxAllowed = selectedBatch ? selectedBatch.quantity : ordered;

        return (
          <StepperInput
            label="Кількість"
            value={current}
            onChange={(v: number) => onQuantityChange(item.id, v)}
            onIncrement={() => onQuantityChange(item.id, Math.min(current + 1, maxAllowed ?? Infinity))}
            onDecrement={() => onQuantityChange(item.id, Math.max(current - 1, 0))}
            disabled={!editableQuantity || inactive}
            max={maxAllowed}
            size="sm"
            className="w-28"
            labelClassName="text-xs font-medium self-start"
          />
        );
      })()}

      <div className="w-100">
				<div className="text-xs font-medium text-gray-500 mb-2">Партія</div>
				{batchControl}
			</div>

      <div className="flex-shrink-0">
        <Button
					color="danger"
					variant="light"
					className="min-w-0 p-3"
					onPress={() => onDelete?.(item.id)}
				>
					<DynamicIcon name="trash-2" className="w-4 h-4" />
				</Button>
      </div>
    </div>
  );
}

export default WriteOffItemRow;
