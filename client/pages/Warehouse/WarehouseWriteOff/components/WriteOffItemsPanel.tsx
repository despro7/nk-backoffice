import React from 'react';
import WriteOffItemRow from './WriteOffItemRow';

interface Props {
  returns: any;
  setDisabledSkus: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export default function WriteOffItemsPanel({ returns, setDisabledSkus }: Props) {
  if (!returns.items || returns.items.length === 0) return null;

  const isInactiveItem = (item: any): boolean => Array.isArray(item.availableBatches) && item.availableBatches.length === 0;

  return (
    <div>
      <h2 className="font-medium mb-2 mt-6">Товари для списання</h2>
      <div className="px-4 py-1 mb-4 bg-white rounded-xl border-2 border-red-400">
        {returns.items.map((it: any) => (
          <div key={it.id} className={`flex items-end gap-4 w-full py-4 border-b last:border-b-0`}>
            <WriteOffItemRow
              item={it}
              inactive={isInactiveItem(it)}
              editableQuantity={true}
              onQuantityChange={(itemId: string, qty: number) => {
                returns.setItems((prev: any[]) => (prev || []).map(i => i.id === itemId ? { ...i, quantity: qty } : i));
              }}
              onBatchChange={(itemId: string, batchKey: string | null) => {
                const current = (returns.items || []).find((x: any) => x.id === itemId);
                const batch = current?.availableBatches?.find((b: any) => b.id === batchKey) ?? null;
                returns.setItems((prev: any[]) => (prev || []).map(i => i.id === itemId ? { ...i, selectedBatchKey: batchKey, selectedBatchId: batch?.batchId ?? null } : i));
              }}
              onDelete={(itemId: string) => {
                const sku = it.sku;
                returns.setItems((prev: any[]) => {
                  const next = (prev || []).filter(i => i.id !== itemId);
                  // if no remaining items with same sku, re-enable order row
                  if (!next.some((x: any) => x.sku === sku)) {
                    setDisabledSkus((s) => { const copy = { ...s }; delete copy[sku]; return copy; });
                  }
                  return next;
                });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
