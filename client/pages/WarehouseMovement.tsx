import React, { useState, useCallback, useRef, useEffect } from 'react';
import { RightPanel } from "@/components/RightPanel";
import { NumberPad } from "@/components/NumberPad";
import { Button } from "@heroui/react";
import { DynamicIcon } from 'lucide-react/dynamic';
import { DeviationButton } from "@/components/DeviationButton";
import { motion, AnimatePresence } from 'framer-motion';
import { useWarehouse } from '@/hooks/useWarehouse';
import { LoggingService } from '@/services/LoggingService';

const PORTIONS_PER_BOX = 24;

// --- Helper Components ---

// FIX: Create a fully custom Input component to avoid any library conflicts.
const CustomInput = ({ value, isFocused, className = '' }) => (
    <div className={`w-full h-[74px] flex items-center justify-center text-2xl font-medium text-gray-800 bg-white border-2 rounded-xl transition-colors ${isFocused ? 'border-blue-500' : 'border-gray-200'} ${className}`}>
        {value}
    </div>
);

const StepperInput = ({ label, value, onFocus, isFocused, onIncrement, onDecrement }) => (
    // FIX: Standardize width for all items to ensure proper wrapping.
    <div className="p-2 w-1/2 md:w-1/4">
        <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-gray-500">{label}</span>
            <div className={`relative w-full`} onFocus={onFocus} tabIndex={0}>
                <CustomInput value={value.toString()} isFocused={isFocused} />
                <Button isIconOnly variant="light" className="absolute left-2 top-1/2 -translate-y-1/2 h-14 w-10 min-w-6 bg-grey-100" onPress={onDecrement}>
                    <DynamicIcon name="minus" className="w-6 h-6" />
                </Button>
                <Button isIconOnly variant="light" className="absolute right-2 top-1/2 -translate-y-1/2 h-14 w-10 min-w-6 bg-grey-100" onPress={onIncrement}>
                    <DynamicIcon name="plus" className="w-6 h-6" />
                </Button>
            </div>
        </div>
    </div>
);

const InfoInput = ({ label, value, onFocus = () => {}, isFocused, disabled = false }) => (
    // FIX: Standardize width for all items.
    <div className="p-2 w-1/2 md:w-1/4">
         <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-gray-500">{label}</span>
            <div className={`relative w-full`} onFocus={onFocus} tabIndex={onFocus ? 0 : -1}>
                <CustomInput 
                    value={value.toString()}
                    isFocused={isFocused}
                    className={disabled ? 'bg-transparent! text-neutral-500!' : ''} 
                />
            </div>
        </div>
    </div>
)

const SummaryTable = ({ data }) => {
    const formatBoxValue = (value) => {
        return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
    };

    return (
        <div className="bg-white rounded-lg shadow-sm p-3">
            <div className="grid grid-cols-[40px_1fr_100px_150px] gap-x-4 bg-gray-100 rounded-sm px-2 py-3 text-xs font-semibold uppercase text-gray-500">
                <span>№</span>
                <span>Назва товару</span>
                <span className="text-center">Кількість</span>
                <span className="text-right">Відхилення</span>
            </div>
            <div className="divide-y divide-gray-100">
                {data.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-[40px_1fr_100px_150px] gap-x-4 px-2 py-4 items-center">
                        <span>{index + 1}</span>
                        <span>{item.name}</span>
                        <span className="text-center">{`${formatBoxValue(item.details.boxes)} / ${item.details.portions}`}</span>
                        <span className={`text-right font-semibold ${item.details.deviation < 0 ? 'text-red-500' : 'text-gray-800'}`}>{item.details.deviation || 0}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ProductAccordionItem = ({ product, isOpen, onToggle, children }) => {
    return (
        <div className="border-b border-gray-200">
            <div className="flex items-center justify-between p-6 cursor-pointer" onClick={() => onToggle(product, !isOpen)}>
                <div className="flex items-center gap-4">
                    <div className={`w-6 h-6 rounded-full border-2 leading-[100%] pb-[2px] ${isOpen ? 'border-red-500' : 'border-green-500'} flex items-center justify-center flex-shrink-0`}>
                        <span className={`text-xl ${isOpen ? 'text-red-500' : 'text-green-500'}`}>{isOpen ? '−' : '+'}</span>
                    </div>
                    <span className="text-xl font-semibold text-neutral-800">{product.name}</span>
                </div>
                <div className="flex items-center gap-2">
                    <DynamicIcon name="package" className="w-5 h-5 text-neutral-800" />
                    <span className="font-semibold text-neutral-800">{product.balance}</span>
                </div>
            </div>

            {/* Код для анимации */}
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.section
                        key="content"
                        initial="collapsed"
                        animate="open"
                        exit="collapsed"
                        variants={{
                            open: { opacity: 1, height: "auto" },
                            collapsed: { opacity: 0, height: 0 }
                        }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden" // Важно для анимации высоты
                    >
                        {/* Ваша верстка остается здесь */}
                        <div className="bg-gray-100 py-3 px-4 shadow-inner">
                           {children}
                        </div>
                    </motion.section>
                )}
            </AnimatePresence>
        </div>
    );
};

// Компонент таблицы завершенных актов
const CompletedActsTable = ({ completedActs, loadingCompleted, onViewAct }) => {
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('uk-UA');
    };

    const getTotalItems = (items) => {
        return items.length;
    };

    const getTotalBoxes = (items) => {
        return items.reduce((sum, item) => sum + item.boxQuantity, 0);
    };

    const getTotalPortions = (items) => {
        return items.reduce((sum, item) => sum + item.portionQuantity, 0);
    };

    const handleView = (act) => {
        if (onViewAct) {
            onViewAct(act);
        }
    };

    if (loadingCompleted) {
        return (
            <div className="mt-8 bg-white rounded-lg shadow-sm p-3">
                <div className="flex items-center justify-center">
                    <DynamicIcon name="loader-2" className="w-6 h-6 animate-spin mr-2" />
                    <span>Завантаження актів...</span>
                </div>
            </div>
        );
    }

    if (completedActs.length === 0) {
        return (
            <div className="mt-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Завершені акти</h2>
                <div className="bg-white rounded-lg shadow-sm p-3">
                    <p className="text-gray-500 text-center py-4">Немає завершених актів</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Завершені акти</h2>
            <div className="mt-8 bg-white rounded-lg shadow-sm p-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200">
                                <th className="text-left py-3 px-2 font-semibold">Дата</th>
                                <th className="text-left py-3 px-2 font-semibold">Номер акта</th>
                                <th className="text-center py-3 px-2 font-semibold">Позицій</th>
                                <th className="text-center py-3 px-2 font-semibold">Коробок</th>
                                <th className="text-center py-3 px-2 font-semibold">Порцій</th>
                                <th className="text-center py-3 px-2 font-semibold">Дії</th>
                            </tr>
                        </thead>
                        <tbody>
                            {completedActs.map((act) => (
                                <tr key={act.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="py-3 px-2">{formatDate(act.sentToDilovodAt || act.updatedAt)}</td>
                                    <td className="py-3 px-2 font-medium">{act.internalDocNumber}</td>
                                    <td className="py-3 px-2 text-center">{getTotalItems(act.items)}</td>
                                    <td className="py-3 px-2 text-center">{getTotalBoxes(act.items)}</td>
                                    <td className="py-3 px-2 text-center">{getTotalPortions(act.items)}</td>
                                    <td className="py-3 px-2">
                                        <div className="flex items-center gap-2 justify-center">
                                            <Button
                                                size="sm"
                                                variant="light"
                                                onPress={() => handleView(act)}
                                                className="text-blue-600"
                                            >
                                                <DynamicIcon name="eye" className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- Main Page Component ---

export default function WarehouseMovement() {
    const { getProductsForMovement, getDrafts, createMovement, updateDraft, sendToDilovod, getMovements, loading: warehouseLoading, error: warehouseError } = useWarehouse();
    const [products, setProducts] = useState([]);
    const [selectedProductIds, setSelectedProductIds] = useState(new Set());
    const [activeField, setActiveField] = useState(null);
    const [initialLoading, setInitialLoading] = useState(true);
    const [savedDraft, setSavedDraft] = useState(null); // Сохранённый черновик
    const [isSaving, setIsSaving] = useState(false); // Состояние сохранения черновика
    const [isSending, setIsSending] = useState(false); // Состояние отправки в Діловод
    const [completedActs, setCompletedActs] = useState([]); // Завершенные акты
    const [loadingCompleted, setLoadingCompleted] = useState(false);
    const [viewActModal, setViewActModal] = useState(null); // Модальное окно просмотра акта
    const pageContainerRef = useRef(null);
    const accordionRef = useRef(null);
    const rightPanelRef = useRef(null);

    // Функция для загрузки данных черновика в товары
    const loadDraftIntoProducts = useCallback((products, draftItems, draftDeviations = []) => {
        // Проверяем, что draftItems является массивом
        if (!Array.isArray(draftItems)) {
            return products;
        }

        const updatedProducts = products.map(product => {
            const draftItem = draftItems.find(item => item.sku === product.sku);
            if (draftItem) {
                // Ищем отклонение для этого товара и партии
                const deviation = draftDeviations.find((d: any) => d.sku === product.sku && d.batchNumber === draftItem.batchNumber) || { deviation: 0 };

                return {
                    ...product,
                    details: {
                        ...product.details,
                        boxes: draftItem.boxQuantity || 0,
                        portions: draftItem.portionQuantity || 0,
                        batchNumber: draftItem.batchNumber || '',
                        forecast: draftItem.forecast || 125,
                        deviation: deviation.deviation // Загружаем сохраненное отклонение
                    }
                };
            }
            return product;
        });
        
        setProducts(updatedProducts);
        
        // Отмечаем товары как выбранные, если они есть в черновике
        const selectedIds = new Set(
            draftItems.map(item => {
                const product = products.find(p => p.sku === item.sku);
                return product ? product.id : null;
            }).filter(Boolean)
        );
        setSelectedProductIds(selectedIds);
        
        LoggingService.warehouseMovementLog(`🏪 Выбрано ${selectedIds.size} товаров из черновика`);
    }, []);

    
    // Загрузка данных при монтировании компонента
    useEffect(() => {
        const loadData = async () => {
            setInitialLoading(true);
            LoggingService.warehouseMovementLog('🏪 Начинаем загрузку данных...');
            
            try {
                // Загружаем товары, черновики и завершенные акты параллельно
                const [productsData, draftsData] = await Promise.all([
                    getProductsForMovement(),
                    getDrafts(),
                ]);

                // Загружаем завершенные акты отдельно
                setLoadingCompleted(true);
                try {
                    const result = await getMovements({
                        status: 'sent',
                        limit: 50
                    });
                    setCompletedActs(result?.movements || []);
                } catch (error) {
                    console.error('🚨 [WarehouseMovement] Ошибка загрузки завершенных актов:', error);
                } finally {
                    setLoadingCompleted(false);
                }
                
                // Устанавливаем товары
                if (productsData && productsData.products && Array.isArray(productsData.products)) {
                    setProducts(productsData.products);
                } else {
                    setProducts([]);
                }
                
                // Проверяем наличие черновиков
                if (draftsData && draftsData.drafts && draftsData.drafts.length > 0) {
                    const latestDraft = draftsData.drafts[0]; // Берём самый новый черновик
                    setSavedDraft(latestDraft);

                    // Загружаем данные черновика в товары
                    if (latestDraft.items && Array.isArray(latestDraft.items) && productsData.products) {
                        loadDraftIntoProducts(productsData.products, latestDraft.items, latestDraft.deviations || []);
                    }
                }
                
            } catch (error) {
                console.error('🚨 [WarehouseMovement] Ошибка загрузки данных:', error);
                setProducts([]);
            } finally {
                setInitialLoading(false);
            }
        };

        loadData();
    }, []); // Загружаем только один раз при монтировании

    useEffect(() => {
        const handleClickOutside = (event) => {
            const target = event.target as Node;

            // If the click is inside the right panel (which contains the numpad), do nothing.
            if (rightPanelRef.current && rightPanelRef.current.contains(target)) {
                return;
            }

            // If the click is inside the accordion, check if it was on a focusable input area.
            if (accordionRef.current && accordionRef.current.contains(target)) {
                // The focusable areas have tabIndex=0. Check if the clicked element or its parent has it.
                if (target instanceof Element && target.closest('[tabindex="0"]')) {
                    return;
                }
            }

            // If we reach here, the click was outside any interactive zone.
            setActiveField(null);
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleAccordionToggle = (product, shouldOpen) => {
        const newSelectedIds = new Set(selectedProductIds);
        if (shouldOpen) {
            newSelectedIds.add(product.id);
        } else {
            newSelectedIds.delete(product.id);
        }
        setSelectedProductIds(newSelectedIds);
    };

    const handleFocus = (productId, field) => {
        setActiveField({ productId, field });
    };

    const handleClearAll = () => {
        setSelectedProductIds(new Set());
        setSavedDraft(null); // Очищаем сохранённый черновик
    };

    // Функция сохранения черновика
    const handleSaveDraft = async () => {
        const summaryItems = products.filter(p => selectedProductIds.has(p.id));
        
        if (summaryItems.length === 0) {
            alert('Оберіть товари для переміщення');
            return;
        }

        setIsSaving(true);
        
        try {
            const items = summaryItems.map(item => ({
                sku: item.sku,
                productName: item.name,
                boxQuantity: item.details.boxes,
                portionQuantity: item.details.portions,
                batchNumber: item.details.batchNumber || '',
                forecast: item.details.forecast
            }));

            // Формируем отклонения: при первом сохранении все = 0, при обновлении сохраняем существующие
            const deviations = summaryItems.map(item => {
                const existingDeviation = savedDraft?.deviations?.find((d: any) => d.sku === item.sku && d.batchNumber === item.details.batchNumber);
                return {
                    sku: item.sku,
                    batchNumber: item.details.batchNumber || '',
                    deviation: existingDeviation ? existingDeviation.deviation : 0 // 0 при первом сохранении, сохраняем существующие при обновлении
                };
            });

            let result;
            
            if (savedDraft && savedDraft.status === 'draft') {
                // Обновляем существующий черновик
                LoggingService.warehouseMovementLog('🏪 Обновляем существующий черновик:', savedDraft.id);
                const updateData = {
                    items: items,
                    deviations: deviations,
                    notes: 'Оновлено з інтерфейсу переміщення складу'
                };
                result = await updateDraft(savedDraft.id, updateData);
            } else {
                // Создаём новый черновик
                LoggingService.warehouseMovementLog('🏪 Создаём новый черновик');
                const movementData = {
                    sourceWarehouse: 'Основний склад',
                    destinationWarehouse: 'Малий склад',
                    items: items,
                    deviations: deviations,
                    notes: 'Створено з інтерфейсу переміщення складу'
                };
                result = await createMovement(movementData);
            }
            
            if (result) {
                setSavedDraft(result);
                console.log('✅ [WarehouseMovement] Черновик сохранён:', result);
                alert('Чернетку збережено успішно!');
            } else {
                throw new Error('Не вдалося зберегти чернетку');
            }
        } catch (error) {
            console.error('🚨 [WarehouseMovement] Ошибка сохранения черновика:', error);
            alert('Помилка збереження чернетки: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // Функция отправки в Діловод (пока просто сохраняет локально)
    const handleSendToDilovod = async () => {
        if (!savedDraft) {
            alert('Спочатку збережіть чернетку');
            return;
        }

        setIsSending(true);

        try {
            console.log('🏪 [WarehouseMovement] Зберігаємо документ локально:', savedDraft.id);

            const result = await sendToDilovod(savedDraft.id);

            if (result) {
                setSavedDraft(prev => ({ ...prev, status: 'sent' }));
                console.log('✅ [WarehouseMovement] Документ збережено локально:', result);
                alert('Накладну успішно збережено!');
                // Обновляем список завершенных актов
                setLoadingCompleted(true);
                try {
                    const result = await getMovements({
                        status: 'sent',
                        limit: 50
                    });
                    setCompletedActs(result?.movements || []);
                } catch (error) {
                    console.error('🚨 [WarehouseMovement] Ошибка загрузки завершенных актов:', error);
                } finally {
                    setLoadingCompleted(false);
                }
            } else {
                throw new Error('Не вдалося зберегти документ');
            }
        } catch (error) {
            console.error('🚨 [WarehouseMovement] Помилка збереження документа:', error);
            alert('Помилка збереження документа: ' + error.message);
        } finally {
            setIsSending(false);
        }
    };

    // Функция просмотра акта
    const handleViewAct = useCallback((act) => {
        setViewActModal(act);
    }, []);

    // Закрытие модального окна просмотра акта
    const handleCloseViewAct = useCallback(() => {
        setViewActModal(null);
    }, []);

    const updateProductValue = useCallback((productId, field, value) => {
        setProducts(prev => prev.map(p => {
            if (p.id === productId || p.sku === productId) {
                const newDetails = { ...p.details };

                if (field === 'boxes') {
                    newDetails.boxes = value;
                    newDetails.portions = value * PORTIONS_PER_BOX;
                } else if (field === 'portions') {
                    newDetails.portions = value;
                    newDetails.boxes = parseFloat((value / PORTIONS_PER_BOX).toFixed(1));
                } else {
                    newDetails[field] = value;
                }

                return { ...p, details: newDetails };
            }
            return p;
        }));
    }, []);

    const handleNumpadInput = useCallback((digit) => {
        if (!activeField) return;
        const { productId, field } = activeField;
        const currentProduct = products.find(p => p.id === productId || p.sku === productId);
        if (!currentProduct) return;

        const currentValStr = currentProduct.details[field].toString();
        const newValStr = currentValStr === '0' ? digit : currentValStr + digit;
        updateProductValue(productId, field, Number(newValStr));

    }, [activeField, products, updateProductValue]);

    const handleBackspace = useCallback(() => {
        if (!activeField) return;
        const { productId, field } = activeField;
        const currentProduct = products.find(p => p.id === productId || p.sku === productId);
        if (!currentProduct) return;

        const currentValStr = currentProduct.details[field].toString();
        const newValStr = currentValStr.slice(0, -1) || '0';
        updateProductValue(productId, field, Number(newValStr));

    }, [activeField, products, updateProductValue]);

    const handleIncrement = useCallback(() => {
        if (!activeField) return;
        const { productId, field } = activeField;
        const currentProduct = products.find(p => p.id === productId || p.sku === productId);
        if (!currentProduct) return;

        let currentValue = currentProduct.details[field];
        if (field === 'boxes') {
            currentValue = Math.round(currentValue);
        }
        updateProductValue(productId, field, currentValue + 1);

    }, [activeField, products, updateProductValue]);

    const handleDecrement = useCallback(() => {
        if (!activeField) return;
        const { productId, field } = activeField;
        const currentProduct = products.find(p => p.id === productId || p.sku === productId);
        if (!currentProduct) return;

        let currentValue = currentProduct.details[field];
        if (field === 'boxes') {
            currentValue = Math.round(currentValue);
        }
        updateProductValue(productId, field, Math.max(0, currentValue - 1));

    }, [activeField, products, updateProductValue]);

    const summaryItems = products.filter(p => selectedProductIds.has(p.id));

    // Компонент состояния загрузки
    const LoadingState = () => (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <DynamicIcon name="loader-2" className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500">Завантаження товарів...</p>
        </div>
    );

    // Компонент пустого состояния
    const EmptyState = () => (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <DynamicIcon name="package-x" className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-semibold text-gray-600 mb-2">Немає товарів для переміщення</h3>
            <p className="text-gray-500 mb-4">Наразі відсутні товари з залишками на основному складі</p>
            <Button 
                color="primary" 
                variant="light"
                onPress={() => window.location.reload()}
            >
                <DynamicIcon name="refresh-cw" className="w-4 h-4 mr-2" />
                Оновити
            </Button>
        </div>
    );

    return (
        <div className="flex flex-col xl:flex-row items-start gap-8 w-full">
            {/* Left Column */}
            <div className="lg:col-span-2 flex flex-col gap-12 pb-12 w-full max-w-5xl">
                {initialLoading ? (
                    <LoadingState />
                ) : products.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="bg-white rounded-lg shadow-sm overflow-clip" ref={accordionRef}>
                        {products.map(p => (
                            <ProductAccordionItem 
                                key={p.id} 
                                product={p}
                                isOpen={selectedProductIds.has(p.id)}
                                onToggle={handleAccordionToggle}
                            >
                                <div className="flex flex-wrap -m-2">
                                    <StepperInput 
                                        label="кіл-ть коробок" 
                                        value={p.details.boxes}
                                        onFocus={() => handleFocus(p.id, 'boxes')}
                                        isFocused={activeField?.productId === p.id && activeField?.field === 'boxes'}
                                        onIncrement={() => { handleFocus(p.id, 'boxes'); handleIncrement(); }}
                                        onDecrement={() => { handleFocus(p.id, 'boxes'); handleDecrement(); }}
                                    />
                                    <StepperInput 
                                        label="кіл-ть порцій" 
                                        value={p.details.portions}
                                        onFocus={() => handleFocus(p.id, 'portions')}
                                        isFocused={activeField?.productId === p.id && activeField?.field === 'portions'}
                                        onIncrement={() => { handleFocus(p.id, 'portions'); handleIncrement(); }}
                                        onDecrement={() => { handleFocus(p.id, 'portions'); handleDecrement(); }}
                                    />
                                    <InfoInput 
                                        label="прогноз"
                                        value={p.details.forecast}
                                        isFocused={false}
                                        disabled={true}
                                    />
                                    <InfoInput 
                                        label="№ партії" 
                                        value={p.details.batchNumber}
                                        onFocus={() => handleFocus(p.id, 'batchNumber')}
                                        isFocused={activeField?.productId === p.id && activeField?.field === 'batchNumber'}
                                    />
                                </div>
                            </ProductAccordionItem>
                        ))}
                    </div>
                )}

                {/* Показываем ошибку загрузки, если есть */}
                {warehouseError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                            <DynamicIcon name="alert-circle" className="w-5 h-5 text-red-500 flex-shrink-0" />
                            <div>
                                <p className="text-red-800 font-medium">Помилка завантаження товарів</p>
                                <p className="text-red-600 text-sm">{warehouseError}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Показываем сводку только если есть товары */}
                {!initialLoading && products.length > 0 && summaryItems.length > 0 && (
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">
                            {!savedDraft 
                                ? 'Попередній акт переміщення' 
                                : `Акт переміщення №${savedDraft.internalDocNumber}`
                            }
                        </h2>
                        <p className="text-gray-600 mb-4">
                            {!savedDraft 
                                ? 'Після збереження документ ще не буде відправлений у Діловод. Відправте його наприкінці дня, коли всі порції будуть пораховані.'
                                : savedDraft.status === 'draft'
                                    ? 'Чернетку збережено. Тепер можна відправити накладну в Діловод.'
                                    : 'Накладну успішно відправлено в Діловод.'
                            }
                        </p>
                        <SummaryTable data={summaryItems} />
                    </div>
                )}

                {/* Показываем кнопки только если есть товары */}
                {!initialLoading && products.length > 0 && (
                    <div className="flex items-center gap-6">
                        {!savedDraft ? (
                            // Кнопки до сохранения черновика
                            <>
                                <Button 
                                    size="lg" 
                                    color="primary" 
                                    className="shadow-button-primary"
                                    onPress={handleSaveDraft}
                                    isLoading={isSaving}
                                    isDisabled={summaryItems.length === 0}
                                >
                                    {isSaving ? 'Збереження...' : (savedDraft && savedDraft.status === 'draft' ? 'Оновити чернетку' : 'Зберегти чернетку')}
                                </Button>
                                <Button
                                    size="lg"
                                    color="danger"
                                    className="shadow-button-danger"
                                    onPress={handleClearAll}
                                    isDisabled={isSaving || isSending}
                                >
                                    Очистити все
                                </Button>
                            </>
                        ) : savedDraft.status === 'draft' ? (
                            // Кнопки после сохранения черновика
                            <>
                                <Button
                                    size="lg"
                                    color="primary"
                                    className="shadow-button-primary"
                                    onPress={handleSaveDraft}
                                    isLoading={isSaving}
                                    isDisabled={isSending}
                                >
                                    {isSaving ? 'Збереження...' : 'Оновити чернетку'}
                                </Button>
                                <Button
                                    size="lg"
                                    color="success"
                                    className="bg-green-600 text-white font-medium shadow-button-primary/30 justify-start"
                                    onPress={handleSendToDilovod}
                                    isLoading={isSending}
                                    isDisabled={isSaving}
                                >
                                    {isSending ? 'Відправка...' : <><DynamicIcon name="folder-sync" strokeWidth={1.5} className="w-6 h-6" /> Відправити накладну в Діловод</>}
                                </Button>
                            </>
                        ) : (
                            // Состояние после отправки в Діловод
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-green-600">
                                    <DynamicIcon name="check-circle" className="w-5 h-5" />
                                    <span className="font-medium">Накладну збережено</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Таблица завершенных актов */}
                <CompletedActsTable completedActs={completedActs} loadingCompleted={loadingCompleted} onViewAct={handleViewAct} />

                {/* Модальное окно просмотра акта */}
                {viewActModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                            {/* Заголовок модального окна */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-200">
                                <h2 className="text-2xl font-bold text-gray-900">
                                    Акт переміщення №{viewActModal.internalDocNumber}
                                </h2>
                                <Button
                                    size="sm"
                                    variant="light"
                                    onPress={handleCloseViewAct}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <DynamicIcon name="x" className="w-5 h-5" />
                                </Button>
                            </div>

                            {/* Содержимое модального окна */}
                            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                                {/* Информация об акте */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <div className="text-sm text-gray-600 mb-1">Дата створення</div>
                                        <div className="font-semibold">
                                            {new Date(viewActModal.draftCreatedAt).toLocaleDateString('uk-UA')}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <div className="text-sm text-gray-600 mb-1">Дата відправки</div>
                                        <div className="font-semibold">
                                            {viewActModal.sentToDilovodAt
                                                ? new Date(viewActModal.sentToDilovodAt).toLocaleDateString('uk-UA')
                                                : 'Не відправлено'
                                            }
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <div className="text-sm text-gray-600 mb-1">Статус</div>
                                        <div className="font-semibold text-green-600">
                                            {viewActModal.status === 'sent' ? 'Відправлено' : 'Чернетка'}
                                        </div>
                                    </div>
                                </div>

                                {/* Информация о складах */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div className="bg-blue-50 rounded-lg p-4">
                                        <div className="text-sm text-blue-600 mb-1">Звідки</div>
                                        <div className="font-semibold text-blue-900">
                                            {viewActModal.sourceWarehouse}
                                        </div>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4">
                                        <div className="text-sm text-green-600 mb-1">Куди</div>
                                        <div className="font-semibold text-green-900">
                                            {viewActModal.destinationWarehouse}
                                        </div>
                                    </div>
                                </div>

                                {/* Таблица товаров */}
                                <div className="mb-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Товари</h3>
                                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="text-left py-3 px-4 font-semibold">Назва товару</th>
                                                    <th className="text-center py-3 px-4 font-semibold">Коробки</th>
                                                    <th className="text-center py-3 px-4 font-semibold">Порції</th>
                                                    <th className="text-center py-3 px-4 font-semibold">Партія</th>
                                                    <th className="text-center py-3 px-4 font-semibold">Відхилення</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {viewActModal.items?.map((item, index) => (
                                                    <tr key={index} className="hover:bg-gray-50">
                                                        <td className="py-3 px-4">{item.productName || item.name}</td>
                                                        <td className="py-3 px-4 text-center">{item.boxQuantity}</td>
                                                        <td className="py-3 px-4 text-center">{item.portionQuantity}</td>
                                                        <td className="py-3 px-4 text-center">{item.batchNumber || '-'}</td>
                                                        <td className="py-3 px-4 text-center">
                                                            {viewActModal.deviations?.find(d => d.sku === item.sku && d.batchNumber === item.batchNumber)?.deviation || 0}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Итоги */}
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Підсумки</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-blue-600">
                                                {viewActModal.items?.length || 0}
                                            </div>
                                            <div className="text-sm text-gray-600">Позицій</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-green-600">
                                                {viewActModal.items?.reduce((sum, item) => sum + item.boxQuantity, 0) || 0}
                                            </div>
                                            <div className="text-sm text-gray-600">Коробок</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-purple-600">
                                                {viewActModal.items?.reduce((sum, item) => sum + item.portionQuantity, 0) || 0}
                                            </div>
                                            <div className="text-sm text-gray-600">Порцій</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-orange-600">
                                                {viewActModal.deviations?.reduce((sum, d) => sum + Math.abs(d.deviation), 0) || 0}
                                            </div>
                                            <div className="text-sm text-gray-600">Відхилень</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Кнопки действий */}
                            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                                <Button
                                    variant="light"
                                    onPress={handleCloseViewAct}
                                >
                                    Закрити
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Column */}
            <RightPanel>
                <div className="bg-gray-100 rounded-lg p-4 flex items-center gap-5">
                    <DynamicIcon name="message-circle-question" size={24} className="flex-shrink-0 text-gray-500" />
                    <p className="text-sm text-gray-600">Кількість розраховується автоматично, але при необхідності її можна змінити вручну</p>
                </div>
                <div className={`w-full duration-500 ${!activeField ? 'opacity-30 pointer-events-none' : ''}`}>
                    <NumberPad 
                        onNumberClick={handleNumpadInput}
                        onBackspace={handleBackspace}
                    />
                </div>
                <DeviationButton />
            </RightPanel>
        </div>

    );
};