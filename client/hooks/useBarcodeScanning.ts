import { useCallback, useRef, useState } from 'react';
import type { OrderChecklistItem } from '../types/orderAssembly';
import { addToast } from '@heroui/toast';
import { DynamicIcon } from "lucide-react/dynamic";
import { ToastService } from '@/services/ToastService';

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
      console.log('⏳ [useBarcodeScanning] Код вже оброблений нещодавно:', scannedCode);
      return;
    }

    // Оновлюємо ref
    lastProcessedCodeRef.current = scannedCode;
    lastProcessedTimestampRef.current = currentTime;

    // Оновлюємо стан для сумісності з іншим кодом
    setLastScanTimestamp(currentTime);
    setLastScannedCode(scannedCode);

    console.log('📱 [useBarcodeScanning] Нове сканування:', scannedCode);

    // Отримуємо актуальні дані з ref
    const currentChecklistItems = checklistItemsRef.current;
    const currentActiveBoxIndex = activeBoxIndexRef.current;

    // Перевіряємо, чи є активний pending статус в поточній коробці
    const hasPendingItem = currentChecklistItems.some(item => 
      item.status === 'pending' && (item.boxIndex || 0) === currentActiveBoxIndex
    );

    if (hasPendingItem) {
      console.log('🚫 [useBarcodeScanning] Заборонено сканувати - є активний pending статус');
      ToastService.show({
        title: "Сканування заборонено",
        description: "Завершіть поточну операцію перед новим скануванням",
        color: "danger",
        icon: "alert-triangle",
        hideIcon: false,
        timeout: 3000
      });
      return;
    }

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

    // 1️⃣ СПОЧАТКУ ШУКАЄМО КОРОБКУ (якщо коробка ще не відсканована/не зважена)
    let foundItem: OrderChecklistItem | undefined;

    if (currentBox?.status === 'default') {
      // Шукаємо коробку по barcode
      foundItem = currentChecklistItems.find(item => 
        item.type === 'box' && 
        item.boxSettings?.barcode === scannedCode &&
        (item.boxIndex || 0) === currentActiveBoxIndex
      );
      
      if (foundItem) {
        console.log('📦 [useBarcodeScanning] Знайдена коробка по barcode:', foundItem.name, scannedCode);
      } else {
        console.log('🔍 [useBarcodeScanning] Коробка по barcode не знайдена, очікується сканування коробки');
      }
    }

    // 2️⃣ ЯКЩО КОРОБКА НЕ ЗНАЙДЕНА І КОРОБКА ЗВАЖЕНА - ШУКАЄМО ТОВАР
    if (!foundItem && currentBox?.status === 'done') {
      // Спочатку шукаємо по barcode, потім fallback на SKU
      foundItem = currentChecklistItems.find(item => 
        item.type === 'product' && 
        (item.barcode === scannedCode || item.sku === scannedCode) &&
        (item.boxIndex || 0) === currentActiveBoxIndex
      );
      
      if (foundItem) {
        console.log('✅ [useBarcodeScanning] Знайдений товар:', foundItem.name, 
          foundItem.barcode === scannedCode ? '(по barcode)' : '(по SKU)');
      }
    }

    if (foundItem) {

      // Перевіряємо, чи не має товар вже статус 'done' - ЗАБОРОНЯЄМО сканування
      if (foundItem.status === 'done') {
        console.log('🚫 [useBarcodeScanning] Запрещено сканировать товар в статусе done:', foundItem.name);
        ToastService.show({
          title: "Сканування заборонено",
          description: `${foundItem.name} вже завершено - сканування заборонено`,
          color: "danger",
          icon: "alert-triangle",
          hideIcon: false,
          timeout: 3000
        });
        return;
      }

      // Перевіряємо, що коробку можна сканувати тільки в статусі 'default'
      if (foundItem.type === 'box' && foundItem.status !== 'default') {
        console.log('🚫 [useBarcodeScanning] Коробку можна сканувати тільки в статусі default:', foundItem.name);
        ToastService.show({
          title: "Сканування заборонено",
          description: "Коробку вже відсканована або завершена",
          color: "warning",
          icon: "alert-triangle",
          hideIcon: false,
          timeout: 3000
        });
        return;
      }

      // Якщо це коробка в статусі 'default' - переводимо її в 'pending'
      if (foundItem.type === 'box' && foundItem.status === 'default') {
        console.log('✅ [useBarcodeScanning] Коробка відсканована, переводимо в статус pending:', foundItem.name);
        setChecklistItems(prevItems =>
          prevItems.map(item => {
            if (item.id === foundItem.id) {
              return { ...item, status: 'pending' as const };
            }
            return item;
          })
        );

        // Показуємо повідомлення про успішне сканування коробки
        ToastService.show({
          title: "Коробка відсканована",
          description: `${foundItem.name} готова до зважування`,
          color: "success",
          hideIcon: false,
          timeout: 2000
        });
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
      ToastService.show({
        title: "Штрих-код відскановано",
        description: `${foundItem.name} вибрано для комплектації`,
        color: "success",
        hideIcon: false,
        timeout: 2000
      });

    } else {
      console.log('❌ [useBarcodeScanning] Товар/коробка не знайдені:', scannedCode);

      // Показуємо повідомлення залежно від статусу коробки
      const isAwaitingBox = currentBox?.status === 'default';
      const isAwaitingProduct = currentBox?.status === 'done';

      if (isAwaitingBox) {
        showToastWithCountdown({
          title: "Коробка не знайдена",
          description: `Штрих-код ${scannedCode} не відповідає коробці №${currentActiveBoxIndex + 1}`,
          color: "warning",
          timeout: 3000
        }, `box-not-found-${scannedCode}`);
      } else if (isAwaitingProduct) {
        showToastWithCountdown({
          title: "Товар не знайдено",
          description: `Штрих-код ${scannedCode} не відповідає жодному товару в цій коробці`,
          color: "warning",
          timeout: 3000
        }, `item-not-found-${scannedCode}`);
      } else {
        showToastWithCountdown({
          title: "Товар не знайдено",
          description: `Штрих-код ${scannedCode} не розпізнано`,
          color: "warning",
          timeout: 3000
        }, `unknown-not-found-${scannedCode}`);
      }
    }
  }, [debugMode, showToastWithCountdown, setChecklistItems]);

  return {
    handleBarcodeScan,
    resetScanState,
    lastScannedCode,
    lastScanTimestamp
  };
}

