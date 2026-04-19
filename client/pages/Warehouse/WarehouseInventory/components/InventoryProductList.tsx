import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { InventoryProduct } from '../WarehouseInventoryTypes';
import { ProductRow, type ProductRowProps } from './ProductRow';

// ---------------------------------------------------------------------------
// InventoryProductList — список товарів або матеріалів з header та станами
// ---------------------------------------------------------------------------

interface InventoryProductListProps {
  title: string;
  icon: string;
  headerColorClass: string;
  headerTextClass: string;
  checkedCount: number;
  totalCount: number;
  items: InventoryProduct[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  openItemId: string | null;
  onToggle: (id: string) => void;
  onChange: (id: string, field: 'boxCount' | 'actualCount', value: number) => void;
  onCheck: (id: string) => void;
  onEnterPress?: (id: string) => void;
  onRetry: () => void;
}

export const InventoryProductList = ({
  title, icon, headerColorClass, headerTextClass,
  checkedCount, totalCount,
  items, loading, error, searchQuery,
  openItemId, onToggle, onChange, onCheck, onEnterPress, onRetry,
}: InventoryProductListProps) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    {/* Header */}
    <div className={`px-4 py-3 border-b border-gray-100 ${headerColorClass}`}>
      <h3 className={`text-sm font-semibold flex items-center gap-2 ${headerTextClass}`}>
        <DynamicIcon name={icon as any} className="w-4 h-4" />
        {title} ({checkedCount}/{totalCount})
      </h3>
    </div>

    {/* Body */}
    {loading ? (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="loader-2" className="w-8 h-8 mx-auto mb-2 opacity-50 animate-spin" />
        <p className="text-sm">Завантаження...</p>
      </div>
    ) : error ? (
      <div className="text-center py-8 text-red-400">
        <DynamicIcon name="alert-triangle" className="w-8 h-8 mx-auto mb-2 opacity-70" />
        <p className="text-sm">{error}</p>
        <Button size="sm" variant="flat" color="danger" className="mt-3" onPress={onRetry}>
          Спробувати знову
        </Button>
      </div>
    ) : items.length === 0 ? (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="search-x" className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{searchQuery ? 'Позицій не знайдено' : 'Немає позицій'}</p>
      </div>
    ) : (
      items.map((item, index) => (
        <ProductRow
          key={item.id}
          product={item}
          index={index}
          isOpen={openItemId === item.id}
          onToggle={onToggle}
          onChange={onChange}
          onCheck={onCheck}
          onEnterPress={onEnterPress}
          autoFocus={false}
        />
      ))
    )}
  </div>
);
