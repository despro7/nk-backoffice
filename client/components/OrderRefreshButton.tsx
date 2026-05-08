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
				// console.log(`✅ [ORDER REFRESH] Order refreshed successfully`, data);

				// Після успішного оновлення замовлення запускаємо перевірку Dilovod
				let dilovodDocIdChanged = false;
				try {
					console.log(`🔄 [ORDER REFRESH] Запуск перевірки Dilovod DocId для замовлення ${data.order.externalId}`);
					const dilovodCheckResponse = await apiCall('/api/dilovod/salesdrive/orders/check', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({ 
							orderNumbers: [data.order.externalId]
						})
					});

					if (dilovodCheckResponse.ok) {
						const dilovodData = await dilovodCheckResponse.json();
						console.log(`✅ [ORDER REFRESH] Dilovod check completed`, dilovodData);
						
						// Перевіряємо, чи було оновлено dilovodDocId для поточного замовлення
						if (dilovodData.data && Array.isArray(dilovodData.data)) {
							const currentOrderUpdate = dilovodData.data.find((item: any) => item.updatedCount > 0);
							if (currentOrderUpdate) {
								dilovodDocIdChanged = true;
								console.log(`✅ [ORDER REFRESH] dilovodDocId було оновлено для замовлення ${data.order.externalId}`);
								
								// Повторно запитуємо замовлення, щоб отримати оновлений dilovodDocId
								try {
									const refreshedOrderResponse = await apiCall(`/api/orders/${orderId}`);
									
									if (!refreshedOrderResponse.ok) {
										console.warn(`⚠️ [ORDER REFRESH] Failed to fetch updated order: ${refreshedOrderResponse.status}`);
										// Якщо маршрут не існує, використовуємо data з першого запиту
									} else {
										const refreshedOrderData = await refreshedOrderResponse.json();
										if (refreshedOrderData.success && refreshedOrderData.data) {
											data.order = refreshedOrderData.data;
											console.log(`✅ [ORDER REFRESH] Successfully fetched updated order with dilovodDocId`);
										}
									}
								} catch (fetchError) {
									console.warn(`⚠️ [ORDER REFRESH] Error fetching updated order:`, fetchError);
									// Використовуємо data.order з першого запиту
								}
							}
						}
					} else {
						console.warn(`⚠️ [ORDER REFRESH] Dilovod check failed with status ${dilovodCheckResponse.status}`);
					}
				} catch (dilovodError) {
					console.warn(`⚠️ [ORDER REFRESH] Dilovod check error:`, dilovodError);
					// Не показуємо помилку користувачу, оскільки основне оновлення пройшло успішно
				}

				// Фільтруємо зміни без rawData (не показово для користувача)
				const meaningfulChanges = data.changes ? data.changes.filter((change: string) => change !== 'rawData') : [];
				const hasRealChanges = meaningfulChanges.length > 0;

				// Показуємо повідомлення про результат
				if (hasRealChanges || dilovodDocIdChanged) {
					
					hasRealChanges && console.log(`✅ [ORDER REFRESH] В замовленні ${data.order.externalId} змінено поля:`, meaningfulChanges);
					
					// Форматуємо назви полів для відображення
					const fieldLabels: Record<string, string> = {
						status: 'Статус',
						statusText: 'Текст статусу',
						ttn: 'ТТН',
						quantity: 'Кількість порцій',
						customerName: 'Ім\'я клієнта',
						customerPhone: 'Телефон',
						deliveryAddress: 'Адреса доставки',
						totalPrice: 'Сума',
						shippingMethod: 'Спосіб доставки',
						paymentMethod: 'Спосіб оплати',
						cityName: 'Місто',
						provider: 'Перевізник',
						pricinaZnizki: 'Причина знижки',
						sajt: 'Канал продажу',
						orderDate: 'Дата замовлення',
						items: 'Склад замовлення'
					};

					const changedFieldsText = meaningfulChanges
						.map((field: string) => fieldLabels[field] || field)
						.join(', ');

					// Якщо dilovodDocId змінився, додаємо це до опису
					let description = '';
					if (hasRealChanges && dilovodDocIdChanged) {
						description = `Змінено ${meaningfulChanges.length} ${meaningfulChanges.length === 1 ? 'поле' : meaningfulChanges.length < 5 ? 'поля' : 'полів'}: ${changedFieldsText}. Також оновлено ID в Dilovod - кнопка фіскального чека тепер доступна!`;
					} else if (hasRealChanges) {
						description = `Змінено ${meaningfulChanges.length} ${meaningfulChanges.length === 1 ? 'поле' : meaningfulChanges.length < 5 ? 'поля' : 'полів'}: ${changedFieldsText}`;
					} else if (dilovodDocIdChanged) {
						description = 'Оновлено ID в Dilovod - кнопка фіскального чека тепер доступна!';
					}

					ToastService.show({
						title: 'Замовлення оновлено',
						description,
						color: 'success',
						timeout: 5000,
						hideIcon: false,
						icon: <DynamicIcon name="check-circle" strokeWidth={2} />
					});
				} else {
					console.log(`ℹ️ [ORDER REFRESH] No meaningful changes (only rawData updated)`);
					ToastService.show({
						title: 'Замовлення актуальне',
						description: 'Змін не знайдено',
						color: 'default',
						timeout: 3000,
						hideIcon: false,
						icon: 'info'
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
