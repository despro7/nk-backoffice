import { Button, Input } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { StockBadge } from '@/components/StockBadge';
import type { InventoryWarehouseScope } from '../WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// InventoryStartScreen — початковий екран коли немає активної сесії
// ---------------------------------------------------------------------------

interface InventoryStartScreenProps {
  comment: string;
  onCommentChange: (value: string) => void;
  onStart: (warehouse: InventoryWarehouseScope) => void;
  pendingDrafts?: Partial<Record<InventoryWarehouseScope, { id: number; updatedAt: string }>>;
}

export const InventoryStartScreen = ({
  comment,
  onCommentChange,
  onStart,
  pendingDrafts = {},
}: InventoryStartScreenProps) => (
  <div className="bg-white rounded-xl py-14 px-6">
    <div className="text-center max-w-lg mx-auto">
      <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4 mx-auto">
        <DynamicIcon name="clipboard-list" className="w-8 h-8 text-neutral-500/80" />
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        Немає активної інвентаризації
      </h2>
      <p className="text-center text-sm text-gray-500 mb-6">
        Оберіть склад: МС і ГП вводяться окремими сесіями (різні люди можуть працювати паралельно).
        У історії пари за один день показуються разом.
      </p>
      <div className="flex flex-col gap-4 justify-center items-stretch max-w-lg">
        <Input
          size="lg"
          value={comment}
          placeholder="Коментар (необов'язково)"
          onValueChange={onCommentChange}
          startContent={<DynamicIcon name="message-square" className="w-4 h-4 text-gray-400" />}
          classNames={{
            input: 'placeholder:opacity-50',
          }}
        />
        <h3 className="text-sm font-semibold text-gray-800 mt-2">Оберіть склад щоб розпочати/продовжити інвентаризацію:</h3>
        <div className="flex items-center gap-3">
          <Button
            color="success"
            variant="flat"
            className="grow shrink basis-auto min-w-0 h-auto py-4 px-6 text-lg font-semibold"
            onPress={() => onStart('small')}
          >
            Малий склад
          </Button>
          <Button
            color="primary"
            variant="flat"
            className="grow shrink basis-auto min-w-0 h-auto py-4 px-6 text-lg font-semibold text-blue-800/75 bg-blue-500/20"
            onPress={() => onStart('gp')}
          >
            Склад готової продукції
          </Button>
        </div>
      </div>
    </div>
  </div>
);
