import { Textarea } from '@heroui/react';
import type { MovementProduct } from '../../shared/WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// MovementSummaryTable — таблиця обраних товарів для переміщення
// ---------------------------------------------------------------------------

interface MovementSummaryTableProps {
  items: MovementProduct[];
  notes: string;
  setNotes: (notes: string) => void;
  sourceWarehouse?: string;
  destinationWarehouse?: string;
}

export const MovementSummaryTable = ({
  items,
  notes,
  setNotes,
  sourceWarehouse = 'Основний склад',
  destinationWarehouse = 'Малий склад',
}: MovementSummaryTableProps) => {
  const formatBoxValue = (value: number) => {
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  };

  // Розрахунок загальної кількості по всіх партіях = сума по кожній партії
  const calculateTotalPortions = (item: MovementProduct): number => {
    return item.details.batches.reduce(
      (sum, batch) => sum + (batch.boxes * item.portionsPerBox + batch.portions),
      0
    );
  };

  const totalBoxes = items.reduce(
    (sum, item) => sum + item.details.batches.reduce((s, b) => s + b.boxes, 0),
    0
  );
  const totalAdditionalPortions = items.reduce(
    (sum, item) => sum + item.details.batches.reduce((s, b) => s + b.portions, 0),
    0
  );
  const totalAllPortions = items.reduce((sum, item) => sum + calculateTotalPortions(item), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-sm text-blue-600 mb-1">Звідки</div>
          <div className="font-semibold text-blue-900">{sourceWarehouse}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-sm text-green-600 mb-1">Куди</div>
          <div className="font-semibold text-green-900">{destinationWarehouse}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-3">
        <div className="grid grid-cols-[40px_1fr_100px_100px_100px] gap-x-4 bg-gray-100 rounded-sm px-2 py-3 text-xs font-semibold uppercase text-gray-500">
          <span>№</span>
          <span>Назва товару</span>
          <span className="text-center">Коробки</span>
          <span className="text-center">+ порцій</span>
          <span className="text-center">Разом</span>
        </div>
        <div className="divide-y divide-gray-100">
          {items.map((item, index) => (
            <div key={item.id} className="grid grid-cols-[40px_1fr_100px_100px_100px] gap-x-4 px-2 py-4 items-center">
              <span className="text-gray-600">{index + 1}</span>
              <span className="font-medium">{item.name}</span>
              <span className="text-center text-gray-700">
                {formatBoxValue(
                  item.details.batches.reduce((sum, batch) => sum + batch.boxes, 0)
                )}
              </span>
              <span className="text-center text-gray-700">
                {item.details.batches.reduce((sum, batch) => sum + batch.portions, 0)}
              </span>
              <span className="text-center font-semibold text-blue-600">{calculateTotalPortions(item)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 items-end gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Підсумки</h4>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{items.length}</div>
              <div className="text-sm text-gray-600">Позицій</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{formatBoxValue(totalBoxes)}</div>
              <div className="text-sm text-gray-600">Коробок</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">+{totalAdditionalPortions}</div>
              <div className="text-sm text-gray-600">порцій</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{totalAllPortions}</div>
              <div className="text-sm text-gray-600">Разом</div>
            </div>
          </div>
        </div>

        {/* Коментар до документа (remark у payload Діловода) */}
        <Textarea
          label="Коментар до документа"
          labelPlacement="outside"
          variant="faded"
          placeholder="Примітки до накладної переміщення (необов'язково)"
          value={notes}
          onValueChange={setNotes}
          maxRows={3}
          classNames={{
            inputWrapper: 'bg-white border border-gray-200 shadow-none',
          }}
        />
      </div>


    </div>
  );
};
