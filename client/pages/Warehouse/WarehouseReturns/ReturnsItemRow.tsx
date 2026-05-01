import { Input, Select, SelectItem } from '@heroui/react';
import type { ReturnBatch, ReturnItem } from './WarehouseReturnsTypes';

interface ReturnsItemRowProps {
  item: ReturnItem;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onBatchChange: (itemId: string, batchId: string | null) => void;
}

export function ReturnsItemRow({
  item,
  onQuantityChange,
  onBatchChange,
}: ReturnsItemRowProps) {
  return (
    <div className="grid gap-5 border-b border-gray-100 py-4 sm:grid-cols-[1fr_15%_25%]">
      <div className="space-y-2">
        <div className="font-semibold text-gray-900">{item.name}</div>
        <div className="text-sm text-gray-500">SKU: {item.sku}</div>
      </div>

      <div className="space-y-2">
        <Input
          label="Кількість"
          labelPlacement="outside"
          type="number"
          value={String(item.quantity)}
          min={0}
          max={item.orderedQuantity}
          onValueChange={(value) => {
            const parsed = Number(value);
            onQuantityChange(item.id, Number.isNaN(parsed) ? 0 : parsed);
          }}
          classNames={{ label: 'text-xs font-medium text-gray-500', inputWrapper: 'border border-gray-200 bg-white' }}
        />
        <div className="text-xs text-gray-400">Було замовлено: {item.orderedQuantity}</div>
        {item.quantity < item.orderedQuantity && (
          <div className="text-xs text-red-500">При оприбуткуванні віднімуться: {item.orderedQuantity - item.quantity} шт.</div>
        )}
      </div>

      <div className="space-y-2">
        <Select
          label="Партія"
          labelPlacement="outside"
          selectedKeys={[item.selectedBatchKey ?? '']}
          onSelectionChange={(keys) => {
            const next = Array.from(keys)[0] as string | undefined;
            onBatchChange(item.id, next || null);
          }}
          classNames={{
            label: 'text-xs font-medium text-gray-500',
            trigger: 'border border-gray-200 bg-white',
          }}
        >
          {(item.availableBatches ?? []).map((batch) => {
						const label = `${batch.batchNumber} (${batch.quantity} шт.)`;
            return (
              <SelectItem
                key={batch.id}
                textValue={label}
              >
                {label}
              </SelectItem>
            );
          })}
        </Select>
        {item.availableBatches === null && (
          <div className="text-xs text-gray-500">Завантаження партій...</div>
        )}
        {item.availableBatches !== null && item.availableBatches.length === 0 && (
          <div className="text-xs text-red-500">Партії не знайдено</div>
        )}
      </div>
    </div>
  );
}
