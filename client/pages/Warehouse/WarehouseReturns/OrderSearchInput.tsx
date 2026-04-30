import { getStatusColor } from '@/lib';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { Button, Input } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface OrderSearchInputProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => Promise<void>;
  searchResults: Array<{ 
		id: number;
		externalId?: string;
		orderNumber?: string;
		customerName?: string;
		orderDate?: string;
		updatedAt?: string;
		ttn?: string;
		qty?: number;
		status?: string;
		statusText?: string;
	}>;
  loading: boolean;
  onSelectOrder: (orderId: number) => void;
}

export function OrderSearchInput({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  searchResults,
  loading,
  onSelectOrder,
}: OrderSearchInputProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <Input
          value={searchQuery}
          onValueChange={onSearchQueryChange}
          placeholder="Пошук замовлення за №, ТТН або ПІБ"
          size="lg"
					className="w-full"
          startContent={<DynamicIcon name="search" className="text-gray-400" size={18} />}
          classNames={{ inputWrapper: 'rounded-lg border border-gray-200 bg-white' }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void onSearch();
            }
          }}
        />
        <Button
          onPress={onSearch}
          size="lg"
          // isLoading={loading}
					color="primary"
          className="w-full sm:w-auto"
					startContent={!loading ? <DynamicIcon name="search" size={18} /> : <DynamicIcon name="loader-2" size={18} className="animate-spin" />}
        >
          Знайти
        </Button>
      </div>

      {searchResults.length > 0 && (
        <div className="grid gap-2">
          {searchResults.map((order) => (
            <button
              key={order.id}
              type="button"
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-primary/70 hover:bg-primary/5"
              onClick={() => onSelectOrder(order.id)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1 text-md font-semibold text-gray-900">
                    Замовлення №{order.externalId || order.orderNumber || order.id}
										<span className="font-normal text-gray-600">{order.orderDate && ` від ${new Date(order.orderDate).toLocaleDateString('uk-UA')}`}</span>
										<span className="ml-4 font-medium inline-flex items-center gap-1">
											{order.ttn && formatTrackingNumberWithIcon(order.ttn, {
												iconSize: 'absolute',
												iconSizeValue: '1rem',
												compactMode: true,
												boldLastGroup: false
											})}
										</span>
                  </div>
                  <div className="text-sm text-gray-500">{order.customerName || 'Клієнт не вказаний'}</div>
                </div>
                <div className="text-right flex flex-col items-center gap-1">
									<div className={`inline-flex w-auto rounded-full px-3 py-1 text-xs ${getStatusColor(order.status)}`}>{order.statusText || 'Статус невідомий'}</div>
									<div className="flex items-center gap-0.5 text-xs text-gray-400"><DynamicIcon name="calendar-1" className="mb-0.5" size={12} /> {order.updatedAt && new Date(order.updatedAt).toLocaleDateString('uk-UA')}</div>
								</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
