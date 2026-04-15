import { useCallback } from 'react';
import type { OrderChecklistItem, ToleranceSettings } from '../types/orderAssembly';
import { calcBoxTolerance, calcCumulativeTolerance } from '@/lib/utils';
import { sortChecklistItems } from '@/lib/orderAssemblyUtils';
import { addToast, Toast } from '@heroui/toast';
import { ToastService } from '@/services/ToastService';

interface UseWeightManagementProps {
  checklistItems: OrderChecklistItem[];
  activeBoxIndex: number;
  toleranceSettings: ToleranceSettings;
  setChecklistItems: React.Dispatch<React.SetStateAction<OrderChecklistItem[]>>;
  autoSelectNext?: boolean;
  successIndicationMs?: number;
  successToastMs?: number;
  errorIndicationMs?: number;
  errorToastMs?: number;
}

export function useWeightManagement({
  checklistItems,
  activeBoxIndex,
  toleranceSettings,
  setChecklistItems,
  autoSelectNext = true,
  successIndicationMs = 1500,
  successToastMs = 3000,
  errorIndicationMs = 1000,
  errorToastMs = 3000,
}: UseWeightManagementProps) {

  /**
   * Обчислює очікувану вагу і накопичену похибку одночасно для оптимізації
   * 
   * Логіка розрахунку:
   * 1. Якщо коробка не зважена (статус !== 'done') → показуємо тільки вагу коробки
   * 2. Якщо є товар у статусі 'pending' або 'error' → показуємо накопичену вагу (коробка + зважені товари + поточний товар)
   * 3. Якщо всі товари зважені → показуємо тільки вагу зважених елементів (або null якщо немає зважених)
   * 
   * @returns {expectedWeight: number | null, cumulativeTolerance: number}
   */
  const getWeightData = useCallback(() => {
    // Збираємо всі елементи поточної коробки один раз
    const currentBoxItems = checklistItems.filter(item =>
      (item.boxIndex || 0) === activeBoxIndex
    );

    if (currentBoxItems.length === 0) {
      return { expectedWeight: null, cumulativeTolerance: 0 };
    }

    // 1. Коробка в статусі awaiting_confirmation, error, default або success
    const awaitingBox = checklistItems.find(item =>
      item.type === 'box' && item.status !== 'done' &&
      // ['awaiting_confirmation', 'error', 'default', 'success'].includes(item.status) &&
      (item.boxIndex || 0) === activeBoxIndex
    );

    if (awaitingBox) {
      // Для коробки tolerance розраховується окремо (10% або мінімум 10г)
      const boxTolerance = calcBoxTolerance(awaitingBox.expectedWeight);
      return {
        expectedWeight: awaitingBox.expectedWeight,
        cumulativeTolerance: boxTolerance
      };
    }

    // 2. Товар в статусі pending або error
    const pendingItem = checklistItems.find(item =>
      item.type === 'product' &&
      ['pending', 'error'].includes(item.status) &&
      (item.boxIndex || 0) === activeBoxIndex
    );

    let cumulativeWeight = 0;
    let totalPortions = 0;

    // 3. Вага коробки: вважаємо done, success як зважені
    const boxItem = currentBoxItems.find(item => item.type === 'box');
    const boxWeight = boxItem && ['done', 'success'].includes(boxItem.status)
      ? boxItem.expectedWeight
      : 0;

    if (boxWeight > 0) {
      cumulativeWeight += boxWeight;
    }

    // 4. Вага товарів: вважаємо done і success як зважені
    const doneItems = currentBoxItems.filter(item =>
      item.type === 'product' && (item.status === 'done' || item.status === 'success')
    );

    doneItems.forEach(item => {
      cumulativeWeight += item.expectedWeight;
      totalPortions += item.quantity || 1;
    });

    // 5. Якщо є pending або error, додаємо його вагу і порції
    // Якщо немає pending/error товарів, показуємо тільки вагу вже зважених елементів
    if (pendingItem) {
      cumulativeWeight += pendingItem.expectedWeight;
      totalPortions += pendingItem.quantity || 1;
    } // else {
      // // 6. Якщо є error, очікуємо саме його (НЕ переходимо до наступного default)
    //   const errorItem = currentBoxItems.find(item =>
    //     item.type === 'product' && item.status === 'error'
    //   );
    //   if (errorItem) {
    //     cumulativeWeight += errorItem.expectedWeight;
    //     totalPortions += errorItem.quantity || 1;
    //   } else {
    //     // 7. Якщо немає error/pending, шукаємо наступний default
    //     const nextItem = currentBoxItems.find(item =>
    //       item.type === 'product' && item.status === 'default'
    //     );
    //     if (nextItem) {
    //       cumulativeWeight += nextItem.expectedWeight;
    //       totalPortions += nextItem.quantity || 1;
    //     }
    //   }
    // }

    // Розраховуємо накопичену tolerance
    const cumulativeTolerance = calcCumulativeTolerance(
      boxWeight,
      totalPortions,
      toleranceSettings
    );

    return {
      expectedWeight: cumulativeWeight > 0 ? cumulativeWeight : null,
      cumulativeTolerance
    };
  }, [checklistItems, activeBoxIndex, toleranceSettings]);

  /**
   * Обробка зміни ваги від WeightDisplayWidget
   */
  const handleWeightChange = useCallback((weight: number | null) => {
    if (weight === null) {
      return;
    }

    // Використовуємо функціональне оновлення стану для отримання актуальних даних
    setChecklistItems(prevItems => {
      // Функція для обчислення очікуваної накопичувальної ваги
      const calculateExpectedCumulativeWeight = (currentItem: any) => {
        const currentBoxItems = prevItems.filter(item =>
          (item.boxIndex || 0) === activeBoxIndex
        );

        // Сумуємо вагу коробки (якщо є) + всіх товарів в статусі done + поточний товар
        let cumulativeWeight = 0;

        // Додаємо вагу коробки, якщо вона в фінальних статусах
        const boxItem = currentBoxItems.find(item => item.type === 'box');
        if (boxItem && (boxItem.status === 'done' || boxItem.status === 'success')) {
          cumulativeWeight += boxItem.expectedWeight;
        }

        // Додаємо вагу всіх товарів в статусі done
        const doneItems = currentBoxItems.filter(item =>
          item.type === 'product' && item.status === 'done'
        );
        doneItems.forEach(item => {
          cumulativeWeight += item.expectedWeight;
        });

        // Додаємо вагу поточного товару
        if (currentItem) {
          cumulativeWeight += currentItem.expectedWeight;
        }

        return cumulativeWeight;
      };

      // Спочатку перевіряємо коробку зі статусом 'pending' (відсканована, але не зважена)
      const scannedBox = prevItems.find(item =>
        item.status === 'pending' &&
        item.type === 'box' &&
        (item.boxIndex || 0) === activeBoxIndex
      );

      // Перевіряємо, чи є коробка у фінальних статусах - якщо так, то не зважуємо коробку
      const completedBox = prevItems.find(item =>
        (item.status === 'done' || item.status === 'success') &&
        item.type === 'box' &&
        (item.boxIndex || 0) === activeBoxIndex
      );

      // Перевіряємо, чи коробка все ще чекає на сканування
      const awaitingBox = prevItems.find(item =>
        item.status === 'awaiting_confirmation' &&
        item.type === 'box' &&
        (item.boxIndex || 0) === activeBoxIndex
      );

      // Якщо коробка не відсканована, блокуємо зважування
      if (awaitingBox && !completedBox) {
        console.log('🚫 [useWeightManagement] Зважування заблоковано - коробка не відсканована');
        ToastService.show({
          title: "Спочатку відскануйте коробку",
          description: "Не можна зважувати коробку, поки вона не буде відсканована",
          color: "warning",
          timeout: 3000
        });
        return prevItems;
      }

      if (scannedBox && !completedBox) {
        // Для коробки очікувана вага - це тільки вага коробки
        const expectedWeight = scannedBox.expectedWeight;
        const tolerance = calcBoxTolerance(expectedWeight); // 10% або мінімум 10г
        const minWeight = expectedWeight - tolerance / 1000; // переводимо грами в кг
        const maxWeight = expectedWeight + tolerance / 1000; // переводимо грами в кг

        const isWeightValid = weight >= minWeight && weight <= maxWeight;

        // Якщо вага 0, не показуємо помилку до зміни ваги
        if (weight === 0) {
          return prevItems;
        }

        if (isWeightValid) {
          // Коробка зважена - переводимо в success, потім в done
          const updatedItems = prevItems.map(item => {
            if (item.id === scannedBox.id) {
              return { ...item, status: 'success' as const };
            }
            return item;
          });

          // Показуємо повідомлення про успіх
          ToastService.show({
            title: "Коробка зважена",
            description: `${scannedBox.name}: ${weight.toFixed(3)} кг (очікувано: ${expectedWeight.toFixed(3)} кг)`,
            color: "success",
            icon: "check-circle",
            hideIcon: false,
            timeout: successToastMs
          });

          // Через successIndicationMs переводимо в done
          setTimeout(() => {
            setChecklistItems(prevItems =>
              prevItems.map(item => {
                if (item.id === scannedBox.id) {
                  return { ...item, status: 'done' as const };
                }
                return item;
              })
            );

            // Автоматично вибираємо перший товар в коробці з урахуванням сортування
            if (autoSelectNext) {
              setChecklistItems(prevItems => {
                const currentBoxItems = prevItems.filter(item =>
                  item.type === 'product' &&
                  (item.boxIndex || 0) === activeBoxIndex &&
                  item.status === 'default'
                );

                // Сортуємо і беремо перший елемент
                const sortedItems = sortChecklistItems(currentBoxItems);
                const firstProduct = sortedItems[0];

                if (firstProduct) {
                  return prevItems.map(item => {
                    if (item.id === firstProduct.id) {
                      return { ...item, status: 'pending' as const };
                    }
                    return item;
                  });
                }
                return prevItems;
              });
            }
          }, successIndicationMs);

          return updatedItems;
        } else {
          // Вага коробки не відповідає - переводимо в error, потім в pending для повторного зважування
          const updatedItems = prevItems.map(item => {
            if (item.id === scannedBox.id) {
              return { ...item, status: 'error' as const };
            }
            return item;
          });

          // Показуємо повідомлення про помилку
          ToastService.show({
            title: `${scannedBox.name}: Поточна вага не коректна!`,
            description: `Очікувано: ${expectedWeight.toFixed(3)}кг ± ${tolerance.toFixed(0)}г. Фактична вага: ${weight.toFixed(3)}кг`,
            color: "danger",
            hideIcon: false,
            icon: "alert-circle",
            timeout: errorToastMs
          });

          // Через errorIndicationMs повертаємо в pending для повторного зважування
          setTimeout(() => {
            setChecklistItems(prevItems =>
              prevItems.map(item => {
                if (item.id === scannedBox.id) {
                  return { ...item, status: 'pending' as const };
                }
                return item;
              })
            );
          }, errorIndicationMs);

          return updatedItems;
        }
      }

      // Якщо коробка не очікує зважування, шукаємо товар зі статусом 'pending'
      const pendingItem = prevItems.find(item =>
        item.status === 'pending' &&
        item.type === 'product' &&
        (item.boxIndex || 0) === activeBoxIndex
      );

      if (!pendingItem) {
        console.log('⚖️ [useWeightManagement] Немає товару в статусі pending для зважування');
        return prevItems;
      }

      // Обчислюємо очікувану накопичувальну вагу
      const expectedCumulativeWeight = calculateExpectedCumulativeWeight(pendingItem);

      // Отримуємо загальну кількість порцій на платформі для розрахунку динамічної tolerance
      const currentBoxItems = prevItems.filter(item =>
        (item.boxIndex || 0) === activeBoxIndex
      );

      // Підраховуємо загальну кількість порцій, які будуть на платформі після додавання поточного товару
      let totalPortions = 0;

      // Додаємо всі вже зважені порції
      currentBoxItems.forEach(item => {
        if (item.type === 'product' && ['done', 'success'].includes(item.status)) {
          totalPortions += item.quantity || 1;
        }
      });

      // Додаємо поточний товар, який ми зважуємо
      totalPortions += pendingItem.quantity || 1;

      // Отримуємо вагу коробки
      const boxItem = currentBoxItems.find(item => item.type === 'box');
      const boxWeight = boxItem && (boxItem.status === 'done' || boxItem.status === 'success')
        ? boxItem.expectedWeight
        : 0;

      // Розраховуємо накопичену tolerance
      const cumulativeTolerance = calcCumulativeTolerance(
        boxWeight,
        totalPortions,
        toleranceSettings
      );

      const minWeight = expectedCumulativeWeight - cumulativeTolerance / 1000; // переводимо грами в кг
      const maxWeight = expectedCumulativeWeight + cumulativeTolerance / 1000; // переводимо грами в кг

      const isWeightValid = weight >= minWeight && weight <= maxWeight;

      if (isWeightValid) {
        // Вага відповідає - переводимо в success, потім в done
        const updatedItems = prevItems.map(item => {
          if (item.id === pendingItem.id) {
            return { ...item, status: 'success' as const };
          }
          return item;
        });

        // Показуємо повідомлення про успіх
        ToastService.show({
          title: "Вага відповідає",
          description: `${pendingItem.name}: ${weight.toFixed(3)} кг (очікувано: ${expectedCumulativeWeight.toFixed(3)} кг)`,
          hideIcon: false,
          icon: "check-circle",
          color: "success",
          timeout: successToastMs
        });

        // Через successIndicationMs переводимо в done
        setTimeout(() => {
          setChecklistItems(prevItems =>
            prevItems.map(item => {
              if (item.id === pendingItem.id) {
                return { ...item, status: 'done' as const };
              }
              return item;
            })
          );

          // Автоматично вибираємо наступний товар в коробці з урахуванням сортування
          if (autoSelectNext) {
            setChecklistItems(prevItems => {
              const currentBoxItems = prevItems.filter(item => 
                item.type === 'product' && 
                (item.boxIndex || 0) === activeBoxIndex && 
                item.status === 'default'
              );

              // Сортуємо і беремо перший елемент
              const sortedItems = sortChecklistItems(currentBoxItems);
              const nextItem = sortedItems[0];

              if (nextItem) {
                console.log('🔄 [useWeightManagement] Автоматично вибираємо наступний товар:', nextItem.name);
                return prevItems.map(item => {
                  if (item.id === nextItem.id) {
                    return { ...item, status: 'pending' as const };
                  }
                  return item;
                });
              }
              return prevItems;
            });
          }
        }, successIndicationMs);

        return updatedItems;
      } else {
        // Вага не відповідає - переводимо в error
        // console.log('❌ [useWeightManagement] Вага товару не відповідає очікуваній');

        const updatedItems = prevItems.map(item => {
          if (item.id === pendingItem.id) {
            return { ...item, status: 'error' as const };
          }
          return item;
        });

        // Показуємо повідомлення про помилку
        ToastService.show({
          title: "Вага не відповідає",
          description: `${pendingItem.name}: ${weight.toFixed(3)}кг (очікувано: ${expectedCumulativeWeight.toFixed(3)} ± ${(cumulativeTolerance).toFixed(0)}г)`,
          color: "danger",
          hideIcon: false,
          icon: "scale",
          timeout: errorToastMs
        });

        // Через errorIndicationMs повертаємо в pending для повторного зважування
        setTimeout(() => {
          setChecklistItems(prevItems =>
            prevItems.map(item => {
              if (item.id === pendingItem.id) {
                return { ...item, status: 'pending' as const };
              }
              return item;
            })
          );
        }, errorIndicationMs);

        return updatedItems;
      }
    });
  }, [activeBoxIndex, setChecklistItems, toleranceSettings, autoSelectNext, successIndicationMs, successToastMs, errorIndicationMs, errorToastMs]);

  return {
    getWeightData,
    handleWeightChange
  };
}

