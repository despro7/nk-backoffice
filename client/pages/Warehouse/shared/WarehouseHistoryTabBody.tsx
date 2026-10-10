import type { ReactNode } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

const LIST_MIN_HEIGHT = 'min-h-[min(420px,50vh)]';

interface WarehouseHistoryTabBodyProps {
  loading: boolean;
  records: unknown[];
  emptyMessage: string;
  onRetry?: () => void;
  children: ReactNode;
}

/** Список історії без стрибка макету при зміні сторінки пагінації. */
export function WarehouseHistoryTabBody({
  loading,
  records,
  emptyMessage,
  onRetry,
  children,
}: WarehouseHistoryTabBodyProps): ReactNode {
  const initialLoad = loading && records.length === 0;

  if (initialLoad) {
    return (
      <div className={`flex ${LIST_MIN_HEIGHT} flex-col items-center justify-center text-gray-400`}>
        <DynamicIcon name="loader-2" className="mb-2 h-6 w-6 animate-spin opacity-50" />
        <p className="text-sm">Завантаження...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className={`flex ${LIST_MIN_HEIGHT} flex-col items-center justify-center text-gray-400`}>
        <DynamicIcon name="clipboard-x" className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">{emptyMessage}</p>
        {onRetry && (
          <Button size="sm" variant="flat" className="mt-3" onPress={onRetry}>
            Завантажити
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${LIST_MIN_HEIGHT}`}>
      {loading && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/60 backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <DynamicIcon name="loader-2" className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}
      <div className={loading ? 'pointer-events-none opacity-70' : undefined}>{children}</div>
    </div>
  );
}
