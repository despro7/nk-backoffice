import React, { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Button, Chip } from '@heroui/react';
import { ToastService } from '../services/ToastService';
import { DirectoryModal } from './modals/DirectoryModal';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import { formatRelativeDate } from '../lib/formatUtils';

interface CacheMetadata {
	lastUpdate: string | null;
	recordsCount: number;
	isValid: boolean;
}

interface CacheStatus {
	channels: CacheMetadata;
	paymentMethods: CacheMetadata;
	shippingMethods: CacheMetadata;
	statuses: CacheMetadata;
}

export const SalesDriveCacheManager: React.FC = () => {
	const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [viewingDirectory, setViewingDirectory] = useState<{
		type: keyof CacheStatus;
		data: any[];
	} | null>(null);

	// Завантажити статус кешу
	const fetchCacheStatus = async () => {
		setLoading(true);
		try {
			const response = await fetch('/api/salesdrive/cache/status', {
				credentials: 'include'
			});
			const data = await response.json();
			if (data.success) {
				setCacheStatus(data.data);
			} else {
				setCacheStatus(null);
			}
		} catch (error) {
			setCacheStatus(null);
		} finally {
			setLoading(false);
		}
	};
	// Оновити кеш
	const refreshCache = async () => {
		setRefreshing(true);
		try {
			const response = await fetch('/api/salesdrive/cache/refresh', {
				method: 'POST',
				credentials: 'include'
			});
			const data = await response.json();
			if (data.success) {
				ToastService.show({
					title: 'Кеш SalesDrive оновлено',
					description: data.message || '',
					color: 'success'
				});
				await fetchCacheStatus();
			} else {
				ToastService.show({
		  title: 'Помилка оновлення кешу SalesDrive',
		  description: data.error || '',
		  color: 'danger'
				});
			}
		} catch (error) {
			ToastService.show({
				title: 'Помилка мережі',
				description: 'Не вдалося оновити кеш',
				color: 'danger'
			});
		} finally {
			setRefreshing(false);
		}
	};
	useEffect(() => {
		fetchCacheStatus();
	}, []);
	// Завантажити дані довідника для перегляду
	const viewDirectory = async (type: keyof CacheStatus) => {
		try {
			// Мапінг типів до правильних ендпоінтів
			const endpointMap = {
				channels: '/api/salesdrive/channels',
				paymentMethods: '/api/salesdrive/payment-methods',
				shippingMethods: '/api/salesdrive/shipping-methods',
				statuses: '/api/salesdrive/statuses'
			};

			const endpoint = endpointMap[type];
			if (!endpoint) {
				throw new Error(`Невідомий тип довідника: ${type}`);
			}

			const response = await fetch(endpoint, {
				credentials: 'include'
			});
			
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			
			const result = await response.json();
			if (result.success) {
				setViewingDirectory({ type, data: result.data || [] });
			} else {
				throw new Error(result.error || 'Unknown error');
			}
		} catch (error) {
			ToastService.show({
				title: 'Помилка завантаження довідника SalesDrive',
				description: error instanceof Error ? error.message : 'Unknown error',
				color: 'danger'
			});
		}
	};
	// Отримати іконку для типу довідника
	const getIcon = (type: keyof CacheStatus): IconName => {
		switch (type) {
			case 'channels':
				return 'store';
			case 'paymentMethods':
				return 'credit-card';
			case 'shippingMethods':
				return 'truck';
			case 'statuses':
				return 'flag';
		}
	};

	// Отримати назву довідника
	const getName = (type: keyof CacheStatus): string => {
		switch (type) {
			case 'channels':
				return 'Канали продажів';
			case 'paymentMethods':
				return 'Методи оплати';
			case 'shippingMethods':
				return 'Способи доставки';
			case 'statuses':
				return 'Статуси замовлень';
		}
	};

	// Отримати колонки для таблиці
	const getColumns = (type: keyof CacheStatus) => {
		switch (type) {
			case 'channels':
				return [
					{ key: 'id', label: 'ID' },
					{ key: 'name', label: 'Назва' }
				];
			case 'paymentMethods':
				return [
					{ key: 'id', label: 'ID' },
					{ key: 'name', label: 'Назва' }
				];
			case 'shippingMethods':
				return [
					{ key: 'id', label: 'ID' },
					{ key: 'name', label: 'Назва' }
				];
			case 'statuses':
				return [
					{ key: 'id', label: 'ID' },
					{ key: 'name', label: 'Назва' },
					{ key: 'type', label: 'Тип' }
				];
		}
	};

	return (
		<Card className="w-full">
			<CardHeader className="border-b border-gray-200 flex items-center gap-2">
				<DynamicIcon name="database" className="w-5 h-5 text-primary" />
				<h3 className="text-lg font-semibold text-gray-900">Кеш довідників SalesDrive</h3>
				<Button
					size="sm"
					variant="bordered"
					color="primary"
					onPress={refreshCache}
					isLoading={refreshing}
					isDisabled={loading}
					startContent={!refreshing && <DynamicIcon name="refresh-cw" size={14} />}
					className="ml-auto"
				>
					{refreshing ? 'Оновлення...' : 'Оновити примусово'}
				</Button>
			</CardHeader>
			<CardBody>
				{loading ? (
					<div className="flex justify-center items-center py-8">
						<DynamicIcon name="loader-2" className="w-8 h-8 animate-spin text-primary" />
					</div>
				) : cacheStatus ? (
					<div className="space-y-4">
						<p className="text-sm text-default-500">
							Кеш оновлюється автоматично раз на добу. Ви можете оновити вручну за потреби.
						</p>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{(Object.keys(cacheStatus) as Array<keyof CacheStatus>).map((type) => {
								const metadata = cacheStatus[type];
								return (
									<div
										key={type}
										className="border border-default-200 rounded-lg p-4 space-y-2"
									>
										<div className="flex items-center justify-between">
											<div className="flex gap-2">
												<DynamicIcon name={getIcon(type)} className="w-4 h-4 text-primary shrink-0" />
												<span className="font-semibold text-sm">{getName(type)}</span>
											</div>
											<Chip size="sm" color={metadata.isValid ? 'success' : 'warning'} variant="flat">
												{metadata.isValid ? 'Актуальний' : 'Застарів'}
											</Chip>
										</div>
										<div className="text-sm space-y-1">
											<div className="flex gap-2 items-center">
												<span className="text-default-500">Записів:</span>
												<span className="font-medium">{metadata.recordsCount}</span>
											</div>
											<div className="flex gap-2 items-center">
												<span className="text-default-500">Оновлено:</span>
												<div className="flex items-center gap-2">
													<span className="font-medium">{formatRelativeDate(metadata.lastUpdate)}</span>
												</div>
											</div>
										</div>
										{metadata.recordsCount > 0 && (
											<div className="mt-3">
												<Button
													size="sm"
													variant="bordered"
													color="primary"
													className='border-0 border-neutral-300 shadow-sm bg-neutral-100'
													startContent={<DynamicIcon name="eye" className="w-4 h-4" />}
													onPress={() => viewDirectory(type)}
													fullWidth
												>
													Переглянути записи
												</Button>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
				) : (
					<div className="text-center py-8 text-default-500">
						Немає даних про кеш
					</div>
				)}
			</CardBody>

			{/* Модалка перегляду довідника */}
			{viewingDirectory && (
				<DirectoryModal
					isOpen={true}
					title={getName(viewingDirectory.type)}
					icon={getIcon(viewingDirectory.type)}
					records={viewingDirectory.data}
					columns={getColumns(viewingDirectory.type)}
					onClose={() => setViewingDirectory(null)}
				/>
			)}
		</Card>
	);
};
