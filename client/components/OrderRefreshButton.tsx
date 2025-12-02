import { useState } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatRelativeDate } from '@/lib/formatUtils';
import { useApi } from '@/hooks/useApi';
import { ToastService } from '@/services/ToastService';

interface OrderRefreshButtonProps {
	orderId: number;
	lastSynced?: Date | string | null;
	onRefreshComplete?: (updatedOrder: any) => void;
}

export function OrderRefreshButton({ orderId, lastSynced, onRefreshComplete }: OrderRefreshButtonProps) {
	const [refreshing, setRefreshing] = useState(false);
	const { apiCall } = useApi();

	const handleRefresh = async () => {
		try {
			setRefreshing(true);

			console.log(`🔄 [ORDER REFRESH] Starting refresh for order ID: ${orderId}`);

			const response = await apiCall('/api/orders-sync/sync/single-order', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ id: orderId })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to refresh order');
			}

			const data = await response.json();

			if (data.success) {
				console.log(`✅ [ORDER REFRESH] Order refreshed successfully`, data);

				// Показуємо повідомлення про результат
				if (data.hasChanges) {
					console.log(`✅ [ORDER REFRESH] Order has changes`, data.changes);
					ToastService.show({
						title: 'Замовлення оновлено',
						description: `Знайдено ${data.changes.length} змін`,
						color: 'success',
						timeout: 3000,
						hideIcon: false,
						icon: <DynamicIcon name="check-circle" strokeWidth={2} />
					});
				} else {
					ToastService.show({
						title: 'Замовлення актуальне',
						description: 'Змін не знайдено',
						color: 'default',
						timeout: 3000,
						hideIcon: false,
						icon: <DynamicIcon name="info" strokeWidth={2} />
					});
				}

				// Викликаємо callback для оновлення даних
				if (onRefreshComplete && data.order) {
					onRefreshComplete(data.order);
				}
			} else {
				throw new Error(data.error || 'Failed to refresh order');
			}

		} catch (error) {
			console.error('❌ [ORDER REFRESH] Error:', error);
			ToastService.show({
				title: 'Помилка оновлення',
				description: error instanceof Error ? error.message : 'Не вдалося оновити замовлення',
				color: 'danger',
				timeout: 5000,
				hideIcon: false,
				icon: <DynamicIcon name="alert-circle" strokeWidth={2} />
			});
		} finally {
			setRefreshing(false);
		}
	};

	return (
		<div className="flex flex-col gap-2 w-full items-center">
			{/* Дата останнього оновлення */}
			{lastSynced && (
				<div className="flex items-center gap-2 text-sm text-neutral-400 justify-center">
					<DynamicIcon name="clock" size={14} />
					<span>Оновлено: {formatRelativeDate(lastSynced)}</span>
				</div>
			)}

			{/* Кнопка оновлення */}
			<Button
				color="secondary"
				variant="flat"
				size="sm"
				className="text-neutral-500"
				onPress={handleRefresh}
				isDisabled={refreshing}
			>
				<DynamicIcon
					name="refresh-ccw"
					size={16}
					className={refreshing ? 'animate-spin' : ''}
				/>
				{refreshing ? 'Оновлення...' : 'Оновити замовлення'}
			</Button>
		</div>
	);
}
