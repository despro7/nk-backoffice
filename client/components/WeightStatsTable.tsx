import { useState, useEffect } from 'react';
import { useApi } from '@/hooks/useApi';
import { Button } from '@heroui/button';

interface WeightStatsData {
	confirmed: {
		count: number;
		weight: number;
		weightText: string;
	};
	readyToShip: {
		count: number;
		weight: number;
		weightText: string;
	};
	total: {
		count: number;
		weight: number;
		weightText: string;
	};
	shipped: {
		count: number;
		weight: number;
		weightText: string;
	};
}

interface WeightStatsResponse {
	success: boolean;
	data: WeightStatsData;
	metadata: {
		calculatedAt: string;
		totalOrdersProcessed: number;
	};
}

export default function WeightStatsTable() {
	const { apiCall } = useApi();
	const [stats, setStats] = useState<WeightStatsData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const Header = (
		<h3 className="text-xl font-semibold">Статистика ваги замовлень</h3>
	);

	const fetchWeightStats = async () => {
		try {
			setLoading(true);
			setError(null);
			
			const response = await apiCall('/api/orders/weight-stats');
			const data: WeightStatsResponse = await response.json();
			
			if (data.success) {
				setStats(data.data);
			} else {
				setError('Не вдалося завантажити статистику ваги');
			}
		} catch (err) {
			console.error('Error fetching weight stats:', err);
			setError('Помилка завантаження статистики ваги');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchWeightStats();
	}, []);

	if (loading) {
		return (
			<div className="bg-white rounded-lg p-6">
				{Header}
				<div className="animate-pulse">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{[1, 2, 3].map((i) => (
							<div key={i} className="text-center">
								<div className="h-4 bg-gray-200 rounded w-3/4 mb-2 mx-auto"></div>
								<div className="h-8 bg-gray-200 rounded w-1/2 mx-auto"></div>
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="bg-white rounded-lg p-6">
				{Header}
				<div className="text-center text-red-600">
					<p>{error}</p>
					<button
						onClick={fetchWeightStats}
						className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
					>
						Спробувати знову
					</button>
				</div>
			</div>
		);
	}

	if (!stats) {
		return (
			<div className="bg-white rounded-lg p-6">
				{Header}
				<div className="text-center text-gray-500">
					Немає даних для відображення
				</div>
			</div>
		);
	}

	return (
		<div className="bg-white rounded-lg p-6">
			<div className="flex justify-between items-center mb-6">
				{Header}

				{/* Додаткова інформація */}
				{/* <div className="text-sm text-gray-500 ml-auto mr-4">
					Останнє оновлення: {new Date().toLocaleString('uk-UA')}
				</div> */}

				<Button
					color="default"
					onPress={fetchWeightStats}
					disabled={loading}
					className="bg-neutral-600 text-white h-8 px-3 rounded-sm"
					>
					{loading ? 'Оновлення...' : 'Оновити'}
				</Button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				{/* Підтверджені замовлення */}
				<div className="flex flex-col justify-center p-6 bg-white rounded-md border border-neutral-200">
					<div className="text-3xl font-extrabold mb-1 tracking-tight text-neutral-700">
						{stats.confirmed.weightText}
					</div>
					<div className="text-sm text-neutral-500 font-medium mb-0.5">
						Підтверджені замовлення
					</div>
					<div className="text-xs text-neutral-400">
						{stats.confirmed.count} замовлень
					</div>
				</div>

				{/* Готові до відправки */}
				<div className="flex flex-col justify-center p-6 bg-white rounded-md border border-neutral-200">
					<div className="text-3xl font-extrabold mb-1 tracking-tight text-neutral-700">
						{stats.readyToShip.weightText}
					</div>
					<div className="text-sm text-neutral-500 font-medium mb-0.5">
						Готові до відправки
					</div>
					<div className="text-xs text-neutral-400">
						{stats.readyToShip.count} замовлень
					</div>
				</div>

				{/* Загальна сума */}
				<div className="flex flex-col justify-center p-6 bg-white rounded-md border border-neutral-200">
					<div className="text-3xl font-extrabold mb-1 tracking-tight text-neutral-700">
						{stats.total.weightText}
					</div>
					<div className="text-sm text-neutral-500 font-medium mb-0.5">
						Загальна вага
					</div>
					<div className="text-xs text-neutral-400">
						{stats.total.count} замовлень
					</div>
				</div>

				{/* Відправлені */}
				{/* <div className="flex flex-col justify-center p-6 bg-white rounded-md border border-neutral-200">
					<div className="text-3xl font-extrabold mb-1 tracking-tight">
						{stats.shipped.weightText}
					</div>
					<div className="text-sm text-neutral-500 font-medium mb-0.5">
						Відправлені
					</div>
					<div className="text-xs text-neutral-400">
						{stats.shipped.count} замовлень
					</div>
				</div> */}
			</div>

		</div>
	);
}
