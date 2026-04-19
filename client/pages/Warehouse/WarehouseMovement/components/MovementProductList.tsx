import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementProduct } from '../WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// MovementProductList — список товарів для переміщення
// ---------------------------------------------------------------------------

interface MovementProductListProps {
  items: MovementProduct[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  hasSearch?: boolean;
  children?: React.ReactNode;
}

export const MovementProductList = ({
  items,
  loading,
  error,
  onRetry,
  hasSearch,
  children,
}: MovementProductListProps) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-12 text-center">
        <DynamicIcon name="loader-2" className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
        <p className="text-gray-500">Завантаження товарів...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <DynamicIcon name="alert-circle" className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-800 font-medium">Помилка завантаження</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
          <button
            onClick={onRetry}
            className="text-red-600 hover:text-red-700 font-medium"
          >
            Повторити
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-12 text-center">
        <DynamicIcon name="package-x" className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        {hasSearch ? (
          <>
            <h3 className="text-lg font-semibold text-gray-600 mb-2">Нічого не знайдено</h3>
            <p className="text-gray-500">Спробуйте змінити пошуковий запит</p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-gray-600 mb-2">Немає товарів для переміщення</h3>
            <p className="text-gray-500">Наразі відсутні товари з залишками на основному складі</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      {children}
    </div>
  );
};
