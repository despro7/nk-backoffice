import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { shippingClientService } from '../services/ShippingService';
import { formatDate } from '../lib/formatUtils';

interface UseOrderNavigationProps {
  externalId: string | undefined;
  apiCall: (url: string, options?: RequestInit) => Promise<Response>;
  equipmentConfig: any;
}

export function useOrderNavigation({
  externalId,
  apiCall,
  equipmentConfig
}: UseOrderNavigationProps) {
  const navigate = useNavigate();
  
  const [isPrintingTTN, setIsPrintingTTN] = useState(false);
  const [showPrintTTN, setShowPrintTTN] = useState(false);
  const [isLoadingNextOrder, setIsLoadingNextOrder] = useState(false);
  const [showNextOrder, setShowNextOrder] = useState(false);
  const [nextOrderNumber, setNextOrderNumber] = useState<string | undefined>();
  const [nextOrderDate, setNextOrderDate] = useState<string | undefined>();
  const [showNoMoreOrders, setShowNoMoreOrders] = useState(false);

  /**
   * Універсальна функція для отримання наступного замовлення з розумною логікою пошуку
   */
  const getNextOrder = useCallback(async () => {
    if (!externalId) return null;

    try {      
      // Отримуємо список замовлень в статусі 2 (Підтверджено), відсортований за датою (нові спочатку)
      const response = await apiCall('/api/orders?limit=100&sortBy=orderDate&sortOrder=desc&status=2&fields=id,externalId,orderDate,status');
      
      if (!response.ok) {
        console.warn('⚠️ [useOrderNavigation] Не вдалося отримати список замовлень');
        return null;
      }

      const ordersData = await response.json();
      const orders = ordersData.data;
      
      console.log('🔍 [useOrderNavigation] Отримані замовлення:', orders);
      
      if (orders.length === 0) {
        console.warn('⚠️ [useOrderNavigation] Немає замовлень для переходу');
        return null;
      }
      
      // Знаходимо поточне замовлення у відфільтрованому списку
      const currentOrderIndex = orders.findIndex((order: any) => order.externalId === externalId);

      console.log('🔍 [useOrderNavigation] Поточне замовлення:', currentOrderIndex);
      
      if (currentOrderIndex === -1) {
        console.warn('⚠️ [useOrderNavigation] Поточне замовлення не знайдено в відфільтрованому списку');
        return null;
      }

      // Розумна логіка пошуку наступного замовлення:
      // 1. Спочатку шукаємо наступне за датою (новіше)
      // 2. Якщо немає, шукаємо попереднє за датою (старіше)
      let nextOrder = null;

      // 1. Шукаємо наступне за датою (новіше замовлення)
      if (currentOrderIndex > 0) {
        nextOrder = orders[currentOrderIndex - 1]; // Новіше замовлення (індекс менший)
      } else {
        // 2. Якщо немає новіших, шукаємо попереднє за датою (старіше)
        if (currentOrderIndex < orders.length - 1) {
          nextOrder = orders[currentOrderIndex + 1]; // Старіше замовлення (індекс більший)
        } else {
          return null;
        }
      }

		  console.log('🔍 [useOrderNavigation] Наступне замовлення:', nextOrder);
      
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
	 * Допоміжна функція: оновити статус поточного замовлення до "id3" (Готове до відправки)
	 */
	const updateCurrentOrderStatusToReady = useCallback(async () => {
		if (!externalId) return;
		const statusPayload = { status: 'id3' };
		try {
			const statusResponse = await apiCall(`/api/orders/${externalId}/status`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(statusPayload),
			});

			if (!statusResponse.ok) {
				const errorText = await statusResponse.text();
				console.warn('⚠️ [useOrderNavigation] Не вдалося оновити статус в SalesDrive:', errorText);
				return;
			}

			const statusData = await statusResponse.json();
			if (statusData.success) {
				if (statusData.salesDriveUpdated) {
					console.log('✅ [useOrderNavigation] Статус замовлення оновлено в SalesDrive на "id3" (Готове до відправлення)');
				} else {
					console.warn('⚠️ [useOrderNavigation] Статус оновлено локально, але не вдалося оновити в SalesDrive');
				}
			} else {
				console.warn('⚠️ [useOrderNavigation] Помилка при оновленні статусу:', statusData.error);
			}
		} catch (error) {
			console.error('❌ [useOrderNavigation] Помилка оновлення статусу поточного замовлення:', error);
		}
	}, [externalId, apiCall]);

  /**
   * Функція для друку ТТН
   */
  const handlePrintTTN = useCallback(async (order: any) => {
    if (!order?.ttn || !order?.provider) {
      alert('ТТН або провайдер не знайдені в даних замовлення');
      return;
    }

    if (isPrintingTTN) {
      return;
    }

    try {
      setIsPrintingTTN(true);

      // Забороняємо прямий друк у dev режимі
      const isDev = typeof process !== "undefined" && process.env.NODE_ENV === 'development';
      const canUseDirectPrint = equipmentConfig?.printer?.enabled && equipmentConfig?.printer?.name && !isDev;

      await shippingClientService.printTTN({
        ttn: order.ttn,
        printerName: canUseDirectPrint ? equipmentConfig.printer.name : undefined
      });

      setTimeout(() => {
        setShowNextOrder(true);
        // Отримуємо номер наступного замовлення
        fetchNextOrderNumber();
      }, 1000);

    } catch (error) {
      console.error('❌ Помилка друку ТТН:', error);
      const errorMessage = error instanceof Error ? error.message : 'Невідома помилка';
      alert(`Помилка друку ТТН: ${errorMessage}`);
    } finally {
      setIsPrintingTTN(false);
    }
  }, [isPrintingTTN, equipmentConfig]);

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
      
      if (!nextOrder) {
        // Якщо наступного немає — завершуємо поточне як готове і показуємо банер
        setShowNoMoreOrders(true);
        throw new Error('Не знайдено наступного замовлення зі статусом 2 (Підтверджено)');
        return;
      }

			// 2. Змінюємо статус поточного замовлення на "id3" (Готове до відправки)
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
  }, [externalId, isLoadingNextOrder, navigate, getNextOrder, apiCall]);

  /**
   * Функція для отримання номера наступного замовлення
   */
	const fetchNextOrderNumber = useCallback(async () => {
    const nextOrder = await getNextOrder();
    if (nextOrder) {
      setNextOrderNumber(nextOrder.externalId);
      setNextOrderDate(nextOrder.formattedDate);
      setShowNoMoreOrders(false);
    } else {
      setShowNoMoreOrders(true);
      await updateCurrentOrderStatusToReady();
    }
	}, [getNextOrder, updateCurrentOrderStatusToReady]);

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
    getNextOrder
  };
}

