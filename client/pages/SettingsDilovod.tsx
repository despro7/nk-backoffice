import React, { useState } from 'react';
import { buildDilovodPayload } from '../../shared/utils/dilovodPayloadBuilder';
import { Card, CardBody, CardHeader, Input, Button, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import DilovodSettingsManager from '../components/DilovodSettingsManager';
import { useDilovodSettings } from '../hooks/useDilovodSettings';

const SettingsDilovod: React.FC = () => {
	const { settings } = useDilovodSettings();
	
	// State для тесту отримання замовлення з Dilovod
	const [dilovodTestParams, setDilovodTestParams] = useState({
		orderNumber: '9386'
	});
	const [dilovodTestLoading, setDilovodTestLoading] = useState(false);
	const [dilovodTestResult, setDilovodTestResult] = useState<string>('');
	const [dilovodTestRequest, setDilovodTestRequest] = useState<string>('');
	const [selectedDocumentType, setSelectedDocumentType] = useState(new Set(['documents.saleOrder']));
	// Кеш для saleOrder.id
	const [cachedSaleOrderId, setCachedSaleOrderId] = useState<string | null>(null);
	const [cachedOrderNumber, setCachedOrderNumber] = useState<string>('');

	// Мапінг типів документів
	const documentTypesMap = {
		'documents.saleOrder': 'Замовлення',
		'documents.sale': 'Відвантаження',
		'documents.cashIn': 'Оплата'
	};

	const documentDescriptionsMap = {
		'documents.saleOrder': 'Пошук замовлень на продаж',
		'documents.sale': 'Пошук документів відвантаження',
		'documents.cashIn': 'Пошук документів оплати'
	};

	const selectedDocumentTypeValue = Array.from(selectedDocumentType)[0] as string;

	// Функція для тестування Dilovod API
	const testDilovodAPI = async (documentType: string = 'documents.saleOrder') => {
		if (!dilovodTestParams.orderNumber.trim()) {
			alert('Будь ласка, введіть номер замовлення');
			return;
		}

		setDilovodTestLoading(true);
		setDilovodTestResult('');

		const orderNumber = dilovodTestParams.orderNumber.trim();

		// Формуємо payload через утиліту
		const dilovodPayload = buildDilovodPayload({
			orderNumber,
			documentType: documentType as any,
			baseDoc: (documentType === 'documents.sale' || documentType === 'documents.cashIn') && cachedSaleOrderId && cachedOrderNumber === orderNumber ? cachedSaleOrderId : undefined
		});
		setDilovodTestRequest(JSON.stringify(dilovodPayload, null, 2));

		try {
			if (documentType === 'documents.saleOrder') {
				const requestPayload = {
					orderNumber,
					documentType
				};
				const response = await fetch('/api/dilovod/orders/test', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					credentials: 'include',
					body: JSON.stringify(requestPayload),
				});
				const data = await response.json();
				// Кешуємо saleOrderId, якщо знайдено
				let foundId = null;
				if (data?.data?.[0]?.id) foundId = data.data[0].id;
				else if (data?.header?.id) foundId = data.header.id;
				setCachedSaleOrderId(foundId || null);
				setCachedOrderNumber(orderNumber);
				setDilovodTestResult(JSON.stringify(data, null, 2));
				if (!response.ok) {
					console.error('API Error:', data);
				}
			} else {
				// Для sale/cashIn — використовуємо кеш, якщо є
				let saleOrderId = null;
				if (cachedSaleOrderId && cachedOrderNumber === orderNumber) {
					saleOrderId = cachedSaleOrderId;
				} else {
					// Робимо запит до saleOrder, щоб отримати id
					const saleOrderPayload = {
						orderNumber,
						documentType: 'documents.saleOrder'
					};
					const saleOrderResp = await fetch('/api/dilovod/orders/test', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						credentials: 'include',
						body: JSON.stringify(saleOrderPayload),
					});
					const saleOrderData = await saleOrderResp.json();
					if (saleOrderData?.data?.[0]?.id) saleOrderId = saleOrderData.data[0].id;
					else if (saleOrderData?.header?.id) saleOrderId = saleOrderData.header.id;
					setCachedSaleOrderId(saleOrderId || null);
					setCachedOrderNumber(orderNumber);
				}
				if (!saleOrderId) {
					setDilovodTestResult(JSON.stringify({
						success: false,
						error: 'saleOrderId not found',
						message: 'Замовлення не знайдено'
					}, null, 2));
					setDilovodTestRequest('');
					setDilovodTestLoading(false);
					return;
				}
				// Тепер робимо запит до sale/cashIn по baseDoc
				const requestPayload = {
					orderNumber,
					documentType,
					baseDoc: saleOrderId
				};
				const response = await fetch('/api/dilovod/orders/test', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					credentials: 'include',
					body: JSON.stringify(requestPayload),
				});
				const data = await response.json();
				if (data.dilovodPayload) {
					setDilovodTestRequest(JSON.stringify(data.dilovodPayload, null, 2));
				}
				setDilovodTestResult(JSON.stringify(data, null, 2));
				if (!response.ok) {
					console.error('API Error:', data);
				}
			}
		} catch (error) {
			console.error('Network Error:', error);
			setDilovodTestResult(JSON.stringify({
				success: false,
				error: 'Network error',
				message: error instanceof Error ? error.message : 'Невідома помилка'
			}, null, 2));
		} finally {
			setDilovodTestLoading(false);
		}
	};

	// Функція для очищення параметрів тесту
	const resetDilovodTestParams = () => {
		setDilovodTestParams({ orderNumber: '' });
		setDilovodTestResult('');
		setDilovodTestRequest('');
		setCachedSaleOrderId(null);
		setCachedOrderNumber('');
	};

	return (
		<div className="space-y-12">

			{/* Dilovod Settings Manager */}
			<DilovodSettingsManager />

			<div className="grid grid-cols-1 gap-6">
				{/* Order Search Test */}
				<Card>
					<CardHeader className="border-b border-gray-200">
						<DynamicIcon name="search" size={20} className="text-gray-600 mr-2" />
						<h2 className="text-lg font-semibold text-gray-900">Тест отримання замовлення з Dilovod</h2>
					</CardHeader>
					<CardBody className="p-6">
						<div className="space-y-6 mt-4">
							<div className="flex gap-4">
								<Input
									aria-label="Номер документа"
									placeholder="Введіть номер документа"
									value={dilovodTestParams.orderNumber}
									onChange={(e) => {
										setDilovodTestParams(prev => ({
											...prev,
											orderNumber: e.target.value
										}));
										// Скидаємо кеш, якщо номер змінився
										if (e.target.value !== cachedOrderNumber) {
											setCachedSaleOrderId(null);
											setCachedOrderNumber('');
										}
									}}
									size="lg"
									className="max-w-sm"
									description="Номер замовлення в системі Dilovod"
									startContent={<DynamicIcon name="hash" size={16} className="text-gray-400" />}
								/>

								{/* Action Buttons */}
								<div className="flex gap-4">
									<ButtonGroup size="lg" className="h-fit gap-[1px]">
										<Button
											color="primary"
											onPress={() => testDilovodAPI('documents.saleOrder')}
											isLoading={dilovodTestLoading}
											startContent={!dilovodTestLoading && <DynamicIcon name="search" size={16} />}
										>
											{dilovodTestLoading ? 'Пошук...' : 'Замовлення'}
										</Button>
										<Button
											color="primary"
											onPress={() => testDilovodAPI('documents.sale')}
											isLoading={dilovodTestLoading}
											startContent={!dilovodTestLoading && <DynamicIcon name="package" size={16} />}
										>
											{dilovodTestLoading ? 'Пошук...' : 'Відвантаження'}
										</Button>
										<Button
											color="primary"
											onPress={() => testDilovodAPI('documents.cashIn')}
											isLoading={dilovodTestLoading}
											startContent={!dilovodTestLoading && <DynamicIcon name="credit-card" size={16} />}
										>
											{dilovodTestLoading ? 'Пошук...' : 'Оплата'}
										</Button>
									</ButtonGroup>

									<Button
										color="secondary"
										size="lg"
										variant="bordered"
										onPress={resetDilovodTestParams}
										startContent={<DynamicIcon name="rotate-ccw" size={16} />}
										className="gap-1.5 px-5"
									>
										Очистити
									</Button>
								</div>
							</div>

							{/* Response */}
							{dilovodTestResult && (
								<div className="grid md:grid-cols-2 gap-8">
									<div className="space-y-4">
										<h3 className="flex items-center gap-2 text-sm font-medium text-gray-900">
											Запит до API Dilovod:
										</h3>

										<div className="bg-gray-100 border border-gray-300 rounded-lg p-4 font-mono text-sm overflow-hidden">
											<div className="max-h-120 overflow-y-auto">
												<pre className="whitespace-pre-wrap break-all">
													{dilovodTestRequest}
												</pre>
											</div>
										</div>

										<Button
											size="sm"
											variant="bordered"
											onPress={() => navigator.clipboard.writeText(dilovodTestRequest)}
											startContent={<DynamicIcon name="copy" size={14} />}
										>
											Скопіювати JSON
										</Button>
									</div>

									<div className="space-y-4">
										<h3 className="flex items-center gap-2 text-sm font-medium text-gray-900">
											Відповідь API:
										</h3>

										<div className="bg-gray-100 border border-gray-300 rounded-lg p-4 font-mono text-sm overflow-hidden">
											<div className="max-h-120 overflow-y-auto">
												<pre className="whitespace-pre-wrap break-all">
													{dilovodTestResult}
												</pre>
											</div>
										</div>

										<Button
											size="sm"
											variant="bordered"
											onPress={() => navigator.clipboard.writeText(dilovodTestResult)}
											startContent={<DynamicIcon name="copy" size={14} />}
										>
											Скопіювати JSON
										</Button>
									</div>

								</div>
							)}
						</div>
					</CardBody>
				</Card>

				{/* Connection Test */}
				<Card>
					<CardHeader className="border-b border-gray-200">
						<DynamicIcon name="wifi" size={20} className="text-gray-600 mr-2" />
						<h2 className="text-lg font-semibold text-gray-900">Тест підключення до Dilovod API</h2>
					</CardHeader>
					<CardBody className="p-6">
						<p className="text-sm text-gray-600 mb-4">
							Перевірте підключення до API Dilovod перед використанням інших функцій
						</p>
						<Button
							color="primary"
							size="lg"
							startContent={<DynamicIcon name="wifi" size={16} />}
							onPress={async () => {
								try {
									const response = await fetch('/api/dilovod/test-connection', {
										method: 'GET',
										credentials: 'include',
									});
									const data = await response.json();
									alert(data.success ? 'Підключення успішне!' : `Помилка: ${data.message}`);
								} catch (error) {
									alert('Помилка мережі');
								}
							}}
						>
							Перевірити підключення
						</Button>
					</CardBody>
				</Card>
			</div>

			{/* Future Dilovod Features */}
			<div className="flex flex-col">
				<div className="flex items-center mb-4">
					<DynamicIcon name="settings" size={20} className="text-gray-600 mr-2" />
					<h2 className="text-xl font-semibold text-gray-900">Додаткові функції Dilovod</h2>
				</div>

				<Card>
					<CardBody className="p-6">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="flex items-center gap-3 p-4 border border-dashed border-gray-300 rounded-lg">
								<DynamicIcon name="upload" size={24} className="text-gray-400" />
								<div>
									<h3 className="font-medium text-gray-900">Відправка замовлень</h3>
									<p className="text-sm text-gray-600">Передача замовлень до Dilovod</p>
								</div>
							</div>
							
							<div className="flex items-center gap-3 p-4 border border-dashed border-gray-300 rounded-lg">
								<DynamicIcon name="refresh-cw" size={24} className="text-gray-400" />
								<div>
									<h3 className="font-medium text-gray-900">Синхронізація даних</h3>
									<p className="text-sm text-gray-600">Двостороння синхронізація</p>
								</div>
							</div>
							
							<div className="flex items-center gap-3 p-4 border border-dashed border-gray-300 rounded-lg">
								<DynamicIcon name="file-text" size={24} className="text-gray-400" />
								<div>
									<h3 className="font-medium text-gray-900">Документи</h3>
									<p className="text-sm text-gray-600">Робота з документами Dilovod</p>
								</div>
							</div>
							
							<div className="flex items-center gap-3 p-4 border border-dashed border-gray-300 rounded-lg">
								<DynamicIcon name="bar-chart-3" size={24} className="text-gray-400" />
								<div>
									<h3 className="font-medium text-gray-900">Аналітика</h3>
									<p className="text-sm text-gray-600">Звіти та статистика</p>
								</div>
							</div>
						</div>
						
						<div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
							<div className="flex items-start gap-2">
								<DynamicIcon name="info" size={16} className="text-blue-600 mt-0.5" />
								<div className="text-sm text-blue-800">
									<strong>Інформація:</strong> Ці функції будуть доступні в майбутніх версіях. 
									Зараз доступний тільки пошук замовлень для тестування підключення.
								</div>
							</div>
						</div>
					</CardBody>
				</Card>
			</div>
		</div>
	);
};

export default SettingsDilovod;