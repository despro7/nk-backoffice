import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth, useEquipmentFromAuth } from '../contexts/AuthContext';
import { useDebug } from '../contexts/DebugContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { LoggingService } from '@/services/LoggingService';
import type { OrderChecklistItem } from '../types/orderAssembly';
import { expandProductSets, combineBoxesWithItems } from '@/lib/orderAssemblyUtils';
import { useWeightManagement } from '@/hooks/useWeightManagement';
import { useBarcodeScanning } from '@/hooks/useBarcodeScanning';
import { useOrderNavigation } from '@/hooks/useOrderNavigation';
import { InfoModal } from '../components/modals/InfoModal';
import { BaseModal } from '../components/modals/BaseModal';
import { Button } from '@heroui/react';
import { useOrderSettings } from '@/hooks/useOrderSettings';
import { useBoxInitialStatus } from '@/hooks/useBoxInitialStatus';
import { OrderViewHeader } from '@/components/OrderViewHeader';
import { OrderAssemblyRightPanel } from '@/components/OrderAssemblyRightPanel';
import { OrderDetailsAdmin } from '@/components/OrderDetailsAdmin';
import OrderChecklist from '@/components/OrderChecklist';
import { DynamicIcon } from 'lucide-react/dynamic';

export default function OrderView() {
  const { externalId } = useParams<{ externalId: string }>();
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [equipmentState, equipmentActions] = useEquipmentFromAuth();
  const { user } = useAuth();
  const { isDebugMode } = useDebug();

  // Основний стан замовлення
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<OrderChecklistItem[]>([]);
  const [expandingSets, setExpandingSets] = useState(false);
  const [checklistItems, setChecklistItems] = useState<OrderChecklistItem[]>([]);

  // Стан коробок
  const [selectedBoxes, setSelectedBoxes] = useState<any[]>([]);
  const [boxesTotalWeight, setBoxesTotalWeight] = useState<number>(0);
  const [activeBoxIndex, setActiveBoxIndex] = useState<number>(0);
  
  // Стан нерозподілених порцій
  const [unallocatedPortions, setUnallocatedPortions] = useState<number>(0);
  const [unallocatedItems, setUnallocatedItems] = useState<Array<{ name: string; quantity: number }>>([]);

  // Стан замовлення
  const [isReadyToShip, setIsReadyToShip] = useState(false);

  // Автоматичний запуск/зупинка ваги
  const [isWeightWidgetActive, setIsWeightWidgetActive] = useState(false);
  const [isWeightWidgetPaused, setIsWeightWidgetPaused] = useState(false);

  // Polling режими
  const [pollingMode, setPollingMode] = useState<'active' | 'reserve' | 'auto'>('auto');
  const activePollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lastWeightActivityTime, setLastWeightActivityTime] = useState<number>(Date.now());

  // Використовуємо створені хуки
  const { orderSoundSettings, toleranceSettings, playOrderStatusSound } = useOrderSettings();
  const { boxInitialStatus } = useBoxInitialStatus();

  const { getWeightData, handleWeightChange } = useWeightManagement({
    checklistItems,
    activeBoxIndex,
    toleranceSettings,
    setChecklistItems
  });

  const { handleBarcodeScan } = useBarcodeScanning({
    checklistItems,
    activeBoxIndex,
    setChecklistItems,
    debugMode: isDebugMode
  });

  const {
    showPrintTTN,
    setShowPrintTTN,
    showNextOrder,
    nextOrderNumber,
    nextOrderDate,
    showNoMoreOrders,
    handlePrintTTN,
    handleNextOrder,
    fetchNextOrderNumber,
    showErrorModal,
    setShowErrorModal,
    errorModalText,
    handleNavigateToPrevious,
    handleNavigateToNext,
    hasPreviousOrder,
    hasNextOrder,
    showNavigationConfirmModal,
    confirmNavigation,
    cancelNavigation
  } = useOrderNavigation({
    externalId,
    id: order ? order.id : 0,
    apiCall,
    equipmentConfig: equipmentState.config,
    previousOrderExternalId: order?.previousOrderExternalId,
    nextOrderExternalId: order?.nextOrderExternalId,
    checklistItems,
    orderStatus: order?.status
  });

  // Прапорець для відстеження, чи замовлення було відкрите вже зібраним
  const [wasOpenedAsReady, setWasOpenedAsReady] = useState(false);

  // Ваги активні, поки не всі товари/коробки зібрані
  useEffect(() => {
    const allCollected = checklistItems.length > 0 && checklistItems.every(item =>
      item.status === 'done' || item.status === 'success'
    );
    setIsWeightWidgetActive(!allCollected && equipmentState.isScaleConnected);
    setIsWeightWidgetPaused(allCollected);
  }, [checklistItems, equipmentState.isScaleConnected]);

  // Sound notification effect
  const prevChecklistRef = useRef<OrderChecklistItem[]>([]);
  useEffect(() => {
    const prev = prevChecklistRef.current;
    checklistItems.forEach((item) => {
      const prevItem = prev.find((p) => p.id === item.id);
      if (!prevItem) return;
      if (prevItem.status !== item.status) {
        if (["pending", "success", "error"].includes(item.status)) {
          playOrderStatusSound(item.status);
        }
      }
    });
    prevChecklistRef.current = checklistItems;
  }, [checklistItems, playOrderStatusSound]);

  // Функції для керування polling режимами
  const startActivePolling = useCallback(() => {
    const activePollingDuration = equipmentState.config?.scale?.activePollingDuration || 30000;

    LoggingService.equipmentLog('🔄 [OrderView] Запуск активного polling');
    setPollingMode('active');
    setLastWeightActivityTime(Date.now());

    if (activePollingTimeoutRef.current) {
      clearTimeout(activePollingTimeoutRef.current);
      activePollingTimeoutRef.current = null;
    }

    activePollingTimeoutRef.current = setTimeout(() => {
      LoggingService.equipmentLog('⏰ [OrderView] Таймаут активного polling, переходимо до резервного');
      setPollingMode('reserve');
    }, activePollingDuration);
  }, [equipmentState.config?.scale?.activePollingDuration]);

  const handlePollingModeChange = useCallback((mode: 'active' | 'reserve') => {
    LoggingService.equipmentLog(`🔄 [OrderView] WeightDisplayWidget змінив режим polling на: ${mode}`);
    setPollingMode(mode);
  }, []);

  // Запуск активного polling при завантаженні сторінки замовлення
  useEffect(() => {
    if (externalId && equipmentState.config?.scale) {
      LoggingService.equipmentLog('🔄 [OrderView] Завантаження сторінки замовлення - запускаємо активний polling');
      startActivePolling();
    }

    return () => {
      if (activePollingTimeoutRef.current) {
        clearTimeout(activePollingTimeoutRef.current);
        activePollingTimeoutRef.current = null;
      }
    };
  }, [externalId, startActivePolling, equipmentState.config?.scale]);

  // Обробка сканування штрих-кодів
  useEffect(() => {
    if (equipmentState.lastBarcode) {
      handleBarcodeScan(equipmentState.lastBarcode.code);
      equipmentActions.resetScanner();
    }
  }, [equipmentState.lastBarcode, handleBarcodeScan, equipmentActions]);

  // Обробник зміни коробок
  const handleBoxesChange = useCallback((boxes: any[], totalWeight: number, boxesInfo?: any) => {
    if (!boxes || boxes.length === 0 || expandedItems.length === 0) {
      console.log('📦 OrderView: Пропускаємо оновлення коробок - немає коробок або товарів');
      return;
    }

    let updatedBoxes = boxes;
    if (boxesInfo) {
      updatedBoxes = boxes.map((box, index) => ({
        ...box,
        boxIndex: index,
        portionsRange: boxesInfo.boxPortionsRanges[index],
        // Використовуємо індивідуальний розподіл, якщо він є
        portionsPerBox: boxesInfo.portionsDistribution 
          ? boxesInfo.portionsDistribution[index]  // Індивідуальна кількість для кожної коробки
          : boxesInfo.portionsPerBox                // Fallback на загальний
      }));
    }

    setSelectedBoxes(updatedBoxes);
    setBoxesTotalWeight(totalWeight);
    setActiveBoxIndex(0);

    // Використовуємо checklistItems якщо вони є (зі збереженням статусів), інакше expandedItems
    const currentItems = checklistItems.length > 0 ? checklistItems : expandedItems;
    const itemsWithoutBoxes = currentItems.filter(item => item.type !== 'box');
    const combined = combineBoxesWithItems(updatedBoxes, itemsWithoutBoxes, isReadyToShip, boxInitialStatus);

    setChecklistItems(combined.checklistItems);
    setUnallocatedPortions(combined.unallocatedPortions);
    setUnallocatedItems(combined.unallocatedItems);
  }, [expandedItems, checklistItems, isReadyToShip]);

  // Функція для встановлення статусу awaiting_confirmation для коробки
  const setBoxAwaitingConfirmation = useCallback((boxId: string) => {
    setChecklistItems(prevItems =>
      prevItems.map(item => {
        if (item.id === boxId && item.type === 'box') {
          return { ...item, status: 'awaiting_confirmation' as const };
        }
        return item;
      })
    );
    startActivePolling();
  }, [startActivePolling]);

  // Завантажуємо деталі замовлення
  const fetchOrderDetails = async (id: string) => {
    try {
      setLoading(true);
      setChecklistItems([]);

      const response = await apiCall(`/api/orders/${id}`);
      const data = await response.json();

      if (data.success) {
        setOrder(data.data);

        setExpandingSets(true);
        try {
          const expanded = await expandProductSets(data.data.items, apiCall);
          setExpandedItems(expanded);

          const orderIsReadyToShip = data.data.status === '3' || data.data.status === '4';
          setIsReadyToShip(orderIsReadyToShip);
          let processedItems = expanded;

          if (orderIsReadyToShip) {
            LoggingService.orderAssemblyLog('📦 Замовлення має статус "На відправку" або "Відправлено" - автоматично відзначаємо як зібране');
            processedItems = expanded.map(item => ({
              ...item,
              status: 'done' as const  // Всі елементи (і коробки, і товари) мають статус 'done'
            }));
            setShowPrintTTN(true);
            setWasOpenedAsReady(true); // Позначаємо, що замовлення було відкрите вже зібраним
          }

          if (selectedBoxes.length > 0) {
            // console.log('📦 selectedBoxes.length > 0, викликаємо combineBoxesWithItems');
            const itemsWithoutBoxes = processedItems.filter(item => item.type !== 'box');
            const combined = combineBoxesWithItems(selectedBoxes, itemsWithoutBoxes, orderIsReadyToShip, boxInitialStatus);

            if (combined && combined.checklistItems.length > 0) {
              // console.log('📦 Встановлюємо combinedItems:', 
              //   combined.checklistItems.map(item => ({ name: item.name, type: item.type, status: item.status }))
              // );
              setChecklistItems(combined.checklistItems);
              setUnallocatedPortions(combined.unallocatedPortions);
              setUnallocatedItems(combined.unallocatedItems);
            } else {
              // console.log('📦 combinedItems порожній, встановлюємо processedItems');
              setChecklistItems(processedItems);
              setUnallocatedPortions(0);
              setUnallocatedItems([]);
            }
          } else {
            // console.log('📦 selectedBoxes порожній, встановлюємо processedItems напряму');
            setChecklistItems(processedItems);
          }
        } catch (error) {
          console.error('Error expanding product sets:', error);
          const isReadyToShipFallback = data.data.status === '3' || data.data.status === '4';
          const fallbackItems = data.data.items.map((item: any, index: number) => ({
            id: (index + 1).toString(),
            name: item.productName,
            quantity: item.quantity,
            expectedWeight: item.quantity * 0.33,
            status: isReadyToShipFallback ? 'done' : 'default' as const,
            type: 'product'
          }));

          setExpandedItems(fallbackItems);

          if (selectedBoxes.length > 0) {
            const itemsWithoutBoxes = fallbackItems.filter(item => item.type !== 'box');
            const combined = combineBoxesWithItems(selectedBoxes, itemsWithoutBoxes, isReadyToShipFallback, boxInitialStatus);

            if (combined && combined.checklistItems.length > 0) {
              setChecklistItems(combined.checklistItems);
              setUnallocatedPortions(combined.unallocatedPortions);
              setUnallocatedItems(combined.unallocatedItems);
            } else {
              setChecklistItems(fallbackItems);
              setUnallocatedPortions(0);
              setUnallocatedItems([]);
            }
          } else {
            setChecklistItems(fallbackItems);
            setUnallocatedPortions(0);
            setUnallocatedItems([]);
          }

          if (isReadyToShipFallback) {
            setShowPrintTTN(true);
            setWasOpenedAsReady(true);
          }
        } finally {
          setExpandingSets(false);
        }
      } else {
        console.error('Failed to fetch order:', data.error);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
    } finally {
      setLoading(false);
    }
  };

  // Завантажуємо деталі замовлення при зміні externalId
  useEffect(() => {
    if (externalId) {
      // Скидаємо всі критичні стани перед завантаженням нового замовлення
      setWasOpenedAsReady(false);
      setShowPrintTTN(false);
      setChecklistItems([]);
      setExpandedItems([]);
      setSelectedBoxes([]);
      setIsReadyToShip(false);
      
      fetchOrderDetails(externalId);
    }
  }, [externalId]);

  // Оновлюємо title сторінки при зміні замовлення
  useEffect(() => {
    if (order) {
      const date = order.orderDate ? ` від ${new Date(order.orderDate).toLocaleDateString('uk-UA')}` : '';
      const status = order.statusText ? ` [${order.statusText}]` : '';
      document.title = `Замовлення №${order.orderNumber || externalId}${date}${status} | NK Backoffice`;
      LoggingService.orderAssemblyLog(`📝 Відриваємо замовлення #${order.orderNumber}`);
    }
  }, [order, externalId]);

  // Підготовлюємо дані для комплектації
  const totalPortions = useMemo(() =>
    expandedItems.reduce((sum, item) => sum + item.quantity, 0),
    [expandedItems]
  );
  
  // Обчислюємо середню вагу порції для більш точного розподілу по коробках
  const averagePortionWeight = useMemo(() => {
    if (expandedItems.length === 0 || totalPortions === 0) return 0.33;
    const totalWeight = expandedItems.reduce((sum, item) => sum + item.expectedWeight, 0);
    return totalWeight / totalPortions;
  }, [expandedItems, totalPortions]);

  const orderForAssembly = {
    id: externalId,
    shipping: {
      carrier: order?.shippingMethod || 'Нова Пошта',
      trackingId: order?.ttn || 'Не вказано',
      provider: order?.provider || 'novaposhta',
    },
    items: expandedItems,
    totalPortions: totalPortions,
  };

  const hasItems = order?.items && order.items.length > 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center text-gray-500">
        Замовлення не знайдено
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Модалка підтвердження навігації під час комплектації */}
      <BaseModal
        isOpen={showNavigationConfirmModal}
        title="⚠️ Незавершена комплектація"
        message="У замовленні є зібрані товари. Ви впевнені, що хочете перейти до іншого замовлення? Незбережені зміни будуть втрачені."
        confirmText="Так, перейти"
        confirmColor="warning"
        cancelText="Ні, залишитись"
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
      />
      
      {/* Модалка для помилок SalesDrive */}
      <InfoModal
        isOpen={showErrorModal}
        title="Помилка оновлення статусу в SalesDrive"
        message={errorModalText || 'Невідома помилка'}
        onClose={() => setShowErrorModal(false)}
      />
      <OrderViewHeader
        order={order}
        externalId={externalId || ''}
        onBackClick={() => navigate("/orders")}
      />

      {/* Блок комплектації */}
      <div className="flex flex-col xl:flex-row items-start gap-8 w-full">
        {/* Ліва колонка - Чек-лист комплектації */}
        <div className="w-full max-w-5xl">
          {!hasItems ? (
            <div className="bg-white p-8 rounded-lg shadow text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-600 text-lg mb-2">У замовленні немає товарів</p>
              <p className="text-gray-500">Склад замовлення порожній або не вказаний</p>
            </div>
          ) : expandingSets ? (
            <div className="bg-white p-8 rounded-lg shadow text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Розгортаємо набори товарів...</p>
              <p className="text-sm text-gray-500 mt-2">Це може зайняти кілька секунд</p>
            </div>
          ) : (
            <>
              {/* Попередження про нерозподілені порції */}
              {unallocatedPortions > 0 && (
                <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 mb-4 shadow-lg">
                  <div className="flex items-start gap-3">
                    <DynamicIcon name="alert-triangle" size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-red-900 mb-2">
                        ⚠️ Критична помилка розподілу товарів
                      </h3>
                      <p className="text-red-800 font-semibold mb-2">
                        Не всі товари поміщаються в обрані коробки! Відсутні <strong>{unallocatedPortions} порцій</strong>.
                      </p>
                      <div className="bg-white border border-red-300 rounded p-3 mt-2">
                        <p className="text-sm font-semibold text-red-900 mb-1">Товари, що не поміститься:</p>
                        <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                          {unallocatedItems.map((item, index) => (
                            <li key={index}>
                              <strong>{item.name}</strong> — {item.quantity} порцій
                            </li>
                          ))}
                        </ul>
                      </div>
                      <p className="text-sm text-red-700 mt-3">
                        <strong>Рішення:</strong> Додайте більше коробок або оберіть коробки більшої місткості.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <ErrorBoundary>
              <OrderChecklist
                key={`checklist-${equipmentState.config?.scale?.connectionStrategy}`}
                items={checklistItems}
                totalPortions={orderForAssembly.totalPortions}
                activeBoxIndex={activeBoxIndex}
                onActiveBoxChange={setActiveBoxIndex}
                onItemStatusChange={(itemId, status) => {
                  setChecklistItems(prevItems =>
                    prevItems.map(item => {
                      if (item.id === itemId) {
                        return { ...item, status: 'pending' };
                      }
                      if (item.status === 'pending' && (item.boxIndex || 0) === activeBoxIndex) {
                        return { ...item, status: 'default' };
                      }
                      return item;
                    })
                  );
                  startActivePolling();
                }}
                onPrintTTN={() => handlePrintTTN(order)}
                showPrintTTN={showPrintTTN}
                wasOpenedAsReady={wasOpenedAsReady}
                onNextOrder={handleNextOrder}
                showNextOrder={showNextOrder}
                nextOrderNumber={nextOrderNumber}
                nextOrderDate={nextOrderDate}
                showNoMoreOrders={showNoMoreOrders}
              />
            </ErrorBoundary>
            </>
          )}
        </div>

        {/* Права колонка - Панель керування */}
        <OrderAssemblyRightPanel
          orderForAssembly={orderForAssembly}
          averagePortionWeight={averagePortionWeight}
          getWeightData={getWeightData}
          handleWeightChange={handleWeightChange}
          isWeightWidgetActive={isWeightWidgetActive}
          isWeightWidgetPaused={isWeightWidgetPaused}
          pollingMode={pollingMode}
          handlePollingModeChange={handlePollingModeChange}
          handleBoxesChange={handleBoxesChange}
          activeBoxIndex={activeBoxIndex}
          setActiveBoxIndex={setActiveBoxIndex}
          hasItems={hasItems}
          expandingSets={expandingSets}
          onPrintTTN={() => handlePrintTTN(order)}
          order={order}
          externalId={externalId || ''}
          onOrderRefresh={(updatedOrder) => {
            console.log('🔄 [OrderView] Order refreshed, updating state:', updatedOrder);
            setOrder(updatedOrder);
          }}
        />
      </div>

      {/* Наступне / Попереднє замовлення */}
      <div className="flex justify-between border-t border-gray-300 pt-16 mt-20 mb-4">
        <Button
          color="secondary"
          variant="flat"
          className="text-neutral-500 min-w-fit"
          onPress={handleNavigateToPrevious}
          isDisabled={!hasPreviousOrder}
        >
          <DynamicIcon name="arrow-left" size={20} /> 
          {order?.previousOrderNumber ? `Замовлення №${order.previousOrderNumber}` : 'Попереднє замовлення'}
        </Button>
        
        {hasNextOrder && (
        <Button
          color="secondary"
          variant="flat"
          className="text-neutral-500 min-w-fit"
          onPress={handleNavigateToNext}
          isDisabled={!hasNextOrder}
        >
          {order?.nextOrderNumber ? `Замовлення №${order.nextOrderNumber}` : 'Наступне замовлення'} 
          <DynamicIcon name="arrow-right" size={20} /> 
        </Button>
        )}
      </div>

      {/* Блок деталей замовлення */}
      {(user && ['admin'].includes(user.role) && isDebugMode) && (
        <OrderDetailsAdmin order={order} externalId={externalId || ''} />
      )}
    </div>
  );
}
