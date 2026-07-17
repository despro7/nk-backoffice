import { Input, Select, SelectItem, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ReturnBatch, ReturnItem } from '../WarehouseReturnsTypes';

interface ReturnsItemRowProps {
  item: ReturnItem;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onPriceChange?: (itemId: string, price: number) => void;
  onBatchChange: (itemId: string, batchId: string | null) => void;
}

export function ReturnsItemRow({
  item,
  onQuantityChange,
  onPriceChange,
  onBatchChange,
}: ReturnsItemRowProps) {
  return (
    <div className="grid gap-5 border-b border-gray-100 py-4 sm:grid-cols-[1fr_20%_25%]">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{item.name}</span>
          {item.dynamicMonolithic && (
            <Popover showArrow placement="right">
              <PopoverTrigger>
                <button type="button" className="text-xs text-indigo-700 bg-indigo-100 border border-indigo-200 px-1 rounded">Набір</button>
              </PopoverTrigger>
              <PopoverContent className="p-3 bg-white border border-gray-200 shadow-lg">
                <div className="font-semibold mb-2 max-w-60 text-center leading-tight">Склад набору «{item.name}»</div>
                <div className="max-h-80 overflow-auto text-[13px]">
                  {(item.composition || []).map((c: any, idx: number) => {
                    const compName = typeof c === 'string' ? c : (c?.name || c?.sku || 'Компонент');
                    const compQty = typeof c === 'string' ? 1 : (c?.quantity ?? 1);
                    return (
                      <div key={c?.sku ?? idx} className="flex items-end justify-between gap-4">
                        <div>{compName}</div>
                        <div>{compQty} шт.</div>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="text-sm text-gray-500">SKU: {item.sku}</div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              label="Кількість"
              labelPlacement="outside"
              type="number"
              value={String(item.quantity)}
              min={0}
              // Use available batch quantity as max when present; otherwise fall back to orderedQuantity
              max={item.availableBatches && item.availableBatches.length > 0 ? item.availableBatches[0].quantity : item.orderedQuantity}
              readOnly
              classNames={{ label: 'text-xs font-medium text-gray-500', inputWrapper: 'border border-gray-200 bg-white!', input: 'cursor-not-allowed' }}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Ціна"
              labelPlacement="outside"
              type="number"
              value={String(item.price ?? '')}
              onValueChange={(v) => {
                const parsed = Number(v);
                onPriceChange?.(item.id, Number.isNaN(parsed) ? 0 : parsed);
              }}
              classNames={{ label: 'text-xs font-medium text-gray-500', inputWrapper: 'border border-gray-200 bg-white' }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1 text-xs font-medium">
          {/* <DynamicIcon name="package" className="w-4 h-4 text-gray-500" /> */}
          Партія
        </div>
        {item.availableBatches === null ? (
          <div className="text-xs px-3 py-[11px] text-gray-500 border border-gray-200 rounded-md">Завантаження партій...</div>
        ) : (item.availableBatches.length === 0 ? (
          <div className="text-xs px-3 py-[11px] text-red-500 border border-red-500/50 rounded-md">Партії не знайдено</div>
        ) : (item.availableBatches.length === 1 ? (
          // If only one batch is available, show plain text with a small icon
          <div className="flex items-center gap-2 justify-between text-sm text-green-700 bg-green-700/3 px-3 py-2 border border-green-700/20 rounded-md">
            <span className="font-medium">{`${item.availableBatches[0].batchNumber} (${item.availableBatches[0].quantity} шт.)`}</span>
            <DynamicIcon name="check-circle" className="w-3 h-3 text-green-500" />
          </div>
        ) : (
          <Select
            aria-label="Партія"
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
        )))}
      </div>
    </div>
  );
}
