import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardBody, CardFooter, Switch, Button } from '@heroui/react';
import { LoggingService } from '../services/LoggingService';
import { LoggingSettingsTypes } from '../types/logging';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '../services/ToastService';

export const LoggingSettings: React.FC = () => {
	const [settings, setSettings] = useState<LoggingSettingsTypes | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [isInitialized, setIsInitialized] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Завантажуємо налаштування під час монтування
	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		try {
			LoggingService.loggingSettingsLog('🔧 Завантажуємо налаштування логування...');
			
			// Чекаємо на ініціалізацію LoggingService (як у ToastSettings)
			const MAX_ATTEMPTS = 5;
			const DELAY_MS = 150;
			let attempts = 0;
			
			// Чекаємо поки LoggingService ініціалізується
			while (!LoggingService.isServiceInitialized() && attempts < MAX_ATTEMPTS) {
				attempts++;
				await new Promise((r) => setTimeout(r, DELAY_MS));
			}
			
			const logSettings = LoggingService.getSettings();
			setSettings(logSettings);
			setError(null);
			setIsInitialized(true);
			LoggingService.loggingSettingsLog('🔧 Налаштування завантажені з LoggingService:', logSettings);
		} catch (error) {
			console.error('🔧 [LoggingSettings] Помилка при завантаженні налаштувань:', error);
			// Встановлюємо видиму помилку та дозволяємо користувачу Retry або використати дефолти
			setError('Не вдалося завантажити налаштування логування');
			setIsInitialized(true);
			ToastService.show({ title: '⚠️ Помилка', description: 'Не вдалося завантажити налаштування — спробуйте ще раз або використайте типові', color: 'warning' });
		}
	};

	const retryLoad = () => {
		setIsInitialized(false);
		setError(null);
		loadSettings();
	};

	const saveLoggingSettings = async () => {
		if (!settings) return;
			setIsLoading(true);
		try {
			LoggingService.loggingSettingsLog('🔧 Збереження налаштувань логування... Відправлені дані:', JSON.stringify(settings, null, 2));

			// Оновлюємо консольні налаштування через LoggingService
			LoggingService.updateSettings({
				...settings,
			});
			// Спробуємо зберегти на сервер
			const success = await LoggingService.saveSettings({
				...settings,
			});
			

			if (success) {
				setHasChanges(false);
				ToastService.show({
					title: "✅ Налаштування збережено",
					description: "Налаштування логування успішно оновлено на сервер",
					color: "success"
				});
				LoggingService.loggingSettingsLog('🔧 Налаштування успішно збережено на сервер');
			} else {
				ToastService.show({
					title: "⚠️ Налаштування застосовано локально",
					description: "Зміни діють, але не збережено на сервер",
					color: "warning"
				});
			}
		} catch (error) {
			LoggingService.loggingSettingsLog('🔧 Помилка збереження налаштувань логування:', error);
			ToastService.show({
				title: "❌ Помилка збереження",
				description: "Не вдалося зберегти налаштування",
				color: "danger"
			});
		} finally {
			setIsLoading(false);
		}
	};

	const updateLoggingSetting = (key: keyof LoggingSettingsTypes, value: boolean) => {
		setSettings(prev => prev ? { ...prev, [key]: value } : prev);
		setHasChanges(true);
	};

	const getLoggingDefaults = (): LoggingSettingsTypes => ({
		authContextLogs: true,
		apiCallLogs: false,
		routingLogs: false,
		equipmentLogs: true,
		debugLogs: false,
		performanceLogs: false,
		loggingSettingsLogs: false,
		orderAssemblyLogs: false,
		cookieLogs: false,
		warehouseMovementLogs: false,
		productSetsLogs: false
	});

	const resetLoggingToDefaults = () => {
		setSettings(getLoggingDefaults());
		setHasChanges(true);
	};

	// Функції для демонстрації налаштувань (з примусовим виведенням)
	const demonstrateConsoleLog = (type: keyof LoggingSettingsTypes) => {
		switch (type) {
			case 'authContextLogs':
				LoggingService.authLog('🔑 Демо: Токен успішно оновлено', { expiresIn: 120 }, true);
				break;
			case 'apiCallLogs':
				LoggingService.apiLog('🚀 Демо: API запит GET /api/orders -> 200 (150ms)', undefined, true);
				break;
			case 'routingLogs':
				LoggingService.routeLog('🧭 Демо: Перехід на сторінку /settings/logging', undefined, true);
				break;
			case 'equipmentLogs':
				LoggingService.equipmentLog('⚖️ Демо: Ваги VTA-60 під\'єднано, вага: 1.25 кг', undefined, true);
				break;
			case 'debugLogs':
				LoggingService.debugLog('🐛 Демо: Налагоджувальна інформація', { state: 'active', count: 5 }, true);
				break;
			case 'performanceLogs':
				LoggingService.perfLog('⚡ Демо: Рендер компонента за 15ms', undefined, true);
				break;
			case 'loggingSettingsLogs':
				LoggingService.loggingSettingsLog('⚙️ Демо: Налаштування логування збережено', undefined, true);
				break;
			case 'orderAssemblyLogs':
				LoggingService.orderAssemblyLog('📦 Демо: Замовлення №12345 готове до відправки', undefined, true);
				break;
			case 'cookieLogs':
				LoggingService.cookieLog('🍪 Демо: Cookie "user_theme" збережено зі значенням "dark"', undefined, true);
				break;
			case 'warehouseMovementLogs':
				LoggingService.warehouseMovementLog('🏭 Демо: Складський документ #WM-001 створено', undefined, true);
				break;
			case 'productSetsLogs':
				LoggingService.productSetsLog('🛒 Демо: Набір товарів створено', undefined, true);
				break;
		}
	};

	// Конфигурация настроек для UI
	const LoggingSettingsConfig: Array<{
		key: keyof LoggingSettingsTypes;
		label: string;
		description: string;
		color: 'primary' | 'success' | 'warning' | 'danger';
	}> = [
		{
			key: 'authContextLogs',
			label: 'Логи авторизації (AuthContext)',
			description: 'Логи токенів, входу/виходу, обновлення сессий',
			color: 'primary'
		},
		{
			key: 'apiCallLogs',
			label: 'API запити',
			description: 'Логи HTTP запитів і відповідей сервера',
			color: 'success'
		},
		{
			key: 'routingLogs',
			label: 'Маршрутизація',
			description: 'Логи переходів між сторінками',
			color: 'primary'
		},
		{
			key: 'equipmentLogs',
			label: 'Обладнання (ваги, принтери)',
			description: 'Логи підключення і роботи обладнання',
			color: 'warning'
		},
		{
			key: 'debugLogs',
			label: 'Відладочні логи',
			description: 'Технічна інформація для розробників',
			color: 'danger'
		},
		{
			key: 'performanceLogs',
			label: 'Продуктивність',
			description: 'Логи часу виконання і продуктивності',
			color: 'success'
		},
		{
			key: 'loggingSettingsLogs',
			label: 'Налаштування логування',
			description: 'Логи роботи системи керування логами',
			color: 'primary'
		},
		{
			key: 'orderAssemblyLogs',
			label: 'Комплектація замовлень',
			description: 'Логи процесу збирання та обробки замовлень',
			color: 'warning'
		},
		{
			key: 'productSetsLogs',
			label: 'Набір товарів',
			description: 'Логи роботи з наборами товарів',
			color: 'success'
		},
		{
			key: 'cookieLogs',
			label: 'Робота з Cookies',
			description: 'Логи збереження та читання cookies',
			color: 'success'
		},
		{
			key: 'warehouseMovementLogs',
			label: 'Складські переміщення',
			description: 'Логи операцій з складськими документами та рухом товарів',
			color: 'danger'
		}
	];

		// Показуємо індикатор завантаження, поки не ініціалізовано
		if (!isInitialized || !settings) {
			// Якщо є помилка — показуємо явний блок з Retry та Use defaults
			if (error) {
				const applyDefaultsFromError = () => {
					const defaults = getLoggingDefaults();
					setSettings(defaults);
					setHasChanges(true);
					setError(null);
					ToastService.show({ title: 'ℹ️ Використано типові', description: 'Використано типові налаштування логування', color: 'default' });
				};

				return (
					<Card className="w-full p-2">
						<CardHeader className="text-lg font-semibold">❌ Помилка завантаження налаштувань</CardHeader>
						<CardBody className="p-6">
							<div className="text-sm text-gray-700 mb-4">{error}</div>
							<div className="text-xs text-gray-500">Спробуйте повторити завантаження або використайте типові налаштування.</div>
						</CardBody>
						<CardFooter className="flex gap-3">
							<Button color="primary" onPress={retryLoad}>Повторити</Button>
							<Button color="default" variant="light" onPress={applyDefaultsFromError}>Використати типові</Button>
						</CardFooter>
					</Card>
				);
			}

			return (
				<Card className="flex-1 p-2">
					<CardBody className="flex items-center justify-center p-8">
						<div className="text-center">
							<div className="text-lg">⏳ Завантаження налаштувань...</div>
						</div>
					</CardBody>
				</Card>
			);
		}

	return (
		<Card className="flex-1 p-2">
			<CardHeader className="flex items-center gap-3 text-lg font-semibold">
				Логування в консолі браузера
			</CardHeader>

			<CardBody className="space-y-6 px-6">
				<div className="space-y-4">
					{LoggingSettingsConfig.map((config) => (
						<div key={config.key} className="flex items-start gap-3">
							<Switch
								size="sm"
								isSelected={!!settings?.[config.key]}
								onValueChange={(value) => updateLoggingSetting(config.key, value)}
								className="mt-1"
							/>
							<div className="flex-1">
								<div className="font-medium text-sm">
									{config.label}
									<Button
											size="sm"
											variant="flat"
											color="warning"
											onPress={() => {
												demonstrateConsoleLog(config.key);
												// ToastService.show({
												// 	title: '🔔 Тестування',
												// 	description: 'Перевірте консоль браузера (F12)',
												// 	color: 'default',
												// 	timeout: 3000
												// });
											}}
											className="h-6 px-2 text-xs ml-2 gap-1"
										>
										<DynamicIcon name="bell-ring" strokeWidth={1.5} size={12} /> Тестувати
										</Button>
								</div>
								<div className="text-xs text-gray-500 mb-1">{config.description}</div>
							</div>
						</div>
					))}
				</div>
			</CardBody>
			<CardFooter className="flex justify-start items-center w-full mt-3 gap-4">
				<Button
					color="primary"
					onPress={saveLoggingSettings}
					isLoading={isLoading}
					isDisabled={!hasChanges}
				>
					<DynamicIcon name="save" size={16} />
					{isLoading ? 'Збереження...' : 'Зберегти налаштування'}
				</Button>

				<Button
					color="default"
					variant="light"
					onPress={resetLoggingToDefaults}
				>
					Скинути до типових
				</Button>
			</CardFooter>
		</Card>
	);
};

// Експорт для використання в інших модулях
export default LoggingSettings;