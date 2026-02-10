import React, { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Input, Button, Select, SelectItem, Checkbox, Textarea } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useDilovodSettings } from '../hooks/useDilovodSettings';
import { getBankIcon, getPaymentIcon } from '../lib/bankIcons';
import type { DilovodSettings, SalesChannel, DilovodChannelMapping } from '../../shared/types/dilovod.js';
import type { SalesDriveStatus, SalesDriveChannel } from '../../server/services/salesdrive/SalesDriveTypes.js';

const DilovodSettingsManager: React.FC = () => {
	const {
		settings,
		directories,
		loading,
		saving,
		loadingDirectories,
		error,
		saveSettings,
		refreshDirectories
	} = useDilovodSettings();

	const [formData, setFormData] = useState<Partial<DilovodSettings>>({});
	const [hasChanges, setHasChanges] = useState(false);
	const [testingConnection, setTestingConnection] = useState(false);
	const [testResult, setTestResult] = useState<{ type: 'success' | 'error', message: string, details?: any } | null>(null);
	const [paymentMethods, setPaymentMethods] = useState<Array<{ id: number; name: string }>>([]);
	const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
	const [orderStatuses, setOrderStatuses] = useState<SalesDriveStatus[]>([]);
	const [salesChannels, setSalesChannels] = useState<SalesDriveChannel[]>([]);
	const [loadingSalesDriveData, setLoadingSalesDriveData] = useState(false);
	const [shippingMethods, setShippingMethods] = useState<Array<{ name: string }>>([]);
	const [loadingShippingMethods, setLoadingShippingMethods] = useState(false);

	// Функції для валідації каналів
	const getUsedPaymentFormsForChannel = (channelId: string, excludeMappingId?: string): string[] => {
		const channelSettings = formData.channelPaymentMapping?.[channelId];
		if (!channelSettings?.mappings) return [];

		return channelSettings.mappings
			.filter(mapping => mapping.id !== excludeMappingId && mapping.paymentForm)
			.map(mapping => mapping.paymentForm!)
			.filter(Boolean);
	};

	const getUsedCashAccountsForChannel = (channelId: string, excludeMappingId?: string): string[] => {
		const channelSettings = formData.channelPaymentMapping?.[channelId];
		if (!channelSettings?.mappings) return [];

		return channelSettings.mappings
			.filter(mapping => mapping.id !== excludeMappingId && mapping.cashAccount)
			.map(mapping => mapping.cashAccount!)
			.filter(Boolean);
	};

	const isPaymentFormUsedInChannel = (paymentFormId: string, channelId: string, excludeMappingId?: string): boolean => {
		return getUsedPaymentFormsForChannel(channelId, excludeMappingId).includes(paymentFormId);
	};

	const isCashAccountUsedInChannel = (cashAccountId: string, channelId: string, excludeMappingId?: string): boolean => {
		return getUsedCashAccountsForChannel(channelId, excludeMappingId).includes(cashAccountId);
	};

	/**
	 * Перевірити, чи вже використовується метод оплати SalesDrive в каналі
	 * @param salesDrivePaymentMethod - ID методу оплати з SalesDrive (number)
	 * @param channelId - ID каналу
	 * @param excludeMappingId - ID мапінгу, який виключаємо з перевірки (для редагування)
	 */
	const isSalesDrivePaymentMethodUsedInChannel = (
		salesDrivePaymentMethod: number,
		channelId: string,
		excludeMappingId?: string
	): boolean => {
		const channelSettings = formData.channelPaymentMapping?.[channelId];
		if (!channelSettings) return false;

		return channelSettings.mappings.some(m =>
			m.salesDrivePaymentMethod === salesDrivePaymentMethod &&
			m.id !== excludeMappingId
		);
	};

	// Генерація унікального ID для нового мапінгу
	const generateMappingId = (): string => {
		return `mapping_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	};

	// Завантаження всіх SalesDrive даних
	const fetchAllSalesDriveData = async () => {
		setLoadingSalesDriveData(true);
		setLoadingPaymentMethods(true);

		try {
			const [paymentMethodsRes, statusesRes, channelsRes, shippingMethodsRes] = await Promise.all([
				fetch('/api/salesdrive/payment-methods', { credentials: 'include' }),
				fetch('/api/salesdrive/statuses', { credentials: 'include' }),
				fetch('/api/salesdrive/channels', { credentials: 'include' }),
				fetch('/api/salesdrive/shipping-methods', { credentials: 'include' })
			]);

			// Обробляємо методи оплати
			if (paymentMethodsRes.ok) {
				const paymentData = await paymentMethodsRes.json();
				if (paymentData.success && paymentData.data) {
					setPaymentMethods(paymentData.data);
				}
			}

			// Обробляємо статуси
			if (statusesRes.ok) {
				const statusData = await statusesRes.json();
				if (statusData.success && statusData.data) {
					setOrderStatuses(statusData.data);
				}
			}

			// Обробляємо канали
			if (channelsRes.ok) {
				const channelData = await channelsRes.json();
				if (channelData.success && channelData.data) {
					// Виключаємо канал nk-food.shop з ID "19"
					// const filteredChannels = channelData.data.filter((channel: SalesDriveChannel) => channel.id !== '19');
					const filteredChannels = channelData.data;
					setSalesChannels(filteredChannels);
				}
			}

			// Обробляємо способи доставки
			if (shippingMethodsRes.ok) {
				const shippingData = await shippingMethodsRes.json();
				if (shippingData.success && shippingData.data) {
					setShippingMethods(shippingData.data);
				}
			}
		} catch (error) {
			console.error('❌ Error loading SalesDrive data:', error);
		} finally {
			setLoadingSalesDriveData(false);
			setLoadingPaymentMethods(false);
			setLoadingShippingMethods(false);
		}
	};

	// Синхронізуємо дані форми з налаштуваннями
	useEffect(() => {
		if (settings) {
			setFormData({ ...settings });
			setHasChanges(false);
		}
	}, [settings]);

	// Завантажуємо всі SalesDrive дані при монтуванні компонента
	useEffect(() => {
		fetchAllSalesDriveData();
	}, []);

	const handleFieldChange = (field: keyof DilovodSettings, value: any) => {
		setFormData(prev => ({
			...prev,
			[field]: value
		}));
		setHasChanges(true);

		// Очищаємо результат тесту при зміні API налаштувань
		if (field === 'apiKey' || field === 'apiUrl') {
			setTestResult(null);
		}
	};

	const handleSave = async () => {
		const success = await saveSettings(formData);
		if (success) {
			setHasChanges(false);
			// Оновлюємо довідники якщо змінився API ключ
			if (formData.apiKey !== settings?.apiKey) {
				refreshDirectories();
			}
		}
	};

	const handleReset = () => {
		if (settings) {
			setFormData({ ...settings });
			setHasChanges(false);
		}
	};

	const handleTestConnection = async () => {
		if (!formData.apiKey) return;

		setTestingConnection(true);
		setTestResult(null);

		try {
			// Спочатку збережемо налаштування
			const success = await saveSettings(formData);
			if (!success) {
				setTestResult({
					type: 'error',
					message: 'Помилка збереження налаштувань'
				});
				return;
			}

			// Тестуємо підключення
			const response = await fetch('/api/dilovod/test-connection', {
				method: 'GET',
				credentials: 'include',
			});

			const result = await response.json();
			console.log('🧪 Результат тестування підключення:', result);

			if (response.ok && result.success) {
				setTestResult({
					type: 'success',
					message: result.message || 'Підключення успішне',
					details: result.data
				});

				// Оновлюємо довідники після успішного тестування
				refreshDirectories();
			} else {
				setTestResult({
					type: 'error',
					message: result.message || 'Помилка підключення до API',
					details: result.error || result.details
				});
			}
		} catch (error) {
			console.error('❌ Помилка тестування підключення:', error);
			setTestResult({
				type: 'error',
				message: error instanceof Error ? error.message : 'Невідома помилка підключення'
			});
		} finally {
			setTestingConnection(false);
		}
	};

	if (loading) {
		return (
			<div className="flex justify-center items-center py-8">
				<DynamicIcon name="loader-2" className="animate-spin h-8 w-8 text-gray-600" />
				<span className="ml-2 text-gray-600">Завантаження налаштувань...</span>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{error && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-4">
					<div className="flex items-center gap-2">
						<DynamicIcon name="alert-circle" size={16} className="text-red-600" />
						<span className="text-red-800 text-sm">{error}</span>
					</div>
				</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">

				{/* Налаштування синхронізації */}
				<Card key="sync-settings">
					<CardHeader className="border-b border-gray-200">
						<DynamicIcon name="refresh-cw" size={20} className="text-gray-600 mr-2" />
						<h2 className="text-lg font-semibold text-gray-900">Налаштування синхронізації</h2>
					</CardHeader>
					<CardBody className="p-6 space-y-8">
						<div className="space-y-4">
							<Input
								label="API URL Dilovod"
								placeholder="Введіть API URL (наприклад: https://api.dilovod.ua)"
								value={formData.apiUrl || ''}
								onChange={(e) => handleFieldChange('apiUrl', e.target.value)}
								startContent={<DynamicIcon name="globe" size={16} className="text-gray-400" />}
								className="w-full"
							/>

							<div className="space-y-4">
								<Input
									label="API ключ Dilovod"
									placeholder="Введіть API ключ"
									value={formData.apiKey || ''}
									onChange={(e) => handleFieldChange('apiKey', e.target.value)}
									startContent={<DynamicIcon name="key-round" size={16} className="text-gray-400" />}
									className="w-full"
								/>

								{formData.apiUrl && formData.apiKey && (
									<div className="space-y-3">
										<Button
											size="sm"
											variant="bordered"
											color="primary"
											onPress={handleTestConnection}
											isLoading={testingConnection}
											startContent={!testingConnection && <DynamicIcon name="wifi" size={14} />}
											className="w-full"
										>
											{testingConnection ? 'Тестування...' : 'Тестувати підключення'}
										</Button>

										{testResult && (
											<div className={`p-3 rounded-lg border text-sm ${testResult.type === 'success'
												? 'bg-green-50 border-green-200 text-green-800'
												: 'bg-red-50 border-red-200 text-red-800'
												}`}>
												<div className="flex items-start gap-2">
													<DynamicIcon
														name={testResult.type === 'success' ? 'check-circle' : 'alert-circle'}
														size={16}
														className={testResult.type === 'success' ? 'text-green-600 mt-0.5' : 'text-red-600 mt-0.5'}
													/>
													<div className="flex-1">
														<div className="font-medium">{testResult.message}</div>
														{testResult.details && (
															<div className="mt-1 text-xs opacity-80">
																{typeof testResult.details === 'string'
																	? testResult.details
																	: JSON.stringify(testResult.details, null, 2)
																}
															</div>
														)}
													</div>
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						</div>

						<div className="space-y-4">
							<Select
								label="Пошук контрагента за"
								placeholder="Оберіть поле"
								selectedKeys={formData.getPersonBy ? [formData.getPersonBy] : []}
								onSelectionChange={(keys) => {
									const value = Array.from(keys)[0] as string;
									handleFieldChange('getPersonBy', value as any);
								}}
							>
								<SelectItem key="end_user">Кінцевий споживач</SelectItem>
								<SelectItem key="billing_fullname">Billing Full Name</SelectItem>
								<SelectItem key="shipping_fullname">Shipping Full Name</SelectItem>
								<SelectItem key="billing_company">Billing Company</SelectItem>
								<SelectItem key="billing_phone">Billing Phone</SelectItem>
								<SelectItem key="billing_email">Billing Email</SelectItem>
								<SelectItem key="shipping_company">Shipping Company</SelectItem>
								<SelectItem key="shipping_phone">Shipping Phone</SelectItem>
								<SelectItem key="shipping_email">Shipping Email</SelectItem>
							</Select>

							<div className="grid grid-cols-1 gap-4 pl-2">
								<Checkbox
									isSelected={formData.logSendOrder || false}
									onValueChange={(checked) => handleFieldChange('logSendOrder', checked)}
									classNames={{ label: 'text-sm leading-tight' }}
								>
									Ввімкнути логування
								</Checkbox>

								<Checkbox
									isSelected={formData.liqpayCommission || false}
									onValueChange={(checked) => handleFieldChange('liqpayCommission', checked)}
									classNames={{ label: 'text-sm leading-tight' }}
								>
									Створювати надходження грошей
								</Checkbox>
							</div>
						</div>
					</CardBody>
				</Card>

				{/* Налаштування складів */}
				<Card key="storage-settings">
					<CardHeader className="border-b border-gray-200">
						<DynamicIcon name="warehouse" size={20} className="text-gray-600 mr-2" />
						<h2 className="text-lg font-semibold text-gray-900">Налаштування складів</h2>
					</CardHeader>
					<CardBody className="p-6">
						<div className="space-y-4">
							{directories?.storages && (
								<div key="storages-section">
									<Select
										label="Основний склад для списання"
										placeholder="Оберіть склад"
										selectedKeys={(() => {
											// Перевіряємо, чи існує обраний склад у списку
											if (!formData.storageId) return [];
											const storageExists = directories?.storages?.some(s => s.id === formData.storageId);
											return storageExists ? [formData.storageId] : [];
										})()}
										onSelectionChange={(keys) => {
											const value = Array.from(keys)[0] as string;
											handleFieldChange('storageId', value);
										}}
									>
										{directories.storages.map((storage) => (
											<SelectItem key={storage.id} textValue={`${storage.name} (${storage.code})`}>
												{storage.name} ({storage.code})
											</SelectItem>
										))}
									</Select>

									<div className="flex justify-between items-center mt-4 mb-2">
										<label className="text-sm font-medium text-gray-700">
											Склади для синхронізації
										</label>
										<Button
											size="sm"
											variant="light"
											onPress={() => refreshDirectories()}
											isLoading={loadingDirectories}
											startContent={!loadingDirectories && <DynamicIcon name="refresh-cw" size={14} />}
										>
											Оновити
										</Button>
									</div>
									<div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
										{directories.storages.map((storage) => (
											<Checkbox
												key={`sync-storage-${storage.id}`}
												isSelected={formData.storageIdsList?.includes(storage.id) || false}
												classNames={{ label: 'text-sm leading-tight' }}
												onValueChange={(checked) => {
													const currentList = formData.storageIdsList || [];
													const newList = checked
														? [...currentList, storage.id]
														: currentList.filter(id => id !== storage.id);
													handleFieldChange('storageIdsList', newList);
												}}
											>
												{storage.name} ({storage.code})
											</Checkbox>
										))}
									</div>
								</div>
							)}

							{!directories?.storages && formData.apiUrl && formData.apiKey && (
								<div className="text-center py-4">
									<Button
										color="primary"
										variant="bordered"
										onPress={refreshDirectories}
										isLoading={loadingDirectories}
										startContent={!loadingDirectories && <DynamicIcon name="download" size={16} />}
									>
										{loadingDirectories ? 'Завантаження...' : 'Завантажити склади з Dilovod'}
									</Button>
								</div>
							)}

							<div className="space-y-4 mt-8">
								<Select
									label="Інтервал синхронізації"
									placeholder="Оберіть інтервал"
									selectedKeys={formData.synchronizationInterval ? [formData.synchronizationInterval] : []}
									onSelectionChange={(keys) => {
										const value = Array.from(keys)[0] as string;
										handleFieldChange('synchronizationInterval', value);
									}}
								>
									<SelectItem key="none sync">Не синхронізувати</SelectItem>
									<SelectItem key="hourly">Щогодини</SelectItem>
									<SelectItem key="every two hours">Кожні 2 години</SelectItem>
									<SelectItem key="twicedaily">Двічі на день</SelectItem>
									<SelectItem key="daily">Щодня</SelectItem>
									<SelectItem key="every two days">Кожні 2 дні</SelectItem>
								</Select>
								<div className="grid grid-cols-1 gap-4 pl-2">
									<Checkbox
										isSelected={formData.synchronizationStockQuantity || false}
										onValueChange={(checked) => handleFieldChange('synchronizationStockQuantity', checked)}
										classNames={{ label: 'text-sm leading-tight' }}
									>
										Синхронізувати залишки
									</Checkbox>
								</div>
							</div>

							{(!formData.apiUrl || !formData.apiKey) && (
								<div className="text-center py-4 text-gray-500">
									<DynamicIcon name="info" size={16} className="inline mr-2" />
									Введіть API URL та API ключ для завантаження списку складів
								</div>
							)}
						</div>
					</CardBody>
				</Card>

				{/* Налаштування експорту замовлень */}
				<Card key="export-settings">
					<CardHeader className="border-b border-gray-200">
						<DynamicIcon name="upload" size={20} className="text-gray-600 mr-2" />
						<h2 className="text-lg font-semibold text-gray-900">Налаштування експорту замовлень</h2>
					</CardHeader>
					<CardBody className="p-6">
						<div className="space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Select
									label="Формування номера"
									placeholder="Оберіть спосіб"
									selectedKeys={formData.unloadOrderNumberAs ? [formData.unloadOrderNumberAs] : []}
									onSelectionChange={(keys) => {
										const value = Array.from(keys)[0] as string;
										handleFieldChange('unloadOrderNumberAs', value as any);
									}}
								>
									<SelectItem key="dilovod">В Діловоді</SelectItem>
									<SelectItem key="web">З SalesDrive</SelectItem>
								</Select>

								<Select
									label="Експортувати як"
									placeholder="Оберіть тип документа"
									selectedKeys={formData.unloadOrderAs ? [formData.unloadOrderAs] : []}
									onSelectionChange={(keys) => {
										const value = Array.from(keys)[0] as string;
										handleFieldChange('unloadOrderAs', value as any);
									}}
								>
									<SelectItem key="sale">Відвантаження</SelectItem>
									<SelectItem key="saleOrder">Замовлення</SelectItem>
								</Select>
							</div>

							{/* Фірма за замовчуванням */}
							{directories?.firms && (
								<Select
									label="Фірма за замовчуванням"
									placeholder="Оберіть фірму"
									selectedKeys={(() => {
										// Перевіряємо, чи існує обрана фірма у списку
										if (!formData.defaultFirmId) return [];
										const firmExists = directories?.firms?.some(f => f.id === formData.defaultFirmId);
										return firmExists ? [formData.defaultFirmId] : [];
									})()}
									onSelectionChange={(keys) => {
										const value = Array.from(keys)[0] as string;
										handleFieldChange('defaultFirmId', value);
									}}
									description="Фірма буде визначатись автоматично за рахунком, або використовуватись ця за замовчуванням"
								>
									{directories.firms.map((firm) => (
										<SelectItem key={firm.id} textValue={firm.name}>
											<div className="flex justify-between items-center">
												<span>{firm.name}</span>
												<span className="text-tiny text-default-400">ID: {firm.id}</span>
											</div>
										</SelectItem>
									))}
								</Select>
							)}

							<div className="grid grid-cols-1 gap-4 pl-2">
								<Checkbox
									isSelected={formData.autoSendOrder || false}
									onValueChange={(checked) => handleFieldChange('autoSendOrder', checked)}
									classNames={{ label: 'text-sm leading-tight' }}
								>
									Автоматичний експорт замовлення
								</Checkbox>
							</div>

							{/* Статуси замовлення для автоматичної вигрузки */}
							{formData.autoSendOrder && (
								<Select
									aria-label="Статуси замовлень"
									placeholder="Оберіть статуси"
									selectionMode="multiple"
									selectedKeys={new Set(formData.autoSendListSettings || [])}
									onSelectionChange={(keys) => {
										const values = Array.from(keys).map((k) => String(k));
										handleFieldChange('autoSendListSettings', values);
									}}
									classNames={{ trigger: 'min-h-[48px]' }}
									renderValue={(items) => {
										if (items.length === 0) return "Оберіть статуси";
										return (
											<div className="flex gap-1 max-h-10 overflow-y-auto scrollbar-hide [mask-image:linear-gradient(to_right,black_0,black_90%,transparent_100%)]">
												{Array.from(items).map((item) => (
													<span key={item.key} className="bg-grey-500/15 text-primary px-2 py-1 rounded text-xs">
														{item.textValue}
													</span>
												))}
											</div>
										);
									}}
								>
									{orderStatuses.map((status) => (
										<SelectItem key={status.id} textValue={status.name}>
											{status.name}
										</SelectItem>
									))}
								</Select>
							)}
						</div>
					</CardBody>
				</Card>

				{/* Налаштування мапінгу способів доставки */}
				<Card key="delivery-mapping">
					<CardHeader className="border-b border-gray-200">
						<DynamicIcon name="truck" size={20} className="text-gray-600 mr-2" />
						<h2 className="text-lg font-semibold text-gray-900">Мапінг способів доставки</h2>
					</CardHeader>
					<CardBody className="p-6">
						<div className="space-y-4">
							<p className="text-sm text-gray-600 mb-4">
								Налаштуйте відповідність між способами доставки з SalesDrive та Dilovod
							</p>

							{/* Список існуючих мапінгів способів доставки */}
							{(formData.deliveryMappings || []).map((mapping, index) => (
								<div key={index} className="rounded-lg p-4 border border-gray-200 shadow-md shadow-gray-100">
									<div className="flex justify-between items-center mb-3">
										<span className="text-sm font-medium text-gray-700">
											Мапінг способу доставки #{index + 1}
										</span>
										<Button
											size="sm"
											color="danger"
											variant="light"
											onPress={() => {
												const updatedMappings = (formData.deliveryMappings || []).filter((_, i) => i !== index);
												handleFieldChange('deliveryMappings', updatedMappings);
											}}
											startContent={<DynamicIcon name="trash-2" size={12} />}
										>
											Видалити
										</Button>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										{/* Способи доставки SalesDrive (множинний вибір) */}
										<div>
											<label className="text-sm text-gray-600 mb-1 block">
												SalesDrive
												<span className="text-xs text-gray-500 ml-1">(множинний вибір)</span>
											</label>
											<Select
												aria-label="Способи доставки SalesDrive"
												placeholder="Оберіть способи доставки"
												selectionMode="multiple"
												selectedKeys={new Set(mapping.salesDriveShippingMethods || [])}
												onSelectionChange={(keys) => {
													const values = Array.from(keys) as string[];
													const updatedMappings = (formData.deliveryMappings || []).map((m, i) =>
														i === index ? { ...m, salesDriveShippingMethods: values } : m
													);
													handleFieldChange('deliveryMappings', updatedMappings);
												}}
												isDisabled={loadingShippingMethods || shippingMethods.length === 0}
												classNames={{ trigger: 'min-h-[48px]' }}
												renderValue={(items) => {
													if (items.length === 0) return "Оберіть способи доставки";
													return (
														<div className="flex gap-1 max-h-10 overflow-y-auto scrollbar-hide [mask-image:linear-gradient(to_right,black_0,black_90%,transparent_100%)]">
															{Array.from(items).map((item) => (
																<span key={item.key} className="bg-grey-500/15 text-primary px-2 py-1 rounded text-xs">
																	{item.textValue}
																</span>
															))}
														</div>
													);
												}}
											>
												{shippingMethods.map((method) => (
													<SelectItem key={method.name} textValue={method.name}>
														<div className="flex items-center gap-2">
															<DynamicIcon name="truck" size={16} className="text-gray-500" />
															<span className="text-small">{method.name}</span>
														</div>
													</SelectItem>
												))}
											</Select>
										</div>

										{/* Спосіб доставки Dilovod (одинарний вибір) */}
										<div>
											<label className="text-sm text-gray-600 mb-1 block">
												Dilovod
											</label>
											<Select
												aria-label="Спосіб доставки Dilovod"
												placeholder="Оберіть спосіб доставки"
												selectedKeys={(() => {
													// Перевіряємо, чи існує обраний метод доставки у списку
													if (!mapping.dilovodDeliveryMethodId) return [];
													const methodExists = directories?.deliveryMethods?.some(dm => dm.id === mapping.dilovodDeliveryMethodId);
													return methodExists ? [mapping.dilovodDeliveryMethodId] : [];
												})()}
												onSelectionChange={(keys) => {
													const value = Array.from(keys)[0] as string;
													const updatedMappings = (formData.deliveryMappings || []).map((m, i) =>
														i === index ? { ...m, dilovodDeliveryMethodId: value || undefined } : m
													);
													handleFieldChange('deliveryMappings', updatedMappings);
												}}
												isDisabled={!directories || loadingDirectories}
												classNames={{ trigger: 'min-h-[48px]' }}
												renderValue={(items) => {
													const item = items[0];
													if (!item) return null;

													const deliveryMethod = directories?.deliveryMethods?.find(dm => dm.id === item.key);
													if (!deliveryMethod) return item.textValue;

													return (
														<div className="flex items-center gap-2">
															<div className="flex flex-col">
																<span className="text-small">{deliveryMethod.id__pr}</span>
																<span className="text-tiny text-default-400">ID: {deliveryMethod.id}</span>
															</div>
														</div>
													);
												}}
											>
												{directories?.deliveryMethods?.map((deliveryMethod) => (
													<SelectItem key={deliveryMethod.id} textValue={deliveryMethod.id__pr}>
														<div className="flex items-center gap-2">
															<div className="flex flex-col">
																<span className="text-small">{deliveryMethod.id__pr}</span>
																<span className="text-tiny text-default-400">ID: {deliveryMethod.id}</span>
															</div>
														</div>
													</SelectItem>
												)) || []}
											</Select>
										</div>
									</div>
								</div>
							))}

							{/* Кнопка додавання нового мапінгу способу доставки */}
							<Button
								size="sm"
								variant="bordered"
								color="primary"
								className="border-1.5"
								onPress={() => {
									const newDeliveryMapping = {
										salesDriveShippingMethods: [],
										dilovodDeliveryMethodId: ''
									};
									const updatedMappings = [...(formData.deliveryMappings || []), newDeliveryMapping];
									handleFieldChange('deliveryMappings', updatedMappings);
								}}
								startContent={<DynamicIcon name="plus-circle" size={14} />}
							>
								Додати мапінг способу доставки
							</Button>
						</div>
					</CardBody>
				</Card>
			</div>

			{/* Налаштування каналів продажів */}
			<Card key="sales-channels">
				<CardHeader className="border-b border-gray-200">
					<DynamicIcon name="store" size={20} className="text-gray-600 mr-2" />
					<h2 className="text-lg font-semibold text-gray-900">Канали продажів</h2>
				</CardHeader>
				<CardBody className="p-6">
					<div className="space-y-6">
						{/* Існуючі мапінги каналів */}
						{Object.entries(formData.channelPaymentMapping || {}).map(([channelId, channelSettings]) => {
							const channel = salesChannels.find(ch => ch.id === channelId);
							if (!channel || !channelSettings || !channelSettings.mappings || channelSettings.mappings.length === 0) return null;

							return (
								<div key={channelId} className="border border-gray-200 rounded-lg p-4">
									<div className="flex justify-between items-center mb-4">
										<h3 className="text-lg font-medium text-gray-800">
											<DynamicIcon name="radio" size={20} className="text-lime-600 inline mr-2" />
											{channel.name} <span className="text-sm bg-amber-100 rounded px-1.5 py-0.5 ml-2">ID: {channelId}</span>
										</h3>
									</div>

									{/* Налаштування префіксу та суфіксу для каналу */}
									<div className="rounded-lg p-4 border border-gray-200 shadow-md shadow-gray-100 mb-4">
										<h4 className="text-sm font-medium text-neutral-900 mb-3">Налаштування номера замовлення для каналу</h4>
										<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
											<div>
												<label className="text-xs text-neutral-700 mb-1 block">Префікс до номера замовлення</label>
												<Input
													value={channelSettings.prefixOrder || ''}
													onChange={(e) => {
														const currentMapping = formData.channelPaymentMapping || {};
														const updatedChannelSettings = {
															...channelSettings,
															prefixOrder: e.target.value || undefined
														};
														handleFieldChange('channelPaymentMapping', {
															...currentMapping,
															[channelId]: updatedChannelSettings
														});
													}}
													size="sm"
												/>
											</div>
											<div>
												<label className="text-xs text-neutral-700 mb-1 block">Суфікс до номера замовлення</label>
												<Input
													value={channelSettings.sufixOrder || ''}
													onChange={(e) => {
														const currentMapping = formData.channelPaymentMapping || {};
														const updatedChannelSettings = {
															...channelSettings,
															sufixOrder: e.target.value || undefined
														};
														handleFieldChange('channelPaymentMapping', {
															...currentMapping,
															[channelId]: updatedChannelSettings
														});
													}}
													size="sm"
												/>
											</div>
											<div>
												<label className="text-xs text-neutral-700 mb-1 block">Канал продажів в Dilovod</label>
												<Select
													placeholder="Автоматично"
													selectedKeys={(() => {
														// Перевіряємо, чи існує обраний канал продажів у списку
														if (!channelSettings.dilovodTradeChannelId) return [];
														const channelExists = directories?.tradeChanels?.some(tc => tc.id === channelSettings.dilovodTradeChannelId);
														return channelExists ? [channelSettings.dilovodTradeChannelId] : [];
													})()}
													onSelectionChange={(keys) => {
														const value = Array.from(keys)[0] as string;
														const currentMapping = formData.channelPaymentMapping || {};
														const updatedChannelSettings = {
															...channelSettings,
															dilovodTradeChannelId: value || undefined
														};
														handleFieldChange('channelPaymentMapping', {
															...currentMapping,
															[channelId]: updatedChannelSettings
														});
													}}
													size="sm"
													aria-label="Канал продажів в Dilovod"
													classNames={{
														trigger: "min-h-[32px] h-8",
														value: "text-small"
													}}
													renderValue={(items) => {
														if (items.length === 0) return "Автоматично";
														const item = items[0];
														const tradeChannel = directories?.tradeChanels?.find(tc => tc.id === item.key);
														return tradeChannel ? tradeChannel.id__pr : item.textValue;
													}}
												>
													{directories?.tradeChanels?.map((tradeChannel) => (
														<SelectItem key={tradeChannel.id} textValue={tradeChannel.id__pr}>
															<div className="flex flex-col">
																<span className="text-small">{tradeChannel.id__pr}</span>
																<span className="text-tiny text-default-400">Код: {tradeChannel.code}, ID: {tradeChannel.id}</span>
															</div>
														</SelectItem>
													)) || []}
												</Select>
											</div>
										</div>
									</div>

									{/* Список мапінгів для цього каналу */}
									<div className="space-y-4">
										{channelSettings.mappings.map((mapping, index) => (
											<div key={mapping.id} className="rounded-lg p-4 border border-gray-200 shadow-md shadow-gray-100">
												<div className="flex justify-between items-center mb-3">
													<span className="text-sm font-medium text-gray-700">
														Мапінг #{index + 1}
													</span>
													<Button
														size="sm"
														color="danger"
														variant="light"
														onPress={() => {
															const currentMapping = formData.channelPaymentMapping || {};
															const currentChannelSettings = currentMapping[channelId];
															if (!currentChannelSettings) return;

															const updatedMappings = currentChannelSettings.mappings.filter(m => m.id !== mapping.id);

															// Якщо мапінгів не залишилося, видаляємо весь канал
															if (updatedMappings.length === 0) {
																const { [channelId]: removed, ...restMapping } = currentMapping;
																handleFieldChange('channelPaymentMapping', restMapping);
															} else {
																// Інакше оновлюємо мапінги в налаштуваннях каналу
																const updatedChannelSettings = {
																	...currentChannelSettings,
																	mappings: updatedMappings
																};
																handleFieldChange('channelPaymentMapping', {
																	...currentMapping,
																	[channelId]: updatedChannelSettings
																});
															}
														}}
														startContent={<DynamicIcon name="trash-2" size={12} />}
													>
														Видалити
													</Button>
												</div>

												{/* Dilovod mapping - 3 columns */}
												<div className="grid grid-cols-[1fr_1fr_1fr] gap-4">
													{/* Метод оплати з SalesDrive */}
													<div className="">
														<label className="text-sm text-gray-600 mb-1 block">
															Метод оплати з SalesDrive
															{/* <span className="text-xs text-gray-500 ml-2">(з замовлення)</span> */}
														</label>
														<Select
															aria-label="Метод оплати SalesDrive"
															maxListboxHeight={400}
															placeholder="Оберіть метод оплати"
															selectedKeys={(() => {
																// Перевіряємо, чи існує обраний метод оплати у списку
																if (!mapping.salesDrivePaymentMethod) return [];
																const methodExists = paymentMethods.some(m => m.id === mapping.salesDrivePaymentMethod);
																return methodExists ? [String(mapping.salesDrivePaymentMethod)] : [];
															})()}
															onSelectionChange={(keys) => {
																const value = Array.from(keys)[0] as string;
																const numericValue = value ? Number(value) : undefined;
																const currentMapping = formData.channelPaymentMapping || {};
																const currentChannelSettings = currentMapping[channelId];
																if (!currentChannelSettings) return;

																const updatedMappings = currentChannelSettings.mappings.map(m =>
																	m.id === mapping.id ? { ...m, salesDrivePaymentMethod: numericValue } : m
																);

																const updatedChannelSettings = {
																	...currentChannelSettings,
																	mappings: updatedMappings
																};

																handleFieldChange('channelPaymentMapping', {
																	...currentMapping,
																	[channelId]: updatedChannelSettings
																});
															}}
															isDisabled={loadingPaymentMethods || paymentMethods.length === 0}
															classNames={{ trigger: 'min-h-[64px]' }}
															renderValue={(items) => {
																const item = items[0];
																if (!item) return null;

																const method = paymentMethods.find(m => m.id === Number(item.key));
																if (!method) return item.textValue;

																return (
																	<div className="flex items-center gap-2">
																		{getPaymentIcon(method.name)}
																		<div className="flex flex-col">
																			<span className="text-small">{method.name}</span>
																			<span className="border-1 border-default-400 px-1 mt-0.5 rounded text-default-400 text-xs inline-block w-fit">ID: {method.id}</span>
																		</div>
																	</div>
																);
															}}
														>
															{paymentMethods.map((method) => {
																const isUsed = isSalesDrivePaymentMethodUsedInChannel(method.id, channelId, mapping.id);
																return (
																	<SelectItem
																		key={method.id}
																		textValue={method.name}
																		isDisabled={isUsed}
																	>
																		<div className={`flex items-center gap-2 ${isUsed ? 'opacity-60' : ''}`}>
																			{getPaymentIcon(method.name)}
																			<div className="flex flex-col">
																				<span className="text-small">{method.name} {isUsed ? '(Вже використовується в цьому каналі)' : ''}</span>
																				<span className="text-default-400 text-xs inline-block w-fit">ID: {method.id}</span>
																			</div>
																		</div>
																	</SelectItem>
																);
															})}
														</Select>
														{/* Попередження про відсутній метод оплати */}
														{mapping.salesDrivePaymentMethod && !paymentMethods.some(m => m.id === mapping.salesDrivePaymentMethod) && (
															<div className="mt-2 p-2 bg-warning/10 border border-warning rounded-md">
																<div className="flex items-start gap-2">
																	<DynamicIcon name="alert-triangle" size={16} className="text-warning mt-0.5" />
																	<div className="text-xs text-warning-700">
																		<p className="font-medium">Метод оплати не знайдено</p>
																		<p className="text-warning-600">ID: {mapping.salesDrivePaymentMethod}</p>
																		<p className="text-warning-600 mt-1">Цей метод оплати не знайдено у списку методів SalesDrive. Можливо, API недоступний або метод був видалений.</p>
																	</div>
																</div>
															</div>
														)}
													</div>

													{/* Засіб оплати Dilovod */}
													<div>
														<label className="text-sm text-gray-600 mb-1 block">
															Форма оплати в Dilovod
															{/* <span className="text-xs text-gray-500 ml-2">(куди мапити)</span> */}
														</label>
														<Select
															aria-label="Засіб оплати"
															maxListboxHeight={400}
															placeholder="Оберіть форму оплати"
															selectedKeys={(() => {
																// Перевіряємо, чи існує обрана форма оплати у довідниках
																if (!mapping.paymentForm) return [];
																const formExists = directories?.paymentForms?.some(f => f.id === mapping.paymentForm);
																return formExists ? [mapping.paymentForm] : [];
															})()}
															onSelectionChange={(keys) => {
																const value = Array.from(keys)[0] as string;
																const currentMapping = formData.channelPaymentMapping || {};
																const currentChannelSettings = currentMapping[channelId];
																if (!currentChannelSettings) return;

																// Перевіряємо, чи нова форма оплати є готівковою
																const selectedPaymentForm = directories?.paymentForms?.find(f => f.id === value);
																const isCashPayment = selectedPaymentForm?.name?.toLowerCase().includes('готівк') ||
																	selectedPaymentForm?.name?.toLowerCase().includes('cash') ||
																	selectedPaymentForm?.name?.toLowerCase().includes('наличн');

																const updatedMappings = currentChannelSettings.mappings.map(m =>
																	m.id === mapping.id ? {
																		...m,
																		paymentForm: value || undefined,
																		// Якщо це готівка - очищаємо рахунок
																		cashAccount: isCashPayment ? undefined : m.cashAccount
																	} : m
																);

																const updatedChannelSettings = {
																	...currentChannelSettings,
																	mappings: updatedMappings
																};

																handleFieldChange('channelPaymentMapping', {
																	...currentMapping,
																	[channelId]: updatedChannelSettings
																});
															}}
															isDisabled={!directories || loadingDirectories}
															classNames={{ trigger: 'min-h-[64px]' }}
															renderValue={(items) => {
																const item = items[0];
																if (!item) return null;

																const form = directories?.paymentForms?.find(f => f.id === item.key);
																if (!form) return item.textValue;

																return (
																	<div className="flex items-center gap-2">
																		{getPaymentIcon(form.name)}
																		<div className="flex flex-col">
																			<span className="text-small">{form.name}</span>
																			<span className="border-1 border-default-400 px-1 mt-0.5 rounded text-default-400 text-xs inline-block w-fit">ID: {form.id}</span>
																		</div>
																	</div>
																);
															}}
														>
															{directories?.paymentForms?.map((form) => {
																const isUsed = isPaymentFormUsedInChannel(form.id, channelId, mapping.id);
																return (
																	<SelectItem
																		key={form.id}
																		textValue={form.name}
																	// isDisabled={isUsed}
																	>
																		<div className={`flex items-center gap-2`}>
																			{getPaymentIcon(form.name)}
																			<div className="flex flex-col">
																				<span className="text-small">{form.name}</span>
																				<span className="text-default-400 text-xs inline-block w-fit text-nowrap">ID: {form.id}</span>
																			</div>
																		</div>
																	</SelectItem>
																);
															}) || []}
														</Select>
														{/* Попередження про відсутню форму оплати */}
														{mapping.paymentForm && !directories?.paymentForms?.some(f => f.id === mapping.paymentForm) && (
															<div className="mt-2 p-2 bg-warning/10 border border-warning rounded-md">
																<div className="flex items-start gap-2">
																	<DynamicIcon name="alert-triangle" size={16} className="text-warning mt-0.5" />
																	<div className="text-xs text-warning-700">
																		<p className="font-medium">Форму оплати не знайдено</p>
																		<p className="text-warning-600">ID: {mapping.paymentForm}</p>
																		<p className="text-warning-600 mt-1">Ця форма оплати більше не існує в довідниках Dilovod. Оберіть іншу форму оплати.</p>
																	</div>
																</div>
															</div>
														)}
													</div>

													{/* Рахунок */}
													<div>
														<label className="text-sm text-gray-600 mb-1 block">
															Рахунок в Dilovod
															<span className="text-xs text-gray-500 ml-2">(визначає фірму)</span>
														</label>
														<Select
															aria-label="Рахунок"
															maxListboxHeight={400}
															placeholder={(() => {
																// Перевіряємо, чи обрана форма оплати є готівковою
																const selectedPaymentForm = directories?.paymentForms?.find(f => f.id === mapping.paymentForm);
																const isCashPayment = selectedPaymentForm?.name?.toLowerCase().includes('готівкою') || selectedPaymentForm?.name?.toLowerCase().includes('готівка');

																// Виводимо сповіщення якщо це готівка
																return isCashPayment ? "Для готівкових операцій рахунок не вказується" : "Оберіть рахунок";
															})()}
															selectedKeys={(() => {
																// Перевіряємо, чи існує обраний рахунок у довідниках
																if (!mapping.cashAccount) return [];
																const accountExists = directories?.cashAccounts?.some(acc => acc.id === mapping.cashAccount);
																return accountExists ? [mapping.cashAccount] : [];
															})()}
															onSelectionChange={(keys) => {
																const value = Array.from(keys)[0] as string;
																const currentMapping = formData.channelPaymentMapping || {};
																const currentChannelSettings = currentMapping[channelId];
																if (!currentChannelSettings) return;

																const updatedMappings = currentChannelSettings.mappings.map(m =>
																	m.id === mapping.id ? { ...m, cashAccount: value || undefined } : m
																);

																const updatedChannelSettings = {
																	...currentChannelSettings,
																	mappings: updatedMappings
																};

																handleFieldChange('channelPaymentMapping', {
																	...currentMapping,
																	[channelId]: updatedChannelSettings
																});
															}}
															isDisabled={(() => {
																// Перевіряємо, чи обрана форма оплати є готівковою
																const selectedPaymentForm = directories?.paymentForms?.find(f => f.id === mapping.paymentForm);
																const isCashPayment = selectedPaymentForm?.name?.toLowerCase().includes('готівкою') || selectedPaymentForm?.name?.toLowerCase().includes('готівка');

																// Блокуємо Select якщо це готівка або якщо немає довідників
																return isCashPayment || !directories || loadingDirectories;
															})()}
															classNames={{ trigger: 'min-h-[64px]' }}
															renderValue={(items) => {
																const item = items[0];
																if (!item) return null;

																const account = directories?.cashAccounts?.find(acc => acc.id === item.key);
																if (!account) return item.textValue;

																// Знаходимо фірму-власника
																const ownerFirm = account.owner && directories?.firms?.find(firm => firm.id === account.owner);
																const ownerName = ownerFirm ? ownerFirm.name : 'Невідомий власник';

																// Перевіряємо чи рахунок закритий
																const isClosed = account.name.startsWith('Закритий');
																const displayName = isClosed ? account.name.replace(/^Закритий/, '').trim() : account.name;

																return (
																	<div className={`flex items-center gap-2 ${isClosed ? 'opacity-60 grayscale' : ''}`}>
																		{getBankIcon(account.name)}
																		<div className="flex flex-col">
																			<span className="flex items-center gap-2 text-small">{ownerName} <span className="border-1 border-default-400 px-1 rounded text-default-500 text-xs inline-block w-fit">ID: {ownerFirm?.id}</span> {isClosed ? '(Закритий)' : ''}</span>
																			<span className="text-tiny text-default-400">{displayName}</span>
																			<span className="text-tiny text-default-500 bg-default-500/10 px-1 rounded inline-block w-fit">ID: {account.id}</span>
																		</div>
																	</div>
																);
															}}
														>
															{directories?.cashAccounts?.map((account) => {
																// Знаходимо фірму-власника
																const ownerFirm = account.owner && directories?.firms?.find(firm => firm.id === account.owner);
																const ownerName = ownerFirm ? ownerFirm.name : 'Невідомий власник';

																// Перевіряємо чи рахунок закритий або вже використовується
																const isClosed = account.name.startsWith('Закритий');
																// const isUsed = isCashAccountUsedInChannel(account.id, channelId, mapping.id);
																const displayName = isClosed ? account.name.replace(/^Закритий/, '').trim() : account.name;
																const isDisabled = isClosed;

																return (
																	<SelectItem
																		key={account.id}
																		textValue={`${ownerName} (ID: ${account.id})`}
																		isDisabled={isDisabled}
																	>
																		<div className={`flex items-center gap-2 ${isDisabled ? 'opacity-60 grayscale' : ''}`}>
																			{getBankIcon(account.name)}
																			<div className="flex flex-col">
																				<span className="text-small">
																					{ownerName} <span className="border-1 border-default-400 px-1 rounded text-default-500 text-xs inline-block w-fit">ID: {ownerFirm?.id}</span>
																					{isClosed ? ' (Закритий)' : ''}
																					{/* {isUsed ? ' (Вже використовується в цьому каналі)' : ''} */}
																				</span>
																				<span className="text-tiny text-default-400">{displayName}</span>
																				<span className="text-tiny text-default-500 bg-default-500/10 px-1 rounded inline-block w-fit">ID: {account.id}</span>
																			</div>
																		</div>
																	</SelectItem>
																);
															}) || []}
														</Select>

														{/* Попередження про відсутній рахунок */}
														{mapping.cashAccount && !directories?.cashAccounts?.some(acc => acc.id === mapping.cashAccount) && (
															<div className="mt-2 p-2 bg-warning/10 border border-warning rounded-md">
																<div className="flex items-start gap-2">
																	<DynamicIcon name="alert-triangle" size={16} className="text-warning mt-0.5" />
																	<div className="text-xs text-warning-700">
																		<p className="font-medium">Рахунок не знайдено</p>
																		<p className="text-warning-600">ID: {mapping.cashAccount}</p>
																		<p className="text-warning-600 mt-1">Цей рахунок більше не існує в довідниках Dilovod. Оберіть інший рахунок.</p>
																	</div>
																</div>
															</div>
														)}
													</div>
												</div>
												{/* End of 2-column grid for Dilovod mapping */}
											</div>
										))}

										{/* Кнопка додавання нового мапінгу до існуючого каналу */}
										<Button
											size="sm"
											variant="bordered"
											color="primary"
											className="border-1.5"
											onPress={() => {
												const currentMapping = formData.channelPaymentMapping || {};
												const currentChannelSettings = currentMapping[channelId];
												if (!currentChannelSettings) return;

												const newMapping = {
													id: generateMappingId(),
													channelId: channelId,
													paymentForm: undefined,
													cashAccount: undefined
												};

												const updatedChannelSettings = {
													...currentChannelSettings,
													mappings: [...currentChannelSettings.mappings, newMapping]
												};

												handleFieldChange('channelPaymentMapping', {
													...currentMapping,
													[channelId]: updatedChannelSettings
												});
											}}
											startContent={<DynamicIcon name="plus-circle" size={14} />}
										>
											Додати ще один мапінг до {channel.name}
										</Button>
									</div>
								</div>
							);
						})}

						{/* Кнопка додавання нового каналу */}
						<div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
							<div className="flex flex-col items-center gap-4">
								<DynamicIcon name="plus-circle" size={48} className="text-gray-400" />
								<div className="text-center">
									<h3 className="text-lg font-medium text-gray-900 mb-2">Додати канал продажів</h3>
									<p className="text-sm text-gray-500 mb-4">
										Оберіть канал продажів зі списку доступних каналів
										{loadingSalesDriveData && ' (завантаження...)'}
									</p>

									<Select
										label="Канал продажів"
										placeholder="Оберіть канал"
										className="max-w-xs"
										onSelectionChange={(keys) => {
											const channelId = Array.from(keys)[0] as string;
											if (!channelId) return;

											const currentMapping = formData.channelPaymentMapping || {};
											const newMapping = {
												id: generateMappingId(),
												channelId: channelId,
												paymentForm: undefined,
												cashAccount: undefined
											};

											const newChannelSettings = {
												channelId: channelId,
												prefixOrder: undefined,
												sufixOrder: undefined,
												mappings: [newMapping]
											};

											handleFieldChange('channelPaymentMapping', {
												...currentMapping,
												[channelId]: newChannelSettings
											});
										}}
									>
										{salesChannels
											.filter(channel => !formData.channelPaymentMapping?.[channel.id] || !formData.channelPaymentMapping[channel.id].mappings || formData.channelPaymentMapping[channel.id].mappings.length === 0)
											.map((channel) => (
												<SelectItem key={channel.id} textValue={channel.name}>
													<div className="flex justify-between items-center">
														<span>{channel.name}</span>
														<span className="text-tiny text-default-500">ID: {channel.id}</span>
													</div>
												</SelectItem>
											))
										}
									</Select>
								</div>
							</div>
						</div>

						<p className="text-sm text-gray-500">
							Налаштуйте відповідність між каналами продажів з SalesDrive та формами оплати/рахунками в Dilovod
						</p>
					</div>
				</CardBody>
			</Card>

			{/* Кнопки управління */}
			<Card key="control-buttons" className="shadow-2xs bg-neutral-100">
				<CardBody className="p-6">
					<div className="flex justify-between items-center">
						<div className="text-sm text-gray-600">
							{hasChanges ? (
								<span className="flex items-center gap-2">
									<DynamicIcon name="circle-dot" size={16} className="text-orange-500" />
									Є незбережені зміни
								</span>
							) : (
								<span className="flex items-center gap-2 text-neutral-500">
									<DynamicIcon name="check-circle" size={16} className="text-green-500" />
									Всі зміни збережені
								</span>
							)}
						</div>

						<div className="flex gap-4">
							<Button
								color="default"
								variant="bordered"
								onPress={handleReset}
								isDisabled={!hasChanges || saving}
								startContent={<DynamicIcon name="rotate-ccw" size={16} />}
							>
								Скасувати зміни
							</Button>

							<Button
								color="primary"
								onPress={handleSave}
								isLoading={saving}
								isDisabled={!hasChanges}
								startContent={!saving && <DynamicIcon name="save" size={16} />}
							>
								{saving ? 'Збереження...' : 'Зберегти налаштування'}
							</Button>
						</div>
					</div>
				</CardBody>
			</Card>
		</div>
	);
};

export default DilovodSettingsManager;