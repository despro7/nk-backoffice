import React, { useState, useEffect, useMemo } from 'react';
import {
	Card,
	CardBody,
	CardHeader,
	Button,
	Chip,
	Table,
	TableBody,
	TableCell,
	TableColumn,
	TableHeader,
	TableRow,
	type SortDescriptor,
} from '@heroui/react';
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

const CACHE_TYPE_ORDER: Array<keyof CacheStatus> = [
	'channels',
	'paymentMethods',
	'shippingMethods',
	'statuses',
];

type CacheSortColumn = 'name' | 'status' | 'recordsCount' | 'lastUpdate';

type CacheTableRow = {
	type: keyof CacheStatus;
	metadata: CacheMetadata;
};

const DEFAULT_CACHE_SORT: SortDescriptor = {
	column: 'name',
	direction: 'ascending',
};

interface DirectoryRecord {
	id: string;
	name: string;
	[key: string]: any;
}

export const SalesDriveCacheManager: React.FC = () => {
	const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [viewingDirectory, setViewingDirectory] = useState<{
		type: keyof CacheStatus;
		data: any[];
	} | null>(null);
	const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>(DEFAULT_CACHE_SORT);

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

	// Зберегти відредагований список каналів
	const saveChannels = async (records: DirectoryRecord[]) => {
		const response = await fetch('/api/salesdrive/channels', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ channels: records })
		});

		const data = await response.json();
		if (!data.success) {
			throw new Error(data.error || 'Не вдалося зберегти канали');
		}

		ToastService.show({
			title: 'Канали продажів оновлено',
			description: data.message || '',
			color: 'success'
		});

		// Оновлюємо дані в модалці та статус кешу
		setViewingDirectory(prev => prev ? { ...prev, data: records } : null);
		await fetchCacheStatus();
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

	const sortedCacheRows = useMemo((): CacheTableRow[] => {
		if (!cacheStatus) return [];

		const rows: CacheTableRow[] = CACHE_TYPE_ORDER
			.filter((type) => cacheStatus[type])
			.map((type) => ({ type, metadata: cacheStatus[type] }));

		const column = String(sortDescriptor.column ?? 'name') as CacheSortColumn;
		const dir = sortDescriptor.direction === 'descending' ? -1 : 1;

		return [...rows].sort((left, right) => {
			let cmp = 0;

			switch (column) {
				case 'name':
					cmp = getName(left.type).localeCompare(getName(right.type), 'uk');
					break;
				case 'status':
					cmp = Number(left.metadata.isValid) - Number(right.metadata.isValid);
					break;
				case 'recordsCount':
					cmp = left.metadata.recordsCount - right.metadata.recordsCount;
					break;
				case 'lastUpdate': {
					const leftTime = left.metadata.lastUpdate ? new Date(left.metadata.lastUpdate).getTime() : 0;
					const rightTime = right.metadata.lastUpdate ? new Date(right.metadata.lastUpdate).getTime() : 0;
					if (leftTime === 0 && rightTime === 0) cmp = 0;
					else if (leftTime === 0) cmp = 1;
					else if (rightTime === 0) cmp = -1;
					else cmp = leftTime - rightTime;
					break;
				}
				default:
					cmp = CACHE_TYPE_ORDER.indexOf(left.type) - CACHE_TYPE_ORDER.indexOf(right.type);
			}

			if (cmp !== 0) return cmp * dir;
			return CACHE_TYPE_ORDER.indexOf(left.type) - CACHE_TYPE_ORDER.indexOf(right.type);
		});
	}, [cacheStatus, sortDescriptor]);

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
			<CardBody className="p-6">
				{loading ? (
					<div className="flex justify-center items-center py-8">
						<DynamicIcon name="loader-2" className="w-8 h-8 animate-spin text-primary" />
					</div>
				) : cacheStatus ? (
					<div className="space-y-4">
						<p className="text-sm text-default-500">
							Кеш оновлюється автоматично раз на добу. Ви можете оновити вручну за потреби.
						</p>
						<Table
							aria-label="Кеш довідників SalesDrive"
							removeWrapper
							sortDescriptor={sortDescriptor}
							onSortChange={setSortDescriptor}
							classNames={{
								th: 'first:rounded-l-md last:rounded-e-md',
							}}
						>
							<TableHeader>
								<TableColumn key="name" allowsSorting>Довідник</TableColumn>
								<TableColumn key="status" allowsSorting width={128}>Статус</TableColumn>
								<TableColumn key="recordsCount" allowsSorting width={96} align="end">Записів</TableColumn>
								<TableColumn key="lastUpdate" allowsSorting width={160}>Оновлено</TableColumn>
								<TableColumn key="actions" width={160} align="end">Дії</TableColumn>
							</TableHeader>
							<TableBody emptyContent="Немає довідників у кеші">
								{sortedCacheRows.map(({ type, metadata }) => (
									<TableRow
										key={type}
										className="hover:bg-gray-100/60 transition-colors duration-50"
									>
										<TableCell>
											<div className="flex items-center gap-2">
												<DynamicIcon name={getIcon(type)} className="w-4 h-4 text-primary shrink-0" />
												<span className="font-medium text-sm">{getName(type)}</span>
											</div>
										</TableCell>
										<TableCell>
											<Chip size="sm" color={metadata.isValid ? 'success' : 'warning'} variant="flat">
												{metadata.isValid ? 'Актуальний' : 'Застарів'}
											</Chip>
										</TableCell>
										<TableCell className="text-right font-medium tabular-nums">
											{metadata.recordsCount}
										</TableCell>
										<TableCell className="text-default-500 whitespace-nowrap">
											{formatRelativeDate(metadata.lastUpdate)}
										</TableCell>
										<TableCell>
											{metadata.recordsCount > 0 ? (
												<div className="flex items-center justify-end">
													<Button
														size="sm"
														variant="bordered"
														color="primary"
														className="border-0 border-neutral-300 shadow-sm bg-neutral-100"
														startContent={<DynamicIcon name="eye" className="w-4 h-4" />}
														onPress={() => viewDirectory(type)}
														isDisabled={loading || refreshing}
													>
														Переглянути
													</Button>
												</div>
											) : null}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
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
					onSave={viewingDirectory.type === 'channels' ? saveChannels : undefined}
				/>
			)}
		</Card>
	);
};
