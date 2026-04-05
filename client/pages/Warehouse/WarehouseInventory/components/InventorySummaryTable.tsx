import { DynamicIcon } from 'lucide-react/dynamic';
import { totalPortions } from '../../shared/WarehouseInventoryUtils';
import type { InventoryProduct } from '../../shared/WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// InventorySummaryTable — підсумкова таблиця відхилень
// ---------------------------------------------------------------------------

interface InventorySummaryTableProps {
  products: InventoryProduct[];
  materials: InventoryProduct[];
}

export const InventorySummaryTable = ({ products, materials }: InventorySummaryTableProps) => {
  const allItems = [
    ...products.filter((p) => p.checked || totalPortions(p) !== null),
    ...materials.filter((m) => m.checked || totalPortions(m) !== null),
  ];

  if (allItems.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <DynamicIcon name="bar-chart-2" className="w-4 h-4" />
        Підсумок
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 rounded">
              <th className="text-left py-2 px-3 font-medium text-gray-500">Позиція</th>
              <th className="text-center py-2 px-3 font-medium text-gray-500">За обліком</th>
              <th className="text-center py-2 px-3 font-medium text-gray-500">Факт</th>
              <th className="text-center py-2 px-3 font-medium text-gray-500">Відхилення</th>
            </tr>
          </thead>
          <tbody>
            {allItems.map((item) => {
              const total = totalPortions(item);
              const dev = total !== null ? total - item.systemBalance : null;
              return (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="py-2 px-3 text-gray-700">{item.name}</td>
                  <td className="py-2 px-3 text-center text-gray-600">{item.systemBalance}</td>
                  <td className="py-2 px-3 text-center font-medium">{total ?? '—'}</td>
                  <td className="py-2 px-3 text-center">
                    {dev === null ? '—' : (
                      <span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                        {dev > 0 ? '+' : ''}{dev}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
