import React, { useState, useEffect } from 'react';
import { Card, Button, Select, SelectItem } from '@heroui/react';
import { ToastService } from '../services/ToastService';
import { DynamicIcon } from 'lucide-react/dynamic';

interface ReportingDayStartHourSettingsProps {
	onClose?: () => void;
}

export const ReportingDayStartHourSettings: React.FC<ReportingDayStartHourSettingsProps> = ({ onClose }) => {
	const [dayStartHour, setDayStartHour] = useState<number>(0);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [originalHour, setOriginalHour] = useState<number>(0);

	// Завантажуємо поточне значення при монтуванні компонента
	useEffect(() => {
		fetchReportingDayStartHour();
	}, []);

	const fetchReportingDayStartHour = async () => {
		try {
			setIsLoading(true);
			const response = await fetch('/api/settings/reporting-day-start-hour', {
				credentials: 'include'
			});

			if (response.ok) {
				const data = await response.json();
				const hour = data.dayStartHour || 0;
				setDayStartHour(hour);
				setOriginalHour(hour);
			} else {
				throw new Error('Failed to fetch reporting day start hour');
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
			ToastService.show({
				title: 'Помилка завантаження',
				description: errorMsg,
				color: 'danger',
				hideIcon: false,
				icon: <DynamicIcon name="octagon-x" />,
				timeout: 3000
			});
			console.error('Error fetching reporting day start hour:', err);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSave = async () => {
		try {
			setIsSaving(true);

			if (dayStartHour < 0 || dayStartHour > 23) {
				const errorMsg = 'Година повинна бути між 0 та 23';
				ToastService.show({
					title: 'Помилка валідації',
					description: errorMsg,
					color: 'danger',
					hideIcon: false,
					icon: <DynamicIcon name="octagon-x" />,
					timeout: 3000
				});
				return;
			}

			const response = await fetch('/api/settings/reporting-day-start-hour', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				credentials: 'include',
				body: JSON.stringify({ dayStartHour: Number(dayStartHour) })
			});

			if (response.ok) {
				const data = await response.json();
				setOriginalHour(data.dayStartHour);

				// Показуємо успішне сповіщення через ToastService
				ToastService.show({
					title: 'Успіх',
					description: 'Налаштування години звітного дня збережено успішно',
					color: 'success',
					hideIcon: false,
					timeout: 3000
				});

				// Очищаємо кеш статистики при зміні налаштувань
				console.log('✅ Reporting day start hour updated, clearing stats cache');
			} else {
				const errorData = await response.json();
				const errorMsg = errorData.error || 'Failed to save setting';
				ToastService.show({
					title: 'Помилка збереження',
					description: errorMsg,
					color: 'danger',
					hideIcon: false,
					icon: <DynamicIcon name="octagon-x" />,
					timeout: 3000
				});
				throw new Error(errorMsg);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
			ToastService.show({
				title: '❌ Помилка',
				description: errorMsg,
				color: 'danger'
			});
			console.error('Error saving reporting day start hour:', err);
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		setDayStartHour(originalHour);
	};

	const generateHourOptions = () => {
		const options = [];
		for (let i = 0; i < 24; i++) {
			const label = `${String(i).padStart(2, '0')}:00`;
			options.push({
				value: i,
				label: label
			});
		}
		return options;
	};

	const hours = generateHourOptions();

	return (
		<Card className="p-6 gap-4 flex-grow">
			<div className="space-y-4">
				<h2 className="text-lg font-semibold text-slate-900 dark:text-white">Година звітного дня</h2>

				<div className="space-y-3">
					<div>
						<label htmlFor="dayStartHour" className="text-sm text-slate-700 dark:text-slate-300 block mb-2">
							Виберіть годину
						</label>
						<Select
							aria-label='Виберіть годину звітного дня'
							id="dayStartHour"
							selectedKeys={new Set([dayStartHour.toString()])}
							onChange={(e) => setDayStartHour(Number(e.target.value))}
							isDisabled={isLoading || isSaving}
							className="w-full"
						>
							{hours.map((hour) => (
								<SelectItem key={hour.value} textValue={hour.label}>
									{hour.label}
								</SelectItem>
							))}
						</Select>
					</div>


					<div className="flex gap-2 justify-end">
						<Button
							isDisabled={isLoading || isSaving || dayStartHour === originalHour}
							color="default"
							variant="bordered"
							size="sm"
							onPress={handleCancel}
						>
							Скасувати
						</Button>
						<Button
							isDisabled={isLoading || isSaving || dayStartHour === originalHour}
							isLoading={isSaving}
							color="primary"
							size="sm"
							onPress={handleSave}
						>
							Зберегти
						</Button>
					</div>
				</div>
			</div>
		</Card>
	);
};
