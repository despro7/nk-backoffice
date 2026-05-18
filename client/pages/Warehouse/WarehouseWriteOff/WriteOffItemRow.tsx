import { Select, SelectItem, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ReturnBatch, ReturnItem } from '../WarehouseReturns/WarehouseReturnsTypes';
import { StepperInput } from '../shared/StepperInput';

interface WriteOffItemRowProps {
  item: ReturnItem;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onBatchChange: (itemId: string, batchId: string | null) => void;
  editableQuantity?: boolean;
  onDelete?: (itemId: string) => void;
}

export function WriteOffItemRow({ item, onQuantityChange, onBatchChange, editableQuantity = true, onDelete }: WriteOffItemRowProps) {
  const batchControl = (() => {
    if (item.availableBatches === null) {
      return <div className="text-xs px-3 py-[11px] text-gray-500 border border-gray-200 rounded-md">Завантаження партій...</div>;
    }
    if ((item.availableBatches ?? []).length === 0) {
      return <div className="text-xs px-3 py-[11px] text-red-500 border border-red-500/50 rounded-md">Партії не знайдено</div>;
    }
    if ((item.availableBatches ?? []).length === 1) {
      const b = item.availableBatches[0];
      return (
        <div className="flex items-center gap-2 justify-between text-sm text-green-700 bg-green-700/3 px-3 py-2 border border-green-700/20 rounded-md">
          <span className="font-medium">{`${b.batchNumber} (${b.quantity} шт.)`}</span>
          <DynamicIcon name="check-circle" className="w-3 h-3 text-green-500" />
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
        classNames={{ label: 'text-xs font-medium text-gray-500', trigger: 'border border-gray-200 bg-white' }}
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
    <div className="flex items-end gap-4 w-full">
      <div className="flex-1">
				<div className="text-xs font-medium text-gray-500 mb-1">Товар</div>
        <div className="font-semibold text-gray-900">{item.name}</div>
        <div className="text-sm text-gray-500">SKU: {item.sku}</div>
      </div>

      <StepperInput
				label="Кількість"
        value={Number(item.quantity ?? 0)}
        onChange={(v:number) => onQuantityChange(item.id, v)}
        onIncrement={() => onQuantityChange(item.id, Math.min(Number(item.quantity ?? 0) + 1, Number(item.orderedQuantity ?? Infinity)))}
        onDecrement={() => onQuantityChange(item.id, Math.max(Number(item.quantity ?? 0) - 1, 0))}
        disabled={!editableQuantity}
        max={Number(item.orderedQuantity ?? undefined) as any}
        size="sm"
        className="w-28"
        labelClassName="text-xs font-medium self-start"
      />

      <div className="w-56">
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
