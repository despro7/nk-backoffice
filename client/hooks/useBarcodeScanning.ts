import { useCallback, useRef, useState } from 'react';
import type { OrderChecklistItem } from '../types/orderAssembly';
import { addToast } from '@heroui/toast';
import { ToastService } from '@/services/ToastService';

interface UseBarcodeScanningProps {
  checklistItems: OrderChecklistItem[];
  activeBoxIndex: number;
  setChecklistItems: React.Dispatch<React.SetStateAction<OrderChecklistItem[]>>;
  debugMode?: boolean;
  assemblyMode?: 'standard' | 'no_scales';
  productScanMode?: 'single_per_item' | 'by_quantity';
  successIndicationMs?: number;
}

const SCAN_COUNTDOWN = 2000; // 2 секунди між скануваннями
const TOAST_COUNTDOWN = 3000; // 3 секунди між однаковими сповіщеннями
const ALREADY_ASSEMBLED_ERROR_MS = 1500;

/** Чи позиція вже повністю зібрана (done/success або вичерпано лічильник by_quantity). */
function isProductFullyAssembled(
  item: OrderChecklistItem,
  scanMode: 'single_per_item' | 'by_quantity'
): boolean {
  if (item.type !== 'product') return false;
  if (item.status === 'done' || item.status === 'success') return true;
  if (scanMode === 'by_quantity') {
    return (item.scannedCount ?? 0) >= item.quantity;
  }
  return false;
}

export function useBarcodeScanning({
  checklistItems,
  activeBoxIndex,
  setChecklistItems,
  debugMode = false,
  assemblyMode = 'standard',
  productScanMode = 'single_per_item',
  successIndicationMs = 1500,
}: UseBarcodeScanningProps) {
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number>(() => Date.now() - 3000);
  const [scrollTarget, setScrollTarget] = useState<{ itemId: string; ts: number } | null>(null);
  
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

  const notifyItemScanned = useCallback((itemId: string) => {
    setScrollTarget({ itemId, ts: Date.now() });
  }, []);

  /** Помилка при повторному скануванні вже зібраної позиції. */
  const rejectAlreadyAssembledProduct = useCallback((item: OrderChecklistItem) => {
    notifyItemScanned(item.id);
    console.log('🚫 [useBarcodeScanning] Товар вже зібраний:', item.name);
    ToastService.show({
      title: "Товар вже зібраний",
      description: `${item.name} — не кладіть зайвого`,
      color: "danger",
      icon: "alert-triangle",
      hideIcon: false,
      timeout: 3000
    });

    const previousStatus = item.status;
    setChecklistItems(prevItems =>
      prevItems.map(i => (i.id === item.id ? { ...i, status: 'error' as const } : i))
    );
    setTimeout(() => {
      setChecklistItems(prevItems =>
        prevItems.map(i =>
          i.id === item.id ? { ...i, status: previousStatus as OrderChecklistItem['status'] } : i
        )
      );
    }, ALREADY_ASSEMBLED_ERROR_MS);
  }, [setChecklistItems, notifyItemScanned]);

  /** no_scales: success → done, як при успішному зважуванні. */
  const markNoScalesProductCompleted = useCallback((itemId: string, scannedCount: number) => {
    setChecklistItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId
          ? { ...item, scannedCount, status: 'success' as const }
          : item
      )
    );

    setTimeout(() => {
      setChecklistItems(prevItems =>
        prevItems.map(item =>
          item.id === itemId ? { ...item, status: 'done' as const } : item
        )
      );
    }, successIndicationMs);
  }, [setChecklistItems, successIndicationMs]);

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
    // Додатковий діагностичний лог для перевірки режиму збірки та стану коробки
    // (користувач просив підтвердити, що assemblyMode дійсно 'no_scales')
    console.log('ℹ️ [useBarcodeScanning] assemblyMode:', assemblyMode);

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

    // У режимі no_scales віддаємо пріоритет пошуку товару (по barcode або sku),
    // навіть якщо коробка ще в статусі 'default'. Це робить сканери та емулятор
    // консистентними: скануючи штрих-код у no_scales ви отримаєте той самий
    // результат, що й при введенні SKU — товар одразу переходить у 'done'.
    if (assemblyMode === 'no_scales') {
      const productFoundInNoScales = currentChecklistItems.find(item =>
        item.type === 'product' &&
        (item.barcode === scannedCode || item.sku === scannedCode) &&
        (item.boxIndex || 0) === currentActiveBoxIndex
      );

      if (productFoundInNoScales) {
        if (isProductFullyAssembled(productFoundInNoScales, productScanMode)) {
          rejectAlreadyAssembledProduct(productFoundInNoScales);
          return;
        }

        if (productScanMode === 'by_quantity') {
          const scannedNow = Math.min((productFoundInNoScales.scannedCount ?? 0) + 1, productFoundInNoScales.quantity);
          const isCompleted = scannedNow >= productFoundInNoScales.quantity;

          console.log('✅ [useBarcodeScanning] no_scales by_quantity (early match):', {
            item: productFoundInNoScales.name,
            scannedNow,
            quantity: productFoundInNoScales.quantity,
            isCompleted,
          });

          if (isCompleted) {
            markNoScalesProductCompleted(productFoundInNoScales.id, scannedNow);
          } else {
            setChecklistItems(prevItems =>
              prevItems.map(item =>
                item.id === productFoundInNoScales.id
                  ? { ...item, scannedCount: scannedNow, status: 'default' as const }
                  : item
              )
            );
          }

          ToastService.show({
            title: isCompleted ? "Товар відмічено як зібраний" : "Товар частково зібраний",
            description: `${productFoundInNoScales.name} (${scannedNow}/${productFoundInNoScales.quantity})`,
            color: isCompleted ? "success" : "primary",
            hideIcon: false,
            timeout: 2000
          });
          notifyItemScanned(productFoundInNoScales.id);
        } else {
          console.log('✅ [useBarcodeScanning] no_scales: знайдений товар по barcode/sku, ставимо success → done:', productFoundInNoScales.name);
          markNoScalesProductCompleted(productFoundInNoScales.id, productFoundInNoScales.quantity);
          ToastService.show({
            title: "Товар відмічено як зібраний",
            description: productFoundInNoScales.name,
            color: "success",
            hideIcon: false,
            timeout: 2000
          });
          notifyItemScanned(productFoundInNoScales.id);
        }
        return;
      }
    }

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

    // 2️⃣ ЯКЩО КОРОБКА НЕ ЗНАЙДЕНА І КОРОБКА ЗВАЖЕНА (або режим no_scales) - ШУКАЄМО ТОВАР
    if (!foundItem && (currentBox?.status === 'done' || assemblyMode === 'no_scales')) {
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

      // Забороняємо повторне сканування вже зібраної позиції
      if (foundItem.type === 'product' && isProductFullyAssembled(foundItem, productScanMode)) {
        rejectAlreadyAssembledProduct(foundItem);
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

      // Якщо це коробка в статусі 'default' — переводимо в 'done' (no_scales) або 'pending' (standard)
      if (foundItem.type === 'box' && foundItem.status === 'default') {
        const boxNewStatus = assemblyMode === 'no_scales' ? 'done' : 'pending';
        console.log(`✅ [useBarcodeScanning] Коробка відсканована, переводимо в статус ${boxNewStatus}:`, foundItem.name);
        setChecklistItems(prevItems =>
          prevItems.map(item => {
            if (item.id === foundItem.id) {
              return { ...item, status: (assemblyMode === 'no_scales' ? 'done' : 'pending') as OrderChecklistItem['status'] };
            }
            return item;
          })
        );

        // Показуємо повідомлення про успішне сканування коробки
        ToastService.show({
          title: "Коробка відсканована",
          description: assemblyMode === 'no_scales'
            ? `${foundItem.name} підтверджено`
            : `${foundItem.name} готова до зважування`,
          color: "success",
          hideIcon: false,
          timeout: 2000
        });
        notifyItemScanned(foundItem.id);
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

      if (assemblyMode === 'no_scales') {
        // У режимі no_scales підтримуємо два сценарії:
        // single_per_item: один скан закриває всю позицію
        // by_quantity: кожен скан додає 1 одиницю до quantity
        if (productScanMode === 'by_quantity') {
          const scannedNow = Math.min((foundItem.scannedCount ?? 0) + 1, foundItem.quantity);
          const isCompleted = scannedNow >= foundItem.quantity;

          console.log('✅ [useBarcodeScanning] no_scales by_quantity:', {
            item: foundItem.name,
            scannedNow,
            quantity: foundItem.quantity,
            isCompleted,
          });

          if (isCompleted) {
            markNoScalesProductCompleted(foundItem.id, scannedNow);
          } else {
            setChecklistItems(prevItems =>
              prevItems.map(item => {
                if (item.id === foundItem.id) {
                  return {
                    ...item,
                    scannedCount: scannedNow,
                    status: 'default' as const,
                  };
                }
                return item;
              })
            );
          }

          ToastService.show({
            title: isCompleted ? "Товар відмічено як зібраний" : "Товар частково зібраний",
            description: `${foundItem.name} (${scannedNow}/${foundItem.quantity})`,
            color: isCompleted ? "success" : "primary",
            hideIcon: false,
            timeout: 2000
          });
          notifyItemScanned(foundItem.id);
        } else {
          console.log('✅ [useBarcodeScanning] no_scales: товар відскановано → success → done:', foundItem.name);
          markNoScalesProductCompleted(foundItem.id, foundItem.quantity);
          ToastService.show({
            title: "Товар відмічено як зібраний",
            description: foundItem.name,
            color: "success",
            hideIcon: false,
            timeout: 2000
          });
          notifyItemScanned(foundItem.id);
        }
      } else {
        // Стандартний режим: встановлюємо 'pending' для зважування
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
        ToastService.show({
          title: "Штрих-код відскановано",
          description: `${foundItem.name} вибрано для комплектації`,
          color: "success",
          hideIcon: false,
          timeout: 2000
        });
        notifyItemScanned(foundItem.id);
      }

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
  }, [debugMode, showToastWithCountdown, setChecklistItems, assemblyMode, productScanMode, rejectAlreadyAssembledProduct, notifyItemScanned, markNoScalesProductCompleted]);

  return {
    handleBarcodeScan,
    resetScanState,
    lastScannedCode,
    lastScanTimestamp,
    scrollTarget,
  };
}

