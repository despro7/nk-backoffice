import React, { useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Button,
  Chip
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate, formatRelativeDate } from "../lib/formatUtils";

interface ResultDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  result: any;
  title?: string;
  type?: 'result' | 'logs' | 'orderDetails'; // Тип відображення
}

/**
 * Універсальний Drawer для відображення результатів операцій з Dilovod
 * Підтримує різні типи результатів: валідація, експорт, перевірка, логи
 */
export default function ResultDrawer({ isOpen, onOpenChange, result, title = 'Результат операції', type = 'result' }: ResultDrawerProps) {
  if (!result) return null;

  // Для логів - це масив
  const isLogsMode = type === 'logs' && Array.isArray(result);
  const [selectedLogIdx, setSelectedLogIdx] = useState(0);
  
  // Визначаємо тип результату
  const isValidationError = result.type === 'critical_validation_error';
  const hasData = result.data && Array.isArray(result.data) && result.data.length > 0;
  const hasErrors = result.errors && Array.isArray(result.errors) && result.errors.length > 0;


	// Визначення стилів для інформаційних блоків
	const infoBox = "flex flex-col gap-1 min-h-[90px] justify-between border-1 rounded-md p-3 bg-gray-50";
	const infoBoxLabel = "text-gray-400 text-xs";
	const infoBoxText = "text-sm font-medium leading-tight";

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
										<div className={`p-4 rounded-lg border-1 ${result[selectedLogIdx].status === 'success' ? 'bg-green-200 border-green-300' : 'bg-red-200 border-red-300'}`}>
                      <div className="flex items-center gap-3">
                        <DynamicIcon 
                          name={result[selectedLogIdx].status === 'success' ? "check-circle" : "x-circle"} 
                          size={24} className={`shrink-0 ${result[selectedLogIdx].status === 'success' ? 'text-green-600' : 'text-red-600'}`}
                        />
                        <div className={`flex-1 ${result[selectedLogIdx].status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                          <h3 className="font-semibold text-lg">{result[selectedLogIdx].title || 'No title provided'}</h3>
													<div className="text-sm">{result[selectedLogIdx].message || 'No message provided'}</div>
                          {result[selectedLogIdx].datetime && (
                            <div className="text-xs mt-2 opacity-60">
                              {new Date(result[selectedLogIdx].datetime).toLocaleString('uk-UA')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

										{/* <pre>{JSON.stringify(result[selectedLogIdx], null, 2)}</pre> */}

										{/* Блок приміток (notes, але світло-сірий) */}
										{result[selectedLogIdx].data?.warnings && result[selectedLogIdx].data.warnings.length > 0 && (
											<div>
												<h4 className="font-semibold text-sm mb-3">Примітки:</h4>
												<div className="space-y-2 max-h-48 overflow-y-auto">
													{result[selectedLogIdx].data.warnings.map((warning: string, idx: number) => (
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
                      <div className="bg-gray-50 p-4 rounded-lg border h-full overflow-auto">
                        <pre className="text-xs whitespace-pre-wrap break-words">
                          {JSON.stringify(result[selectedLogIdx], null, 2)}
                        </pre>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
										{type === 'orderDetails' ? (
											<>
												{/* Загальна інформація по замовленню */}
												<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
													{result.orderDate && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Дата замовлення:</span> <span className={infoBoxText}>{formatDate(result.orderDate)}</span>
														</div>
													)}
													{result.customerName && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Клієнт:</span> <span className={infoBoxText}>{result.customerName}</span>
														</div>
													)}
													{result.paymentMethod && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Спосіб оплати:</span> <span className={infoBoxText}>{result.paymentMethod}</span>
														</div>
													)}
													{result.shippingMethod && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Спосіб доставки:</span> <span className={infoBoxText}>{result.shippingMethod}</span>
														</div>
													)}
													{result.sajt && (
														<div className={infoBox}>
															<span className={infoBoxLabel}>Канал продажів:</span> <span className={infoBoxText}>{result.sajt}</span>
														</div>
													)}
												</div>
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
											<div className="overflow-x-auto my-6">
												<table className="min-w-full border text-sm">
													<thead>
														<tr className="bg-gray-100">
															<th className="border px-2 py-1">№ замовл.</th>
															<th className="border px-2 py-1">Експорт</th>
															<th className="border px-2 py-1">Відвантаження</th>
															<th className="border px-2 py-1">Помилки</th>
														</tr>
													</thead>
													<tbody>
														{result.bulkExportResults.map((item: any, idx: number) => (
															<tr key={idx} className="odd:bg-white even:bg-gray-50">
																<td className="border px-2 py-1 font-medium">{item.orderNumber}</td>
																<td className="border px-2 py-1">
																	{item.exportSuccess ? <Chip size="sm" color="success" variant="flat">OK</Chip> : <Chip size="sm" color="danger" variant="flat">Помилка</Chip>}
																</td>
																<td className="border px-2 py-1">
																	{item.shipmentSuccess ? <Chip size="sm" color="success" variant="flat">OK</Chip> : 
																	item.exportSuccess ? <Chip size="sm" color="danger" variant="flat">Помилка</Chip> : 
																	<Chip size="sm" color="secondary" variant="flat" className="text-gray-400 px-4">—</Chip>}
																</td>
																<td className="border px-2 py-1">
																	{item.errors && item.errors.length > 0 ? (
																		<ul className="list-disc ml-4">
																			{item.errors.map((err: string, i: number) => (
																				<li key={i} className="text-red-600">{err}</li>
																			))}
																		</ul>
																	) : <span className="text-gray-400">—</span>}
																</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										)}

										{/* Таблиця результатів (для масових операцій) */}
										{hasData && (
											<div>
												<h4 className="font-semibold text-sm mb-3">Оброблені замовлення:</h4>
												<div className="flex flex-col md:flex-row flex-wrap gap-3 max-h-[calc(100vh-500px)] overflow-y-auto">
													{result.data.map((item: any, idx: number) => (
														<div key={idx} className="flex-1 min-w-[45%] p-3 bg-gray-50 rounded-lg border-1 border-gray-200">
															<div className="flex items-start justify-between gap-2">
																<div className="flex-1">
																	<div className="font-medium text-sm">
																		№ {item.orderNumber || item.normalizedNumber}
																	</div>
																	{item.dilovodId && (
																		<div className="text-xs text-gray-600 mt-1">
																			Dilovod ID: <span className="font-mono">{item.dilovodId}</span>
																		</div>
																	)}
																	{item.dilovodExportDate && (
																		<div className="text-xs text-gray-600">
																			Додано: {new Date(item.dilovodExportDate).toLocaleString('uk-UA')}
																		</div>
																	)}
																	{item.dilovodSaleExportDate && (
																		<div className="text-xs text-green-600">
																			✓ Відвантажено: {new Date(item.dilovodSaleExportDate).toLocaleString('uk-UA')}
																		</div>
																	)}
																	{item.dilovodCashInDate && (
																		<div className="text-xs text-blue-600">
																			✓ Оплачено: {new Date(item.dilovodCashInDate).toLocaleString('uk-UA')}
																		</div>
																	)}
																</div>
																{item.success === false && item.error && (
																	<Chip size="sm" color="danger" variant="flat">
																		Помилка
																	</Chip>
																)}
																{item.success !== false && item.updatedCount > 0 ? (
																	<Chip size="sm" color="success" variant="flat">
																		OK
																	</Chip>
																) : item.success !== false && item.updatedCount === 0 ? (
																	<Chip size="sm" color="secondary" variant="flat" className="text-neutral-400">
																		Skip
																	</Chip>
																) : null}
															</div>
														</div>
													))}
												</div>
											</div>
										)}

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
											<summary className="cursor-pointer font-semibold text-sm mb-3 list-none flex items-center gap-2">
												<DynamicIcon name="chevron-right" size={16} className="group-open:rotate-90 transition-transform"/>
												Raw JSON
											</summary>
											<div className="bg-gray-50 p-3 rounded-lg border-1 border-gray-200 overflow-auto">
												<pre className="text-xs font-mono whitespace-pre-wrap break-words">
													{JSON.stringify(result, null, 2)}
												</pre>
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
