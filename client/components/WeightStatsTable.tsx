import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { formatRelativeDate, pluralize } from '@/lib/formatUtils';
import { Button } from '@heroui/button';
import { DynamicIcon } from 'lucide-react/dynamic';

interface WeightBucket {
	count: number;
	weight: number;
	weightText: string;
}

interface WeightStatsData {
	newOrders: WeightBucket;
	confirmed: WeightBucket;
	readyToShip: WeightBucket;
	total: WeightBucket;
}

interface WeightStatsResponse {
	success: boolean;
	data: WeightStatsData;
	metadata: {
		calculatedAt: string;
		totalOrdersProcessed: number;
	};
}

const EMPTY_BUCKET: WeightBucket = {
	count: 0,
	weight: 0,
	weightText: '0.00 кг',
};

const STAT_CARDS: Array<{ key: keyof WeightStatsData; label: string; color: string; icon: React.ReactNode }> = [
	{ key: 'newOrders', label: 'Нові замовлення', color: 'blue-500', icon: <DynamicIcon name="plus-square" /> },
	{ key: 'confirmed', label: 'Підтверджені', color: 'lime-600', icon: <DynamicIcon name="check-square" /> },
	{ key: 'readyToShip', label: 'Готові до відправки', color: 'yellow-500', icon: <DynamicIcon name="arrow-up-square" /> },
	{ key: 'total', label: 'Загальна вага', color: 'gray-500', icon: <DynamicIcon name="sigma-square" /> },
];

function formatOrderCount(count: number): string {
	return `${count} ${pluralize(count, 'замовлення', 'замовлення', 'замовлень')}`;
}

export default function WeightStatsTable() {
	const { apiCall } = useApi();
	const [stats, setStats] = useState<WeightStatsData | null>(null);
	const [calculatedAt, setCalculatedAt] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchWeightStats = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await apiCall('/api/orders/weight-stats');
			const data: WeightStatsResponse = await response.json();

			if (!data.success || !data.data) {
				setStats(null);
				setError('Не вдалося завантажити статистику ваги');
				return;
			}

			setStats({
				newOrders: data.data.newOrders ?? EMPTY_BUCKET,
				confirmed: data.data.confirmed ?? EMPTY_BUCKET,
				readyToShip: data.data.readyToShip ?? EMPTY_BUCKET,
				total: data.data.total ?? EMPTY_BUCKET,
			});
			setCalculatedAt(data.metadata?.calculatedAt ?? null);
		} catch (err) {
			console.error('Error fetching weight stats:', err);
			setStats(null);
			setError('Помилка завантаження статистики ваги');
		} finally {
			setLoading(false);
		}
	}, [apiCall]);

	useEffect(() => {
		void fetchWeightStats();
	}, [fetchWeightStats]);

	return (
		<div>
			<div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 mb-4">
				<h2 className="text-xl font-semibold">Вага замовлень</h2>
				<div className="flex items-center gap-3 justify-between lg:justify-start">
					{calculatedAt && !loading && !error && (
						<div className="text-sm text-gray-500">
							Оновлено: <strong>{formatRelativeDate(calculatedAt)}</strong>
						</div>
					)}
					<Button
						color="default"
						onPress={fetchWeightStats}
						disabled={loading}
						className="bg-neutral-600 text-white h-8 px-3 rounded-sm"
					>
						{loading ? 'Оновлення...' : 'Оновити'}
					</Button>
				</div>
			</div>

			{loading && !stats ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
					{STAT_CARDS.map(({ key }) => (
						<div
							key={key}
							className="flex flex-col justify-center p-4 lg:p-6 bg-white rounded-xl shadow-sm min-h-[108px]"
						>
							<div className="animate-pulse w-24 h-8 bg-gray-200 rounded mb-2" />
							<div className="animate-pulse w-32 h-4 bg-gray-100 rounded mb-2" />
							<div className="animate-pulse w-20 h-3 bg-gray-100 rounded" />
						</div>
					))}
				</div>
			) : error ? (
				<div className="text-center text-red-600 py-8">
					<p>{error}</p>
					<Button
						color="default"
						onPress={fetchWeightStats}
						className="mt-3 bg-neutral-600 text-white h-8 px-3 rounded-sm"
					>
						Спробувати знову
					</Button>
				</div>
			) : stats ? (
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					{STAT_CARDS.map(({ key, label, color, icon }) => {
						const bucket = stats[key] ?? EMPTY_BUCKET;
						const isTotal = key === 'total';

						return (
							<div key={key}
								className={`flex flex-col justify-center p-4 lg:p-6 bg-white rounded-xl shadow-sm relative ${
									isTotal ? 'ring-1 ring-neutral-200' : ''
								}`}
							>
								<span className="text-2xl sm:text-3xl font-extrabold mb-1 tracking-tight text-neutral-700 relative z-10">{bucket.weightText}</span>
								<span className={`text-sm text-${color} font-medium whitespace-nowrap truncate relative z-10`}>{label}</span>
								<span className="text-xs text-neutral-400 mt-0.5">{formatOrderCount(bucket.count)}</span>
								<span className="absolute top-2 right-2 text-gray-100/50 z-0 [&>svg]:size-12">{icon}</span>
							</div>
						);
					})}
				</div>
			) : (
				<div className="text-center text-gray-500 py-8">
					Немає даних для відображення
				</div>
			)}
		</div>
	);
}
