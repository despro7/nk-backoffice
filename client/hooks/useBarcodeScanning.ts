import { useCallback, useRef, useState } from 'react';
import type { OrderChecklistItem } from '../types/orderAssembly';
import { addToast } from '@heroui/toast';

interface UseBarcodeScanningProps {
  checklistItems: OrderChecklistItem[];
  activeBoxIndex: number;
  setChecklistItems: React.Dispatch<React.SetStateAction<OrderChecklistItem[]>>;
  debugMode?: boolean;
}

const SCAN_COUNTDOWN = 2000; // 2 секунди між скануваннями
const TOAST_COUNTDOWN = 3000; // 3 секунди між однаковими сповіщеннями

export function useBarcodeScanning({
  checklistItems,
  activeBoxIndex,
  setChecklistItems,
  debugMode = false
}: UseBarcodeScanningProps) {
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number>(() => Date.now() - 3000);
  
  // Ref для зберігання останнього обробленого коду (щоб уникнути повторної обробки)
  const lastProcessedCodeRef = useRef<string>('');
  const lastProcessedTimestampRef = useRef<number>(0);
  
  // Запобігання дублікації toast сповіщень
  const lastToastTimestampsRef = useRef<Record<string, number>>({});
  const activeToastsRef = useRef<Set<string>>(new Set());
  
  // useRef для зберігання актуальних значень без залежностей
  const checklistItemsRef = useRef<OrderChecklistItem[]>([]);
  const activeBoxIndexRef = useRef<number>(0);

  // Синхронізуємо ref з актуальними значеннями
  checklistItemsRef.current = checklistItems;
  activeBoxIndexRef.current = activeBoxIndex;

  /**
   * Функція для показу toast з запобіганням дублікації
   */
  const showToastWithCountdown = useCallback((options: Parameters<typeof addToast>[0], toastKey: string) => {
    const currentTime = Date.now();
    const lastToastTime = lastToastTimestampsRef.current[toastKey] || 0;
    const timeSinceLastToast = currentTime - lastToastTime;

    // Перевіряємо, чи не показується вже такий toast
    if (activeToastsRef.current.has(toastKey)) {
      console.log(`🚫 Toast "${toastKey}" вже активний, пропускаємо`);
      return;
    }

    // У режимі налагодження або якщо минуло достатньо часу - показуємо toast
    if (debugMode || timeSinceLastToast >= TOAST_COUNTDOWN) {
      console.log(`🍞 Показуємо toast "${toastKey}" (пройшло ${timeSinceLastToast}мс)`);

      // Додаємо унікальний ID до toast, щоб уникнути дублювання в HeroUI
      const uniqueId = `${toastKey}-${currentTime}-${Math.random().toString(36).substr(2, 9)}`;
      const toastWithId = {
        ...options,
        id: uniqueId
      };

      // Позначаємо toast як активний
      activeToastsRef.current.add(toastKey);

      addToast(toastWithId);
      lastToastTimestampsRef.current[toastKey] = currentTime;

      // Прибираємо з активних через timeout (трохи більше ніж час життя toast)
      const cleanupTimeout = (options.timeout || 10000) + 1000;
      setTimeout(() => {
        activeToastsRef.current.delete(toastKey);
        console.log(`🧹 Toast "${toastKey}" видалений з активних`);
      }, cleanupTimeout);
    } else {
      console.log(`🚫 Toast "${toastKey}" пропущений (залишилось ${TOAST_COUNTDOWN - timeSinceLastToast}мс)`);
    }
  }, [debugMode]);

  /**
   * Функція скидання стану сканування
   */
  const resetScanState = useCallback(() => {
    setLastScannedCode('');
    setLastScanTimestamp(Date.now());
    // Скидаємо ref щоб наступний скан пройшов
    lastProcessedCodeRef.current = '';
    lastProcessedTimestampRef.current = 0;
    console.log('🔄 [useBarcodeScanning] Стан сканування скинуто');
    addToast({
      title: "Стан скинуто",
      description: "Система готова до нового сканування",
      color: "primary",
      timeout: 2000
    });
  }, []);

  /**
   * Мемоізована функція обробки сканування
   */
  const handleBarcodeScan = useCallback((scannedCode: string) => {
    const currentTime = Date.now();

    // Перевіряємо, чи не обробляли ми вже цей код
    const isAlreadyProcessed = scannedCode === lastProcessedCodeRef.current &&
                               currentTime - lastProcessedTimestampRef.current < SCAN_COUNTDOWN;

    if (isAlreadyProcessed && !debugMode) {
      console.log('⏳ [useBarcodeScanning] Код уже обработан недавно:', scannedCode);
      return;
    }

    // Оновлюємо ref
    lastProcessedCodeRef.current = scannedCode;
    lastProcessedTimestampRef.current = currentTime;

    // Оновлюємо стан для сумісності з іншим кодом
    setLastScanTimestamp(currentTime);
    setLastScannedCode(scannedCode);

    console.log('📱 [useBarcodeScanning] Новое сканирование:', scannedCode);

    // Отримуємо актуальні дані з ref
    const currentChecklistItems = checklistItemsRef.current;
    const currentActiveBoxIndex = activeBoxIndexRef.current;

    // Перевіряємо, чи зважена поточна коробка
    const currentBox = currentChecklistItems.find(item =>
      item.type === 'box' && (item.boxIndex || 0) === currentActiveBoxIndex
    );

    console.log('🔍 [useBarcodeScanning] Проверка статуса коробки:', {
      activeBoxIndex: currentActiveBoxIndex,
      currentBoxFound: !!currentBox,
      currentBoxStatus: currentBox?.status,
      currentBoxName: currentBox?.name
    });

    // Якщо коробка не зважена, ігноруємо сканування
    const isBoxWeighed = currentBox?.status === 'done';

    if (!isBoxWeighed) {
      console.log('🚫 [useBarcodeScanning] Сканирование заблокировано - коробка не взвешена');
      showToastWithCountdown({
        title: "Спочатку зважте коробку",
        description: "Не можна сканувати товари, поки коробка не буде зважена",
        color: "warning",
        timeout: 3000
      }, "box-not-weighed");
      return;
    }

    // Шукаємо товар по SKU
    const foundItem = currentChecklistItems.find(item => item.sku === scannedCode);

    if (foundItem) {
      console.log('✅ [useBarcodeScanning] Найден товар:', foundItem.name);

      // Перевіряємо, чи не має товар вже статус 'done' - ЗАБОРОНЯЄМО сканування
      if (foundItem.status === 'done') {
        console.log('🚫 [useBarcodeScanning] Запрещено сканировать товар в статусе done:', foundItem.name);
        showToastWithCountdown({
          title: "Сканування заборонено",
          description: `${foundItem.name} вже завершено - сканування заборонено`,
          color: "danger",
          timeout: 3000
        }, `scan-forbidden-${foundItem.id}`);
        return;
      }

      // Перевіряємо, що товар не в статусі 'awaiting_confirmation' (коробки)
      if (foundItem.type === 'box' && foundItem.status !== 'awaiting_confirmation') {
        console.log('🚫 [useBarcodeScanning] Коробки не сканируются, кроме awaiting_confirmation:', foundItem.name);
        showToastWithCountdown({
          title: "Сканування заборонено",
          description: "Коробки не можна сканувати",
          color: "warning",
          timeout: 3000
        }, `box-scan-forbidden-${foundItem.id}`);
        return;
      }

      // Перевіряємо, що товар знаходиться в активній коробці
      if ((foundItem.boxIndex || 0) !== currentActiveBoxIndex) {
        console.log('🚫 [useBarcodeScanning] Товар не в активной коробке:', foundItem.name);
        showToastWithCountdown({
          title: "Неправильна коробка",
          description: `${foundItem.name} не в поточній коробці`,
          color: "warning",
          timeout: 3000
        }, `wrong-box-${foundItem.id}`);
        return;
      }

      // ТОЧНО ТАКА Ж ЛОГІКА ЯК В handleItemClick:
      // 1. Встановлюємо статус 'pending' для знайденого товару
      setChecklistItems(prevItems =>
        prevItems.map(item => {
          if (item.id === foundItem.id) {
            return { ...item, status: 'pending' as const };
          }
          // 2. Скидаємо статус інших елементів в default тільки в активній коробці
          if (item.status === 'pending' && (item.boxIndex || 0) === currentActiveBoxIndex) {
            return { ...item, status: 'default' as const };
          }
          return item;
        })
      );

      // Показываем уведомление
      addToast({
        title: "Штрих-код відскановано",
        description: `${foundItem.name} вибрано для комплектації`,
        color: "success",
        timeout: 2000
      });

    } else {
      console.log('❌ [useBarcodeScanning] Товар не найден:', scannedCode);

      // Показываем уведомление об ошибке
      showToastWithCountdown({
        title: "Товар не знайдено",
        description: `Штрих-код ${scannedCode} не відповідає жодному товару`,
        color: "warning",
        timeout: 3000
      }, `item-not-found-${scannedCode}`);
    }
  }, [debugMode, showToastWithCountdown, setChecklistItems]);

  return {
    handleBarcodeScan,
    resetScanState,
    lastScannedCode,
    lastScanTimestamp
  };
}

