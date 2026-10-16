import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerBody,
	DrawerFooter,
	Button,
	Chip,
	Table,
	TableHeader,
	TableColumn,
	TableBody,
	TableRow,
	TableCell,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate, formatRelativeDate } from "../lib/formatUtils";
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { useApi } from '@/hooks/useApi';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';
import { parseDilovodErrorText, dedupeAndNormalize } from '@/lib/metaLogsParser';
import { useProductMovementsDrawer } from '@/features/product-movements/context/ProductMovementsDrawerContext';
import { StockBadge } from '@/components/StockBadge';
import MetaLogJsonView from './MetaLogJsonView';
import BulkExportResultsTable from './BulkExportResultsTable';

type ErrorQtyBySku = Record<string, { stock?: string; missing?: string }>;

type SetComponentMeta = {
	sku: string;
	name: string;
	quantity: number;
};

type ProductMeta = {
	name: string;
	isSet: boolean;
	setComponents: SetComponentMeta[];
};

type OrderedDisplayRow = {
	key: string;
	sku: string;
	displayName: string;
	quantity: number;
	isSet: boolean;
	/** Компонент розібраного (немонолітного) набору */
	isSetComponent: boolean;
	parentSetSku?: string;
};

function parseSetComponents(raw: unknown): SetComponentMeta[] {
	if (!Array.isArray(raw)) return [];
	const components: SetComponentMeta[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const sku = String((entry as { id?: unknown; sku?: unknown }).id
			?? (entry as { sku?: unknown }).sku
			?? '').trim();
		if (!sku) continue;
		components.push({
			sku,
			name: String((entry as { name?: unknown }).name ?? '').trim(),
			quantity: Number((entry as { quantity?: unknown }).quantity) || 1,
		});
	}
	return components;
}

interface ResultDrawerProps {
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	result: any;
	title?: string;
	type?: 'result' | 'logs' | 'orderDetails'; // Тип відображення
	getChannelName?: (channelId: string | null | undefined) => string;
}

/**
 * Універсальний Drawer для відображення результатів операцій з Dilovod
 * Підтримує різні типи результатів: валідація, експорт, перевірка, логи
 */
export default function ResultDrawer({ isOpen, onOpenChange, result, title = 'Результат операції', type = 'result', getChannelName }: ResultDrawerProps) {
	const { apiCall } = useApi();
	const { open: openProductMovements } = useProductMovementsDrawer();
	const { settings: dilovodSettings } = useDilovodSettings({ loadDirectories: false });
	const smallStorageId = dilovodSettings?.smallStorageId
		? String(dilovodSettings.smallStorageId)
		: undefined;

	/** Один день: відвантаження → комплектація (для рухів зі списку товарів замовлення) */
	const movementsDayPeriod = useMemo(() => {
		if (type !== 'orderDetails' || !result || Array.isArray(result)) {
			return undefined;
		}

		const toLocalYmd = (value: unknown): string | null => {
			if (!value) return null;
			const date = value instanceof Date ? value : new Date(String(value));
			if (Number.isNaN(date.getTime())) return null;
			const y = date.getFullYear();
			const m = String(date.getMonth() + 1).padStart(2, '0');
			const d = String(date.getDate()).padStart(2, '0');
			return `${y}-${m}-${d}`;
		};

		const day =
			toLocalYmd(result.dilovodSaleExportDate)
			?? toLocalYmd(result.readyToShipAt)
			?? null;

		if (!day) return undefined;
		return { startDate: day, endDate: day };
	}, [result, type]);

	// Для логів - це масив
	const isLogsMode = type === 'logs' && Array.isArray(result);
	const [selectedLogIdx, setSelectedLogIdx] = useState(0);
	const [productLookup, setProductLookup] = useState<Record<string, ProductMeta>>({});
	/** SKU → залишок МС / бракує з останнього meta-лога зі статусом error */
	const [errorQtyBySku, setErrorQtyBySku] = useState<ErrorQtyBySku>({});

	useEffect(() => {
		if (isOpen) {
			setSelectedLogIdx(0);
		}
	}, [isOpen, result]);

	const selectedLog = isLogsMode && result.length > 0
		? result[Math.min(selectedLogIdx, result.length - 1)]
		: null;

	const normalizedSkuList = useMemo(() => {
		if (type !== 'orderDetails' || !result || Array.isArray(result)) {
			return [];
		}

		const orderedSkus = Array.isArray(result.items)
			? result.items.map((item: any) => String(item?.sku ?? '').trim()).filter(Boolean)
			: [];
		const shippedSkus = result.payloadData?.shipment?.bySku && typeof result.payloadData.shipment.bySku === 'object'
			? Object.keys(result.payloadData.shipment.bySku).map((sku) => String(sku).trim()).filter(Boolean)
			: [];

		return Array.from(new Set([...orderedSkus, ...shippedSkus]));
	}, [result, type]);

	useEffect(() => {
		if (type !== 'orderDetails' || normalizedSkuList.length === 0) {
			setProductLookup({});
			return;
		}

		let isCancelled = false;

		const toProductMeta = (product: any): ProductMeta => {
			const setComponents = parseSetComponents(product?.set);
			return {
				name: product?.name || '',
				isSet: setComponents.length > 0,
				setComponents,
			};
		};

		const mergeProductsIntoLookup = (
			accumulator: Record<string, ProductMeta>,
			products: any[],
		): Record<string, ProductMeta> => {
			for (const product of products) {
				const sku = String(product?.sku ?? '').trim();
				if (!sku) continue;
				accumulator[sku] = toProductMeta(product);
			}
			return accumulator;
		};

		const loadProductLookup = async () => {
			try {
				const params = new URLSearchParams({
					skus: normalizedSkuList.join(','),
					fields: 'name,set',
				});

				const response = await apiCall(`/api/products/batch?${params.toString()}`);
				if (!response.ok) {
					return;
				}

				const data = await response.json();
				const products = Array.isArray(data?.products) ? data.products : [];
				const lookup = mergeProductsIntoLookup({}, products);

				// Довантажуємо назви компонентів розібраних наборів
				const componentSkus = Array.from(new Set(
					Object.values(lookup)
						.flatMap((meta) => meta.setComponents.map((component) => component.sku))
						.filter((sku) => !lookup[sku]),
				));

				if (componentSkus.length > 0) {
					const componentParams = new URLSearchParams({
						skus: componentSkus.join(','),
						fields: 'name,set',
					});
					const componentResponse = await apiCall(`/api/products/batch?${componentParams.toString()}`);
					if (componentResponse.ok) {
						const componentData = await componentResponse.json();
						const componentProducts = Array.isArray(componentData?.products) ? componentData.products : [];
						mergeProductsIntoLookup(lookup, componentProducts);
					}
				}

				if (!isCancelled) {
					setProductLookup(lookup);
				}
			} catch {
				if (!isCancelled) {
					setProductLookup({});
				}
			}
		};

		void loadProductLookup();

		return () => {
			isCancelled = true;
		};
	}, [apiCall, normalizedSkuList, type]);

	const getProductMeta = useCallback((sku: string): ProductMeta | null => {
		const normalizedSku = String(sku ?? '').trim();
		return normalizedSku ? (productLookup[normalizedSku] ?? null) : null;
	}, [productLookup]);

	/** Монолітні набори з payload відвантаження — не розгортаємо */
	const monolithicShippedSkuSet = useMemo(() => {
		if (type !== 'orderDetails' || !result || Array.isArray(result)) {
			return new Set<string>();
		}
		const bySku = result.payloadData?.shipment?.bySku;
		if (!bySku || typeof bySku !== 'object') {
			return new Set<string>();
		}
		return new Set(
			Object.keys(bySku).map((sku) => String(sku).trim()).filter(Boolean),
		);
	}, [result, type]);

	/** Рядки таблиці: монолітні набори як є; інші набори — батько + дочірні компоненти */
	const orderedDisplayRows = useMemo((): OrderedDisplayRow[] => {
		if (type !== 'orderDetails' || !result || Array.isArray(result) || !Array.isArray(result.items)) {
			return [];
		}

		const rows: OrderedDisplayRow[] = [];

		result.items.forEach((item: any, idx: number) => {
			const skuKey = String(item?.sku ?? '').trim();
			const productMeta = skuKey ? productLookup[skuKey] : undefined;
			const displayName = productMeta?.name || item?.productName || item?.name || 'Невідомий товар';
			const quantity = Number(item?.quantity) || 0;
			const canExpandSet = Boolean(
				productMeta?.isSet
				&& productMeta.setComponents.length > 0
				&& skuKey
				&& !monolithicShippedSkuSet.has(skuKey),
			);

			if (!canExpandSet) {
				rows.push({
					key: `${skuKey || 'item'}-${idx}`,
					sku: skuKey,
					displayName,
					quantity,
					isSet: Boolean(productMeta?.isSet),
					isSetComponent: false,
				});
				return;
			}

			rows.push({
				key: `set-${skuKey}-${idx}`,
				sku: skuKey,
				displayName,
				quantity,
				isSet: true,
				isSetComponent: false,
			});

			for (const component of productMeta!.setComponents) {
				const componentMeta = productLookup[component.sku];
				const componentName = componentMeta?.name || component.name || 'Невідомий товар';
				rows.push({
					key: `set-${skuKey}-${idx}-comp-${component.sku}`,
					sku: component.sku,
					displayName: componentName,
					quantity: quantity * component.quantity,
					isSet: Boolean(componentMeta?.isSet),
					isSetComponent: true,
					parentSetSku: skuKey,
				});
			}
		});

		return rows;
	}, [monolithicShippedSkuSet, productLookup, result, type]);

	// Останній meta-лог зі статусом error → map SKU → залишок МС / бракує
	useEffect(() => {
		if (type !== 'orderDetails' || !result || Array.isArray(result) || !result.orderNumber) {
			setErrorQtyBySku({});
			return;
		}

		let isCancelled = false;

		const loadErrorQtyFromLatestErrorLog = async () => {
			try {
				const res = await apiCall(`/api/meta-logs?orderNumber=${encodeURIComponent(String(result.orderNumber))}`);
				if (!res.ok) {
					if (!isCancelled) setErrorQtyBySku({});
					return;
				}

				const logs = await res.json();
				if (!Array.isArray(logs) || logs.length === 0) {
					if (!isCancelled) setErrorQtyBySku({});
					return;
				}

				// API повертає orderBy datetime desc — перший = останній
				const latestLog = logs[0];
				if (!latestLog || latestLog.status !== 'error') {
					if (!isCancelled) setErrorQtyBySku({});
					return;
				}

				const errorText = String(
					latestLog.data?.error
					?? latestLog.data?.exportResult?.error
					?? latestLog.message
					?? ''
				);
				if (!errorText) {
					if (!isCancelled) setErrorQtyBySku({});
					return;
				}

				const parsed = dedupeAndNormalize(parseDilovodErrorText(errorText));
				const map: ErrorQtyBySku = {};
				for (let i = 0; i < parsed.skus.length; i++) {
					const sku = String(parsed.skus[i] ?? '').trim();
					if (!sku || sku === '—') continue;

					const stock = String(parsed.stock[i] ?? '').trim();
					const missing = String(parsed.missing[i] ?? '').trim();
					const entry: { stock?: string; missing?: string } = {};
					if (stock && stock !== '—') entry.stock = stock;
					if (missing && missing !== '—') entry.missing = missing;
					if (entry.stock || entry.missing) {
						map[sku] = entry;
					}
				}

				if (!isCancelled) {
					setErrorQtyBySku(map);
				}
			} catch {
				if (!isCancelled) {
					setErrorQtyBySku({});
				}
			}
		};

		void loadErrorQtyFromLatestErrorLog();

		return () => {
			isCancelled = true;
		};
	}, [apiCall, result, type]);

	// Визначення стилів для інформаційних блоків
	const infoBox = "flex flex-col gap-1 min-h-[90px] justify-between border-1 rounded-md p-3";
	const infoBoxLabel = "text-gray-400 text-xs";
	const infoBoxText = "text-sm font-medium leading-tight";

	if (!result) {
		return null;
	}

	// Визначаємо тип результату (result гарантовано не null нижче)
	const isValidationError = result.type === 'critical_validation_error';
	const hasData = result.data && Array.isArray(result.data) && result.data.length > 0;
	const hasErrors = result.errors && Array.isArray(result.errors) && result.errors.length > 0;

	return (
		<Drawer
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			size="3xl"
			placement="right"
		>
			<DrawerContent>
				{(onClose) => (
					<>
						<DrawerHeader className="flex flex-col gap-1">
							{title}
						</DrawerHeader>
						<DrawerBody className="overflow-y-auto">
							<div className="space-y-4">
								{/* Режим відображення логів */}
								{isLogsMode ? (
									!selectedLog ? (
										<div className="flex flex-col items-center justify-center gap-2 py-12 text-default-500">
											<DynamicIcon name="file-text" size={32} className="opacity-40" />
											<p className="text-sm">Логи для цього документа відсутні</p>
										</div>
									) : (
									<>
										{/* Селектор логів (якщо більше одного) */}
										{result.length > 1 && (
											<div className="flex gap-2 overflow-x-auto pb-2">
												{result.map((log: any, idx: number) => (
													<Button
														key={log.id || idx}
														size="sm"
														variant={selectedLogIdx === idx ? "solid" : "flat"}
														color={selectedLogIdx === idx ? "primary" : "default"}
														className="rounded-sm px-2 py-1 min-w-fit"
														onPress={() => setSelectedLogIdx(idx)}
													>
														{log.datetime ? formatRelativeDate(log.datetime) : `Лог #${idx + 1}`}
													</Button>
												))}
											</div>
										)}

										{/* Заголовок лога зі статусом */}
										<div className={`p-4 rounded-lg border-1 ${selectedLog.status === 'success' ? 'bg-green-200 border-green-300' : 'bg-red-200 border-red-300'}`}>
											<div className="flex items-center gap-3">
												<DynamicIcon
													name={selectedLog.status === 'success' ? "check-circle" : "x-circle"}
													size={24} className={`shrink-0 ${selectedLog.status === 'success' ? 'text-green-600' : 'text-red-600'}`}
												/>
												<div className={`flex-1 ${selectedLog.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
													<h3 className="font-semibold text-lg">{selectedLog.title || 'No title provided'}</h3>
													<div className="text-sm">{selectedLog.message || 'No message provided'}</div>
												</div>
											</div>
										</div>

										<div className="flex items-center gap-6 text-gray-400 pl-3.5 -mt-2">
											<div className="flex items-center gap-1">
												{selectedLog.datetime && (
													<>
													<DynamicIcon name="clock-9" size={13} className={`shrink-0`} />
													<div className="text-[13px]">
														{new Date(selectedLog.datetime).toLocaleString('uk-UA')}
													</div>
													</>
												)}
											</div>
											<div className="flex items-center gap-1">
												{(selectedLog.initiatedBy?.raw || selectedLog.initiatedBy?.name) && (
													<>
													<DynamicIcon name="user-round" size={13} className={`shrink-0`} />
													<div className="text-[13px]">
														{selectedLog.initiatedBy.name
															? `${selectedLog.initiatedBy.name} (${selectedLog.initiatedBy.email})`
															: selectedLog.initiatedBy.raw}
													</div>
													</>
												)}
											</div>
										</div>

										{/* Блок приміток */}
										{selectedLog.data?.warnings && selectedLog.data.warnings.length > 0 && (
											<div>
												<h4 className="font-semibold text-sm mb-3">Примітки:</h4>
												<div className="space-y-2 max-h-48 overflow-y-auto">
													{selectedLog.data.warnings.map((warning: string, idx: number) => (
														<div key={idx} className="p-3 bg-amber-100 rounded-lg border-1 border-amber-600/20">
															<div className="flex items-start gap-2">
																<DynamicIcon name="info" size={16} className="text-amber-800/50 shrink-0 mt-0.5" />
																<div className="text-sm text-amber-800/70">{warning}</div>
															</div>
														</div>
													))}
												</div>
											</div>
										)}

										{/* Деталі лога */}
										<div>
											<h4 className="font-semibold text-sm mb-3">Деталі:</h4>
											<MetaLogJsonView value={selectedLog} className="max-h-[60vh]" />
										</div>
									</>
									)
								) : (
									<>
										{type === 'orderDetails' ? (
											<>
												{/* Загальна інформація по замовленню */}
												<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
													{result.orderDate && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Дата замовлення:</span>
															<span className={infoBoxText}>{formatDate(result.orderDate)}</span>
														</div>
													)}
													{result.readyToShipAt && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Дата комплектації:</span>
															<span className={infoBoxText}>{formatDate(result.readyToShipAt)}</span>
														</div>
													)}
													{result.customerName && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Клієнт:</span>
															<span className={infoBoxText}>{result.customerName}</span>
														</div>
													)}
													{result.paymentMethod && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Сума і спосіб оплати:</span>
															<div className="flex gap-1">
																<span className={infoBoxText}>{result.totalPrice} грн.</span>
																<span className={`${infoBoxText} font-thin`}> – {result.paymentMethod}</span>
															</div>
														</div>
													)}
													{result.rawData.ord_delivery_data?.[0]?.trackingNumber && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Номер ТТН:</span>
															<div className="flex items-center gap-1">{formatTrackingNumberWithIcon(result.rawData.ord_delivery_data[0].trackingNumber)}</div>
														</div>
													)}
													{result.sajt && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Канал продажів:</span>
															<span className={infoBoxText}>{getChannelName ? getChannelName(result.sajt) : result.sajt}</span>
														</div>
													)}
													{result.totalPrice && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Всього товарів:</span> 
															<span className={infoBoxText}>{result.quantity} порцій</span>
														</div>
													)}
												</div>
												<div className="mb-8">
													<span className="text-sm font-semibold">Замовлені товари:</span>
													{result.items && result.items.length > 0 ? (
														<Table
															aria-label="Замовлені товари"
															removeWrapper
															className="mt-2 min-w-[420px]"
															classNames={{
																th: 'first:rounded-s-md last:rounded-e-md bg-default-100 text-xs text-default-500 h-8 px-2',
																td: 'py-1.5 px-2',
																tr: 'hover:bg-default-100/60',
															}}
														>
															<TableHeader>
																<TableColumn className="flex items-center gap-1">
																	Товар
																	<span className="ml-4 font-normal text-slate-400 flex items-center gap-1"><DynamicIcon name="arrow-left-right" size={14} className="bg-slate-200 rounded p-0.5" /> – переглянути рухи товару</span>
																</TableColumn>
																<TableColumn align="end" width={72}>Кіл-ть</TableColumn>
																<TableColumn align="end" width={120}>
																	<span className="inline-flex items-center justify-end gap-1">
																		Залишок <StockBadge variant="ms" size="9px" />
																	</span>
																</TableColumn>
																<TableColumn align="end" width={100}>Бракує</TableColumn>
															</TableHeader>
															<TableBody>
																{orderedDisplayRows.map((row) => {
																	const skuKey = row.sku;
																	const errorQty = skuKey ? errorQtyBySku[skuKey] : undefined;
																	const stock = errorQty?.stock;
																	const shortage = errorQty?.missing;
																	const hasStock = Boolean(stock);
																	const hasShortage = Boolean(shortage);
																	// У розібраного набору залишок/брак — лише на дочірніх рядках
																	const isExpandedSetParent = row.isSet
																		&& !row.isSetComponent
																		&& !monolithicShippedSkuSet.has(skuKey);
																	const showStockShortage = !isExpandedSetParent;

																	return (
																		<TableRow key={row.key}>
																			<TableCell>
																				<div className={`flex items-center gap-1.5 max-w-md ${row.isSetComponent ? 'pl-5 border-l-2 border-default-200 ml-1' : ''}`}>
																					<span className={`text-tiny px-1 py-0.5 rounded tabular-nums ${row.isSetComponent ? 'bg-default-200/80' : 'bg-amber-200/60'}`}>
																						{row.sku}
																					</span>
																					<span className={`truncate ${row.isSet && !row.isSetComponent ? 'font-semibold' : ''}`}>
																						{row.displayName}
																					</span>
																					{row.isSet && !row.isSetComponent && (
																						<Chip
																							size="sm"
																							variant="flat"
																							className={`h-5 ${monolithicShippedSkuSet.has(skuKey) ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-800'}`}
																						>
																							{monolithicShippedSkuSet.has(skuKey) ? 'набір' : 'розібраний'}
																						</Chip>
																					)}
																					{skuKey ? (
																						<Button
																							size="sm"
																							variant="flat"
																							className="min-w-0 h-6 px-0.5 text-xs shrink-0"
																							startContent={<DynamicIcon name="arrow-left-right" size={14} />}
																							isIconOnly
																							onPress={() => openProductMovements({
																								sku: skuKey,
																								productName: row.displayName,
																								storageId: smallStorageId,
																								...(movementsDayPeriod ? { period: movementsDayPeriod } : {}),
																								autoGenerate: true,
																								placement: 'left',
																								nonDismissable: true,
																							})}
																						>
																						</Button>
																					) : null}
																				</div>
																			</TableCell>
																			<TableCell className="text-right tabular-nums whitespace-nowrap">
																				{row.quantity ?? '—'}
																			</TableCell>
																			<TableCell className={`text-right tabular-nums whitespace-nowrap ${showStockShortage && hasStock ? 'font-medium' : 'text-default-400'}`}>
																				{showStockShortage && hasStock ? stock : '—'}
																			</TableCell>
																			<TableCell className={`text-right tabular-nums whitespace-nowrap ${showStockShortage && hasShortage ? 'text-danger font-medium' : 'text-default-400'}`}>
																				{showStockShortage && hasShortage ? shortage : '—'}
																			</TableCell>
																		</TableRow>
																	);
																})}
															</TableBody>
														</Table>
													) : (
														<div className="text-sm text-gray-500 mt-2">Немає замовлених товарів</div>
													)}
												</div>
												{(() => {
													const shipmentBySku = result.payloadData?.shipment?.bySku;
													if (!shipmentBySku || typeof shipmentBySku !== 'object') {
														return null;
													}

													const orderedItems = Array.isArray(result.items) ? result.items : [];
													const shippedItems = Object.entries(shipmentBySku)
														.map(([sku, shipmentItem]: [string, any]) => {
															const quantity = Number(shipmentItem?.quantity) || 0;
															if (quantity <= 0) {
																return null;
															}

															const sourceItem = orderedItems.find((item: any) => item?.sku === sku);
															return {
																sku,
																productName: sourceItem?.productName || sourceItem?.name || 'Невідомий товар',
																quantity,
																accGood: shipmentItem?.accGood ? String(shipmentItem.accGood) : null,
															};
														})
														.filter(Boolean) as Array<{ sku: string; productName: string; quantity: number; accGood: string | null }>;

													if (shippedItems.length === 0) {
														return null;
													}

													return (
														<div className="p-3.5 pt-2 rounded-lg border overflow-auto mb-10">
															<span className={infoBoxLabel}>Відвантажені набори:</span>
															<div className="mt-2 space-y-1">
																{shippedItems.map((item) => (
																	(() => {
																		const productMeta = getProductMeta(item.sku);
																		const displayName = productMeta?.name || item.productName;
																		return (
																	<div key={`${item.sku}-${item.accGood || 'default'}`} className="text-sm flex flex-wrap items-center gap-2">
																		<span className="text-tiny bg-lime-200 px-1 py-0.5 rounded tabular-nums">{item.sku}</span>
																			<span>{displayName}</span>
																		<span className="text-gray-500">- {item.quantity} шт.</span>
																	</div>
																	);
																	})()
																))}
															</div>
														</div>
													);
												})()}
											</>
										) : (
											<>
												{/* Інформативний блок: якщо немає оновлень, показуємо в жовтих кольорах */}
												{result.message && result.message.includes('жодних нових даних не було оновлено') ? (
													<div className="p-4 rounded-lg border-1 bg-yellow-100 border-yellow-300">
														<div className="flex items-center gap-3">
															<DynamicIcon name="alert-circle" size={20} className="shrink-0 text-yellow-600" />
															<div className="flex-1">
																<div className="font-semibold text-yellow-700">
																	{result.message}
																</div>
															</div>
														</div>
													</div>
												) : (
													<>
														{!result.bulkExportResults && (
															<div className={`p-4 rounded-lg border-1 ${result.success ? 'bg-green-200 border-green-300' : 'bg-red-200 border-red-300'}`}>
																<div className="flex items-center gap-3">
																	<DynamicIcon
																		name={result.success ? "check-circle" : "x-circle"} size={20}
																		className={`shrink-0 ${result.success ? 'text-green-600' : 'text-red-600'}`}
																	/>
																	<div className="flex-1">
																		<div className={`font-semibold ${result.success ? 'text-green-600' : 'text-red-600'}`}>
																			{result.message || (result.success ? 'Успішно' : 'Помилка')}
																		</div>
																		{result.error && !result.success && (
																			<div className={`text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
																				{result.error}
																			</div>
																		)}
																	</div>
																</div>
															</div>
														)}
													</>
												)}
											</>
										)}

										{/* Критичні помилки валідації */}
										{isValidationError && result.details && (
											<div>
												<h4 className="font-semibold text-sm mb-3 text-danger">Критичні помилки конфігурації:</h4>
												<div className="space-y-2 max-h-64 overflow-y-auto">
													{result.details.split('\n').slice(1).map((error: string, idx: number) => (
														error.trim() && (
															<div key={idx} className="p-3 bg-red-50 rounded-lg border-1 border-red-200">
																<div className="text-sm text-red-800">
																	{error.replace(/^\d+\.\s*/, '')}
																</div>
															</div>
														)
													))}
												</div>
												{result.action_required && (
													<div className="mt-3 p-3 bg-yellow-50 rounded-lg border-1 border-yellow-200">
														<div className="flex items-start gap-2">
															<DynamicIcon name="alert-triangle" size={16} className="text-yellow-600 shrink-0 mt-0.5" />
															<div className="text-sm text-yellow-800">
																<strong>Необхідна дія:</strong> {result.action_required}
															</div>
														</div>
													</div>
												)}
											</div>
										)}

										{/* Попередження (warnings) */}
										{result.data?.warnings && Array.isArray(result.data.warnings) && result.data.warnings.length > 0 && (
											<div>
												<h4 className="font-semibold text-sm mb-3 text-warning">Попередження:</h4>
												<div className="space-y-2 max-h-48 overflow-y-auto">
													{result.data.warnings.map((warning: string, idx: number) => (
														<div key={idx} className="p-3 bg-yellow-50 rounded-lg border-1 border-yellow-200">
															<div className="flex items-start gap-2">
																<DynamicIcon name="alert-circle" size={16} className="text-yellow-600 shrink-0 mt-0.5" />
																<div className="text-sm text-yellow-800">{warning}</div>
															</div>
														</div>
													))}
												</div>
											</div>
										)}


										{/* Масовий експорт + відвантаження: bulkExportResults */}
										{Array.isArray(result.bulkExportResults) && (
											<BulkExportResultsTable items={result.bulkExportResults} />
										)}

										{/* Таблиця результатів (для масових операцій) */}
										{hasData && (() => {
											// Видаляємо дублікати замовлень за orderNumber
											const uniqueOrders = Array.from(
												new Map(result.data.map((item: any) => [item.orderNumber, item])).values()
											);
											return (
											<div>
												<h4 className="font-semibold text-sm mb-3">Оброблені замовлення:</h4>
												<div className="grid md:grid-cols-2 flex-wrap gap-3 max-h-[calc(100vh-500px)] overflow-y-auto">
													{uniqueOrders.map((item: any, idx: number) => (
														<div key={idx} className={`p-3 rounded-lg border-1 ${(item.updatedCount > 0 || item.updatedCountSale > 0 || item.updatedCountCashIn > 0) ? 'bg-green-50 border-green-600/30' : 'bg-gray-50 border-gray-200'}`}>
															<div className="flex items-start justify-between gap-2">
																<div className="flex-1">
																	<div className="font-medium text-sm">
																		№ {item.orderNumber}
																	</div>
																	{item.dilovodId && (
																		<div className="text-xs text-gray-600 my-1">
																			Dilovod ID: <span className="font-mono">{item.dilovodId}</span>
																		</div>
																	)}
																	{item.dilovodExportDate && (
																		<div className={`text-xs ${item.updatedCount > 0 ? 'text-green-600' : 'text-gray-600'}`}>
																			<b>✓ Експортовано:</b> {new Date(item.dilovodExportDate).toLocaleString('uk-UA')}
																		</div>
																	)}
																	{item.dilovodSaleExportDate && (
																		<div className={`text-xs ${item.updatedCountSale > 0 ? 'text-green-600' : 'text-gray-600'}`}>
																			<b>✓ Відвантажено:</b> {new Date(item.dilovodSaleExportDate).toLocaleString('uk-UA')}
																		</div>
																	)}
																	{item.dilovodReturnDate && (
																		<div className={`text-xs ${item.updatedCountReturn > 0 ? 'text-orange-600' : 'text-gray-600'}`}>
																			<b>✓ Повернення:</b> {new Date(item.dilovodReturnDate).toLocaleString('uk-UA')}
																		</div>
																	)}
																	{item.dilovodCashInDate && (
																		<div className={`text-xs ${item.updatedCountCashIn > 0 ? 'text-green-600' : 'text-gray-600'}`}>
																			<b>✓ Оплачено:</b> {new Date(item.dilovodCashInDate).toLocaleString('uk-UA')}
																		</div>
																	)}
																</div>
																{item.success === false && item.error && (
																	<Chip size="sm" color="danger" variant="flat">
																		Помилка
																	</Chip>
																)}
																{item.success !== false && item.updatedCount > 0 ? (
																	<Chip size="sm" color="success" variant="flat" classNames={{ content: 'text-green-800' }}>
																		new
																	</Chip>
																) : null}
															</div>
														</div>
													))}
												</div>
											</div>
										);
										})()}

										{/* Помилки окремих операцій */}
										{hasErrors && (
											<div>
												<h4 className="font-semibold text-sm mb-3 text-danger">Помилки:</h4>
												<div className="space-y-2 max-h-32 overflow-y-auto">
													{result.errors.map((error: any, idx: number) => (
														<div key={idx} className="p-3 bg-red-50 rounded-lg border-1 border-red-200">
															<div className="font-medium text-sm text-red-800">
																№ {error.orderNumber}
															</div>
															<div className="text-xs text-red-600 mt-1">
																{error.error}
															</div>
														</div>
													))}
												</div>
											</div>
										)}

										{/* Метадані */}
										{result.metadata && (
											<div>
												<h4 className="font-semibold text-sm mb-3">Метадані:</h4>
												<div className="bg-gray-50 p-3 rounded-lg border-1 border-gray-200">
													<div className="grid grid-cols-2 gap-2 text-sm">
														{result.metadata.orderNumber && (
															<div>
																<span className="text-gray-500">Номер замовлення:</span>{' '}
																<span className="font-medium">{result.metadata.orderNumber}</span>
															</div>
														)}
														{result.metadata.totalItems !== undefined && (
															<div>
																<span className="text-gray-500">Товарів:</span>{' '}
																<span className="font-medium">{result.metadata.totalItems}</span>
															</div>
														)}
														{result.metadata.warningsCount !== undefined && (
															<div>
																<span className="text-gray-500">Попереджень:</span>{' '}
																<span className="font-medium">{result.metadata.warningsCount}</span>
															</div>
														)}
													</div>
												</div>
											</div>
										)}

										{/* Raw JSON (згорнутий за замовчуванням) */}
										<details className="group">
											<summary className="cursor-pointer font-semibold text-sm mb-3 list-none items-center gap-2 inline-flex">
												<DynamicIcon name="chevron-right" size={16} className="group-open:rotate-90 transition-transform" />
												Raw JSON
											</summary>
											<div className="bg-neutral-100 p-3 rounded-lg border-1 border-gray-200 overflow-auto">
												<MetaLogJsonView value={result} className="max-h-[50vh]" collapsed={3} />
											</div>
										</details>
									</>
								)}
							</div>
						</DrawerBody>
						<DrawerFooter>
							<Button color="primary" variant="bordered" onPress={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); }}>
								Скопіювати JSON
							</Button>
							<Button color="primary" onPress={onClose}>Закрити</Button>
						</DrawerFooter>
					</>
				)}
			</DrawerContent>
		</Drawer>
	);
}
