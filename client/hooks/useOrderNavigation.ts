import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { shippingClientService } from '../services/ShippingService';
import { formatDate } from '../lib/formatUtils';

interface UseOrderNavigationProps {
  externalId: string | undefined;
  id: number;
  apiCall: (url: string, options?: RequestInit) => Promise<Response>;
  equipmentConfig: any;
  previousOrderExternalId?: string | null;
  nextOrderExternalId?: string | null;
  checklistItems?: any[];
  orderStatus?: string;
  onUpdateOrderStatus?: (status: string, statusText: string) => void; // Callback для локального оновлення статусу
}

export function useOrderNavigation({
  externalId,
  id,
  apiCall,
  equipmentConfig,
  previousOrderExternalId,
  nextOrderExternalId,
  checklistItems = [],
  orderStatus,
  onUpdateOrderStatus
}: UseOrderNavigationProps) {
  const navigate = useNavigate();

  const [isPrintingTTN, setIsPrintingTTN] = useState(false);
  const [showPrintTTN, setShowPrintTTN] = useState(false);
  const [isLoadingNextOrder, setIsLoadingNextOrder] = useState(false);
  const [isLoadingNextOrderNumber, setIsLoadingNextOrderNumber] = useState(false);
  const [showNextOrder, setShowNextOrder] = useState(false);
  const [nextOrderNumber, setNextOrderNumber] = useState<string | undefined>();
  const [nextOrderDate, setNextOrderDate] = useState<string | undefined>();
  const [showNoMoreOrders, setShowNoMoreOrders] = useState(false);
  // Стан для модалки помилки
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalText, setErrorModalText] = useState<string | null>(null);
  // Стан для модалки підтвердження навігації під час комплектації
  const [showNavigationConfirmModal, setShowNavigationConfirmModal] = useState(false);
  const [pendingNavigationAction, setPendingNavigationAction] = useState<'previous' | 'next' | null>(null);

  // Скидаємо всі стани при зміні замовлення (externalId)
  useEffect(() => {
    setShowPrintTTN(false);
    setShowNextOrder(false);
    setNextOrderNumber(undefined);
    setNextOrderDate(undefined);
    setShowNoMoreOrders(false);
    setShowNavigationConfirmModal(false);
    setPendingNavigationAction(null);
  }, [externalId]);

  /**
   * Універсальна функція для отримання наступного замовлення з розумною логікою пошуку
   */
  const getNextOrder = useCallback(async () => {
    if (!externalId) return null;

    try {
      // Отримуємо список замовлень в статусі 2 (Підтверджено), відсортований за датою (нові спочатку)
      const response = await apiCall('/api/orders?limit=100&sortBy=orderDate&sortOrder=asc&status=2&fields=id,externalId,orderDate,status');

      if (!response.ok) {
        console.warn('⚠️ [useOrderNavigation] Не вдалося отримати список замовлень');
        return null;
      }

      const ordersData = await response.json();
      const orders = ordersData.data;

      if (orders.length === 0) {
        console.warn('⚠️ [useOrderNavigation] Немає замовлень для переходу');
        return null;
      } else {
        console.log('🔍 [useOrderNavigation] \nДоступні замовлення в статусі "Підтверджено":', orders);
      }

      // Статус поточного замовлення
      const currentOrderResponse = await apiCall(`/api/orders/${externalId}`);
      if (!currentOrderResponse.ok) {
        console.warn('⚠️ [useOrderNavigation] Не вдалося отримати поточне замовлення');
        return null;
      } else {
        const currentOrderData = await currentOrderResponse.json();
        console.log(`🔍 [useOrderNavigation] \nПоточне замовлення #${externalId}, статус:`, currentOrderData.data.status, `(${currentOrderData.data.statusText})`);
      }

      // Знаходимо поточне замовлення у відфільтрованому списку
      const currentOrderIndex = orders.findIndex((order: any) => order.externalId === externalId);

      let nextOrder = null;

      // Якщо поточне замовлення не знайдено, вибираємо перше доступне замовлення (старіше)
      if (currentOrderIndex === -1) {
        nextOrder = orders[0];
        console.warn('🔍 [useOrderNavigation] \nПоточне замовлення не знайдено в списку підтверджених замовлень');
        return 'out-of-list';
      } else {
        // Спочатку шукаємо новіше замовлення
        if (currentOrderIndex < orders.length - 1) {
          nextOrder = orders[currentOrderIndex + 1];
        } else {
          // Якщо немає новіших, шукаємо старіше
          if (currentOrderIndex > 0) {
            nextOrder = orders[currentOrderIndex - 1];
          } else {
            // Якщо це єдине замовлення — немає наступного
            return null;
          }
        }
      }

      console.log('🔍 [useOrderNavigation] \nНаступне замовлення:', nextOrder);
      return {
        ...nextOrder,
        formattedDate: nextOrder.orderDate ? formatDate(nextOrder.orderDate) : null
      };
    } catch (error) {
      console.error('❌ [useOrderNavigation] Помилка отримання наступного замовлення:', error);
      return null;
    }
  }, [externalId, apiCall]);

  /**
   * Допоміжна функція: оновити статус поточного замовлення до "3" (Готове до відправки)
   * 
   * Логіка:
   * 1. Спочатку оновлюємо локальний стан (оптимістичне оновлення) → UI зміниться одразу
   * 2. Потім відправляємо запит до SalesDrive в тлі (не блокуємо UI)
   * 3. Якщо запит не пройде — користувач потім зі сервера отримає правильний статус
   */
  const updateCurrentOrderStatusToReady = useCallback(async () => {
    if (!id) return;

    const statusUrl = `/api/orders/${id}/status`;
    const statusPayload = { status: '3' };

    try {
      // 1️⃣ СПОЧАТКУ: Отримуємо поточний статус з сервера (без PUT)
      const response = await apiCall(statusUrl);
      if (!response.ok) {
        console.warn('⚠️ [useOrderNavigation] Не вдалося отримати поточний статус замовлення');
        return;
      }

      const { status } = await response.json();
      if (status !== '2') {
        console.warn(
          `⚠️ [useOrderNavigation] Замовлення має статус "${status}", пропускаємо оновлення`
        );
        return;
      }

      // 2️⃣ ОДРАЗУ: Оновлюємо локальний стан (оптимістичне оновлення)
      // Це забезпечує миттєву зміну UI без очікування відповіді від SalesDrive
      if (onUpdateOrderStatus) {
        onUpdateOrderStatus('3', 'На відправку');
      }

      // 3️⃣ ПОТІМ: Відправляємо запит до SalesDrive в тлі (не блокуємо UI)
      const statusResponse = await apiCall(statusUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusPayload),
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        setErrorModalText(errorText || 'Не вдалося оновити статус в SalesDrive');
        setShowErrorModal(true);
        console.warn('⚠️ [useOrderNavigation] Не вдалося оновити статус в SalesDrive:', errorText);
        return;
      }

      const statusData = await statusResponse.json();
      if (statusData.success) {
        console.log('✅ [useOrderNavigation] Статус замовлення оновлено в SalesDrive на "3" (Готове до відправлення)');
      } else {
        console.warn('⚠️ [useOrderNavigation] Помилка при оновленні статусу:', statusData.error);
      }
    } catch (error) {
      setErrorModalText('Помилка зʼєднання з сервером');
      setShowErrorModal(true);
      console.error('❌ [useOrderNavigation] Помилка оновлення статусу поточного замовлення:', error);
    }
  }, [id, apiCall, onUpdateOrderStatus]);

  /**
   * Функція для отримання номера наступного замовлення
   */
  const fetchNextOrderNumber = useCallback(async () => {
    if (isLoadingNextOrderNumber) {
      console.log('🔄 [useOrderNavigation] fetchNextOrderNumber вже виконується, пропускаємо виклик');
      return;
    }

    try {
      setIsLoadingNextOrderNumber(true);
      const nextOrder = await getNextOrder();
      if (nextOrder) {
        setNextOrderNumber(nextOrder.externalId);
        setNextOrderDate(nextOrder.formattedDate);
        setShowNoMoreOrders(false);
      } else {
        setShowNoMoreOrders(true);
        await updateCurrentOrderStatusToReady();
      }
    } finally {
      setIsLoadingNextOrderNumber(false);
    }
  }, [isLoadingNextOrderNumber, getNextOrder, updateCurrentOrderStatusToReady]);

  /**
   * Функція для друку ТТН
   */
  const handlePrintTTN = useCallback(async (order: any) => {
    // console.log('🖨️ [useOrderNavigation] handlePrintTTN викликано');

    setTimeout(() => {
      // console.log('🖨️ [useOrderNavigation] setTimeout виконується');
      setShowNextOrder(true);
      // Отримуємо номер наступного замовлення
      fetchNextOrderNumber();
    }, 1000);

    if (!order?.ttn || !order?.provider) {
      alert('ТТН або провайдер не знайдені в даних замовлення');
      return;
    }

    if (isPrintingTTN) {
      console.log('🖨️ [useOrderNavigation] handlePrintTTN пропущено - вже друкується');
      return;
    }

    try {
      setIsPrintingTTN(true);

      // Забороняємо прямий друк у dev режимі
      const isDev = typeof process !== "undefined" && process.env.NODE_ENV === 'development';
      const canUseDirectPrint = equipmentConfig?.printer?.enabled && equipmentConfig?.printer?.name && !isDev;

      await shippingClientService.printTTN({
        ttn: order.ttn,
        provider: order.provider,
        senderId: order.rawData.ord_delivery_data?.[0]?.senderId || 1,
        printerName: canUseDirectPrint ? equipmentConfig.printer.name : undefined
      });

    } catch (error) {
      console.error('❌ Помилка друку ТТН:', error);
      const errorMessage = error instanceof Error ? error.message : 'Невідома помилка';
      alert(`Помилка друку ТТН: ${errorMessage}`);
    } finally {
      setIsPrintingTTN(false);
    }
  }, [isPrintingTTN, equipmentConfig, fetchNextOrderNumber]);

  /**
   * Функція для переходу до наступного замовлення
   */
  const handleNextOrder = useCallback(async () => {
    if (!externalId || isLoadingNextOrder) {
      return;
    }

    try {
      setIsLoadingNextOrder(true);

      // 1. Отримуємо наступне замовлення
      const nextOrder = await getNextOrder();

      if (nextOrder === 'out-of-list') {
        throw new Error('Поточне замовлення не знайдено в списку підтверджених замовлень');
      }

      if (!nextOrder) {
        // Якщо наступного немає — завершуємо поточне як готове і показуємо банер
        setShowNoMoreOrders(true);
        throw new Error('Не знайдено наступного замовлення зі статусом 2 (Підтверджено)');
      }

      // 2. Змінюємо статус поточного замовлення на "3" (Готове до відправки)
      await updateCurrentOrderStatusToReady();

      // 3. Переходимо до наступного замовлення без перезавантаження сторінки
      const nextOrderUrl = `/orders/${nextOrder.externalId}`;
      navigate(nextOrderUrl);

      // Скидаємо стан кнопки для наступного замовлення
      setShowNextOrder(false);
      setNextOrderNumber(undefined);
      setNextOrderDate(undefined);
      setShowNoMoreOrders(false);

    } catch (error) {
      console.error('❌ [useOrderNavigation] Помилка переходу до наступного замовлення:', error);
      alert(`Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    } finally {
      setIsLoadingNextOrder(false);
    }
  }, [externalId, isLoadingNextOrder, navigate, getNextOrder, updateCurrentOrderStatusToReady]);

  /**
   * Перевірка чи є зібрані товари в чеклисті
   * Перевірка виконується тільки для замовлень зі статусом "2" (Підтверджено)
   */
  const hasCollectedItems = useCallback(() => {
    // Якщо статус не "2" (Підтверджено), не перевіряємо зібрані товари
    if (orderStatus !== '2') {
      return false;
    }
    
    return checklistItems.some(item => 
      item.status === 'done' || item.status === 'success'
    );
  }, [checklistItems, orderStatus]);

  /**
   * Проста навігація до попереднього замовлення (без зміни статусу)
   */
  const handleNavigateToPrevious = useCallback(() => {
    if (!previousOrderExternalId) return;

    // Якщо є зібрані товари, показуємо модалку підтвердження
    if (hasCollectedItems()) {
      setPendingNavigationAction('previous');
      setShowNavigationConfirmModal(true);
      return;
    }

    // Інакше просто переходимо
    navigate(`/orders/${previousOrderExternalId}`);
  }, [previousOrderExternalId, navigate, hasCollectedItems]);

  /**
   * Проста навігація до наступного замовлення (без зміни статусу)
   */
  const handleNavigateToNext = useCallback(() => {
    if (!nextOrderExternalId) return;

    // Якщо є зібрані товари, показуємо модалку підтвердження
    if (hasCollectedItems()) {
      setPendingNavigationAction('next');
      setShowNavigationConfirmModal(true);
      return;
    }

    // Інакше просто переходимо
    navigate(`/orders/${nextOrderExternalId}`);
  }, [nextOrderExternalId, navigate, hasCollectedItems]);

  /**
   * Підтвердження навігації (після показу модалки)
   */
  const confirmNavigation = useCallback(() => {
    setShowNavigationConfirmModal(false);
    
    if (pendingNavigationAction === 'previous' && previousOrderExternalId) {
      navigate(`/orders/${previousOrderExternalId}`);
    } else if (pendingNavigationAction === 'next' && nextOrderExternalId) {
      navigate(`/orders/${nextOrderExternalId}`);
    }
    
    setPendingNavigationAction(null);
  }, [pendingNavigationAction, previousOrderExternalId, nextOrderExternalId, navigate]);

  /**
   * Скасування навігації
   */
  const cancelNavigation = useCallback(() => {
    setShowNavigationConfirmModal(false);
    setPendingNavigationAction(null);
  }, []);

  // Реактивне обчислення наявності попереднього/наступного замовлення
  const hasPreviousOrder = useMemo(() => !!previousOrderExternalId, [previousOrderExternalId]);
  const hasNextOrder = useMemo(() => !!nextOrderExternalId, [nextOrderExternalId]);

  return {
    isPrintingTTN,
    showPrintTTN,
    setShowPrintTTN,
    isLoadingNextOrder,
    showNextOrder,
    nextOrderNumber,
    nextOrderDate,
    showNoMoreOrders,
    handlePrintTTN,
    handleNextOrder,
    fetchNextOrderNumber,
    getNextOrder,
    showErrorModal,
    setShowErrorModal,
    errorModalText,
    setErrorModalText,
    // Прості функції навігації
    handleNavigateToPrevious,
    handleNavigateToNext,
    hasPreviousOrder,
    hasNextOrder,
    // Модалка підтвердження навігації
    showNavigationConfirmModal,
    confirmNavigation,
    cancelNavigation
  };
}

