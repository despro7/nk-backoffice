import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@heroui/react';
import { Button } from '@heroui/button';
import NumberFlow from '@number-flow/react';
import { Play, Pause } from 'lucide-react';
import { ScaleService } from '../services/ScaleService';
import { LoggingService } from '@/services/LoggingService';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { DynamicIcon } from 'lucide-react/dynamic';


interface WeightDisplayWidgetProps {
  onWeightChange?: (weight: number | null) => void;
  expectedWeight?: number | null; // Очікувана вага для відображення
  className?: string;
  isActive?: boolean; // Додаємо для автоматичного керування
  isPaused?: boolean; // Додаємо для фіксації ваги
}

export const WeightDisplayWidget: React.FC<WeightDisplayWidgetProps> = (props) => {
  const {
    onWeightChange,
    expectedWeight,
    className = '',
    isActive: isActiveProp,
    isPaused: isPausedProp
  } = props;
  // Логування змін expectedWeight
  const prevExpectedWeightRef = useRef<number | null | undefined>(expectedWeight);
  useEffect(() => {
    if (prevExpectedWeightRef.current !== expectedWeight) {
      // eslint-disable-next-line no-console
      // console.log('[WeightDisplayWidget] expectedWeight изменился:', {
      //   prev: prevExpectedWeightRef.current,
      //   next: expectedWeight,
      //   time: new Date().toLocaleTimeString()
      // });
      prevExpectedWeightRef.current = expectedWeight;
    }
  }, [expectedWeight]);

  // Отримуємо параметри з налаштувань
  const [state] = useEquipmentFromAuth();
  const spikeThreshold = (state.config?.scale as any)?.amplitudeSpikeThresholdKg ?? 2.0;
  const pollingInterval = (state.config?.scale as any)?.activePollingInterval ?? 1000;

  // Стани компонента
  const [isActive, setIsActive] = useState(!!isActiveProp);
  // Синхронізуємо локальний isActive зі значенням пропа (для автоматичного режиму)
  useEffect(() => {
    if (typeof isActiveProp === 'boolean') {
      setIsActive(isActiveProp);
    }
  }, [isActiveProp]);
  const [isPaused, setIsPaused] = useState(!!isPausedProp);
  // Синхронізуємо локальний isPaused зі значенням пропа (для автоматичного режиму)
  useEffect(() => {
    if (typeof isPausedProp === 'boolean') {
      setIsPaused(isPausedProp);
    }
  }, [isPausedProp]);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Рефи для збереження значень між рендерами
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastStableWeightRef = useRef<number | null>(null);
  const stableWeightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionCheckRef = useRef<NodeJS.Timeout | null>(null);
  const weightStabilityRef = useRef<{ weight: number; count: number; startTime: number } | null>(null);
  const currentWeightRef = useRef<number | null>(null);
  const lastDisplayedWeightRef = useRef<number | null>(null);
  const anomalousValueRef = useRef<{ value: number; count: number; startTime: number } | null>(null);
  const lastSuccessfulReadRef = useRef<number>(Date.now());
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tareTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  // Функція для аналізу службових байтів протоколу ваг
  const analyzeProtocolStability = (rawData: Uint8Array, weight?: number): { isStable: boolean; isUnstable: boolean; reason?: string } => {
    if (!rawData || rawData.length < 2) {
      return { isStable: false, isUnstable: false, reason: 'Недостаточно данных' };
    }

    const lastTwoBytes = rawData.slice(-2);
    const suffix2 = Array.from(lastTwoBytes)
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    const serviceStable = suffix2 === '00 00';
    const serviceUnstableKnown = suffix2 === '00 04';
    const serviceUnstableOther = !serviceStable && !serviceUnstableKnown;

    // Проверка на fake zero: кадр стабилен, но внутри есть ненулевые байты, а weight==0
    // Это должно срабатывать ТОЛЬКО когда вес действительно равен 0
    const hasInnerDigitsOnZero = serviceStable && weight === 0 && rawData.length > 2 && 
      rawData.slice(0, -2).some(b => b !== 0);

    const isUnstable = serviceUnstableKnown || serviceUnstableOther || hasInnerDigitsOnZero;
    const isStable = serviceStable && !isUnstable;

    let reason = '';
    if (serviceUnstableOther) {
      reason = `Нестабільний кадр: невідомий суфікс ${suffix2}`;
    } else if (hasInnerDigitsOnZero) {
      reason = 'Нестабільний кадр: нульова вага з внутрішніми ненульовими байтами';
    } else if (serviceUnstableKnown) {
      reason = 'Нестабільний кадр: суфікс 00 04';
    }

    // console.log(`WeightDisplayWidget: Анализ протокола: suffix=${suffix2}, serviceStable=${serviceStable}, weight=${weight}, hasInnerDigitsOnZero=${hasInnerDigitsOnZero}, isStable=${isStable}`);

    return { isStable, isUnstable, reason };
  };

  // Функція для перевірки аномальних значень за формулою X/Y > 5
  const checkAnomalousValue = (currentWeight: number, previousWeight: number | null): { isAnomalous: boolean; shouldFilter: boolean } => {
    if (previousWeight === null || previousWeight === 0) {
      return { isAnomalous: false, shouldFilter: false };
    }

    const ratio = previousWeight / currentWeight;
    const isAnomalous = ratio > 5;
    
    // console.log(`WeightDisplayWidget: Проверка аномального значения: ${previousWeight}кг / ${currentWeight}кг = ${ratio.toFixed(2)} ${isAnomalous ? '(аномально)' : '(нормально)'}`);
    
    return { isAnomalous, shouldFilter: isAnomalous };
  };

  // Функція для перевірки стабільності ваги з покращеною логікою
  const checkWeightStability = (weight: number, rawData?: Uint8Array): { isStable: boolean; isNewStable: boolean; protocolStable: boolean } => {
    const threshold = 0.05; // 50г поріг стабільності
    const stabilityTime = 1000; // Зменшили до 1 секунди
    const stabilityCount = 2; // Зменшили до 2 вимірювань для прискорення

    const current = weightStabilityRef.current;
    const now = Date.now();
    
    // Аналіз протоколу (якщо є rawData)
    let protocolStable = true;
    if (rawData) {
      const protocolAnalysis = analyzeProtocolStability(rawData, weight);
      protocolStable = protocolAnalysis.isStable;
      
      if (protocolAnalysis.isUnstable) {
        // console.log(`WeightDisplayWidget: Протокол нестабилен: ${protocolAnalysis.reason}`);
        return { isStable: false, isNewStable: false, protocolStable: false };
      }
    }
    
    // console.log(`WeightDisplayWidget: checkWeightStability(${weight}кг): current=${current ? `${current.weight}кг, count=${current.count}, time=${now - current.startTime}ms` : 'null'}, protocolStable=${protocolStable}`);

    // Якщо це перше вимірювання або вага сильно змінилася
    if (!current || Math.abs(weight - current.weight) > threshold) {
      // console.log(`WeightDisplayWidget: Начинаем новую серию измерений для ${weight}кг`);
      weightStabilityRef.current = { weight, count: 1, startTime: now };
      return { isStable: false, isNewStable: false, protocolStable };
    }
    
    // Якщо вага в межах порога, збільшуємо лічильник
    if (Math.abs(weight - current.weight) <= threshold) {
      const newCount = current.count + 1;
      const timeElapsed = now - current.startTime;
      
      // console.log(`WeightDisplayWidget: Вес в пределах порога: ${weight}кг, count=${newCount}, time=${timeElapsed}ms`);
      
      weightStabilityRef.current = { 
        weight: (current.weight + weight) / 2, // усредняем
        count: newCount, 
        startTime: current.startTime 
      };
      
      // Покращена перевірка стабільності: протокол АБО (час І кількість)
      const isStable = protocolStable || (newCount >= stabilityCount && timeElapsed >= stabilityTime);
      
      // console.log(`WeightDisplayWidget: Проверка стабильности: protocolStable=${protocolStable}, count=${newCount}>=${stabilityCount}? ${newCount >= stabilityCount}, time=${timeElapsed}ms>=${stabilityTime}ms? ${timeElapsed >= stabilityTime}, isStable=${isStable}`);
      
      if (protocolStable) {
        // console.log(`WeightDisplayWidget: Стабилизация по протоколу! Вес: ${weight}кг`);
      } else if (newCount >= stabilityCount && timeElapsed >= stabilityTime) {
        // console.log(`WeightDisplayWidget: Стабилизация по времени! Вес: ${weight}кг, count=${newCount}, time=${timeElapsed}ms`);
      }
      
      if (isStable) {
        // Вага стабілізувалася, оновлюємо останню стабільну вагу
        lastStableWeightRef.current = weightStabilityRef.current.weight;
        // console.log(`WeightDisplayWidget: Вес стабилизировался! Новый стабильный вес: ${lastStableWeightRef.current}кг`);
        return { isStable: true, isNewStable: true, protocolStable };
      }
      
      return { isStable: false, isNewStable: false, protocolStable };
    }
    
    // console.log(`WeightDisplayWidget: Вес вне порога стабильности`);
    return { isStable: false, isNewStable: false, protocolStable };
  };

  // Функція для перевірки валідності ваги
  const isValidWeight = (weight: number): boolean => {
    return weight >= 0 && weight <= 20; // 0-20кг диапазон
  };

  // Функція для перевірки реальної зміни ваги
  const hasWeightReallyChanged = (weight: number): boolean => {
    if (lastDisplayedWeightRef.current === null) {
      return true; // Перше вимірювання
    }
    
    const difference = Math.abs(weight - lastDisplayedWeightRef.current);
    const changeThreshold = 0.1; // 100г поріг для реальної зміни
    
    return difference >= changeThreshold;
  };


  // Основна функція читання ваги з поліпшеною логікою
  const readWeight = async () => {
    if (!isActive) return;

    try {
      const scaleService = ScaleService.getInstance();
      
      // Перевіряємо, чи під'єднані ваги
      if (!scaleService.isScaleConnected()) {
        console.warn('WeightDisplayWidget: Ваги не підключені');
        setIsConnected(false);
        return;
      }
      
      const scaleData = await scaleService.readScaleOnce(true);
      
      if (scaleData === null) {
        // console.log(`WeightDisplayWidget: scaleData = null - сохраняем текущий вес`);
        // scaleData = null означает потерю соединения, но не сбрасываем вес
        
        // Перевіряємо, скільки часу минуло без успішної відповіді
        const timeSinceLastSuccess = Date.now() - lastSuccessfulReadRef.current;
        
        if (timeSinceLastSuccess >= 5000) { // 5 секунд
          setIsError(true);
          setErrorMessage('Дані з ваг відсутні');
          
          // Через 10 секунд надсилаємо команду Tare
          if (timeSinceLastSuccess >= 10000 && !tareTimeoutRef.current) {
            tareTimeoutRef.current = setTimeout(() => {
              sendTareCommand();
              tareTimeoutRef.current = null;
            }, 100);
          }
        }
        return;
      }

      // Основна логіка обробки сирих даних
      if (scaleData && scaleData.rawData) {
        const weight = scaleData.weight;
        const rawData = new Uint8Array(scaleData.rawData);
        
        // Скидаємо помилку в разі успішного отримання даних
        setIsError(false);
        setErrorMessage(null);
        lastSuccessfulReadRef.current = Date.now();
        
        // Очищаємо таймер Tare, якщо його було встановлено
        if (tareTimeoutRef.current) {
          clearTimeout(tareTimeoutRef.current);
          tareTimeoutRef.current = null;
        }
        
        // LoggingService.equipmentLog(`⚖️ [WeightDisplayWidget]: Получен вес: ${weight}кг, текущий: ${currentWeightRef.current}кг, стабильный: ${lastStableWeightRef.current}кг`);
        
        if (typeof weight === 'number' && isValidWeight(weight)) {
          // Проста і надійна фільтрація нулів
          if (weight === 0) {
            // console.log(`WeightDisplayWidget: Получен 0, проверяем условия...`);
            // console.log(`WeightDisplayWidget: currentWeightRef = ${currentWeightRef.current}, lastStableWeightRef = ${lastStableWeightRef.current}`);
            
            // Пом'якшена фільтрація нулів: показуємо 0 якщо він прийшов 3 рази поспіль
            const current = weightStabilityRef.current;
            const now = Date.now();
            
            if (!current || current.weight !== 0) {
              // Починаємо нову серію нульових вимірювань
              weightStabilityRef.current = { weight: 0, count: 1, startTime: now };
              // console.log(`WeightDisplayWidget: Начало серии нулей, count=1`);
              return;
            } else if (current.weight === 0) {
              // Продовжуємо серію нульових вимірювань
              const newCount = current.count + 1;
              weightStabilityRef.current = { weight: 0, count: newCount, startTime: current.startTime };
              // console.log(`WeightDisplayWidget: Серия нулей, count=${newCount}`);
              
              // Показуємо 0 тільки після 3 вимірювань поспіль
              if (newCount >= 3) {
                // console.log(`WeightDisplayWidget: Ноль подтвержден (${newCount} раз), показываем`);
                currentWeightRef.current = 0;
                setCurrentWeight(0);
                setIsStable(true);
                
                // Перевіряємо реальну зміну для нуля
                if (hasWeightReallyChanged(0)) {
                  // console.log(`WeightDisplayWidget: Реальное изменение веса: ${lastDisplayedWeightRef.current}кг -> 0кг`);
                  lastDisplayedWeightRef.current = 0;
                  setLastUpdate(new Date());
                  onWeightChange?.(0);
                }
                
                // Скидаємо лічильник після показу
                weightStabilityRef.current = null;
              } else {
                return; // Продовжуємо накопичувати нулі
              }
            }
          } else {
            // console.log(`WeightDisplayWidget: Получен ненулевой вес: ${weight}кг`);
            
            // Скидаємо лічильник нулів у разі отримання ненульової ваги
            if (weightStabilityRef.current?.weight === 0) {
              // console.log(`WeightDisplayWidget: Сброс счетчика нулей, получен ненулевой вес: ${weight}кг`);
              weightStabilityRef.current = null;
            }
            
            // Перевірка на аномальні значення за формулою X/Y > 5
            const { isAnomalous, shouldFilter } = checkAnomalousValue(weight, currentWeightRef.current);
            
            if (isAnomalous) {
              // console.log(`WeightDisplayWidget: Обнаружено аномальное значение: ${weight}кг`);
              
              // Відстежуємо повторення аномального значення
              const current = anomalousValueRef.current;
              const now = Date.now();
              
              if (!current || current.value !== weight) {
                // Нове аномальне значення
                anomalousValueRef.current = { value: weight, count: 1, startTime: now };
                // console.log(`WeightDisplayWidget: Начинаем отслеживание аномального значения: ${weight}кг`);
                return; // Фільтруємо перше появлення
              } else {
                // Те ж аномальне значення повторюється
                const newCount = current.count + 1;
                anomalousValueRef.current = { value: weight, count: newCount, startTime: current.startTime };
                
                // console.log(`WeightDisplayWidget: Аномальное значение повторяется: ${weight}кг, count=${newCount}`);
                
                // Якщо повторюється >= 3 разів, показуємо його
                if (newCount >= 3) {
                  // console.log(`WeightDisplayWidget: Аномальное значение подтверждено (${newCount} раз), показываем: ${weight}кг`);
                  anomalousValueRef.current = null; // Скидаємо відстеження
                  // Продовжуємо звичайну обробку
                } else {
                  return; // Продовжуємо фільтрувати
                }
              }
            } else {
              // Нормальне значення - скидаємо відстеження
              anomalousValueRef.current = null;
            }

            // Для ненульових значень перевіряємо на сплески
            if (currentWeightRef.current !== null && currentWeightRef.current > 0.1) {
              const difference = Math.abs(weight - currentWeightRef.current);
              if (difference > spikeThreshold) {
                // console.log(`WeightDisplayWidget: ИГНОРИРУЕМ всплеск ${weight}кг (разница: ${difference.toFixed(2)}кг, порог: ${spikeThreshold}кг)`);
                return; // Ігноруємо сплеск
              }
            }

            // Використовуємо покращену логіку стабілізації з аналізом протоколу
            // console.log(`WeightDisplayWidget: Проверяем стабильность для ${weight}кг`);
            const { isStable: isCurrentlyStable, isNewStable, protocolStable } = checkWeightStability(weight, rawData);
            // console.log(`WeightDisplayWidget: Результат стабильности: isStable=${isCurrentlyStable}, isNewStable=${isNewStable}, protocolStable=${protocolStable}`);
            
            currentWeightRef.current = weight;
            setCurrentWeight(weight);
            setIsStable(isCurrentlyStable);
            
            // Якщо вага щойно стабілізувалася, перевіряємо реальну зміну
            if (isNewStable) {
              // console.log(`WeightDisplayWidget: Вес стабилизировался: ${weight}кг`);
              
              // Перевіряємо, чи дійсно вага змінилася
              if (hasWeightReallyChanged(weight)) {
                // console.log(`WeightDisplayWidget: Реальное изменение веса: ${lastDisplayedWeightRef.current}кг -> ${weight}кг`);
                lastDisplayedWeightRef.current = weight;
                setLastUpdate(new Date());
                onWeightChange?.(weight);
              }
            }
          }
        } else {
          // console.log(`WeightDisplayWidget: Невалидный вес: ${weight} (тип: ${typeof weight})`);
          // Невалідна вага
          currentWeightRef.current = null;
          setCurrentWeight(null);
          setIsStable(false);
        }
      } else {
        // Немає даних - скидаємо вагу, зберігаємо останнє значення
        currentWeightRef.current = null;
        setCurrentWeight(null);
        setIsStable(false);
        // currentWeightRef.current залишається незмінним
      }
    } catch (error) {
      console.warn('[WeightDisplayWidget]: Помилка зчитування ваги:', error);
      // При помилці не скидаємо вагу, зберігаємо останнє значення
      // setCurrentWeight(null);
      // setIsStable(false);
    }
  };

  // Перевірка підключення до ваг
  const checkConnection = async () => {
    if (!isActive) return;

    try {
      const scaleService = ScaleService.getInstance();

      // Спочатку перевіряємо базове підключення
      if (!scaleService.isScaleConnected()) {
        setIsConnected(false);
        return;
      }
      
      const status = await scaleService.checkScaleStatus();
      setIsConnected(!status.readableLocked && !status.writableLocked);
    } catch (error) {
      console.warn('WeightDisplayWidget: Error checking connection:', error);
      setIsConnected(false);
    }
  };

  // Функція запуску зважування
  const startWeighing = async () => {
    try {
      const scaleService = ScaleService.getInstance();

      // Перевіряємо стан вагів
      const status = await scaleService.checkScaleStatus();
      if (status.readableLocked || status.writableLocked) {
        console.warn('WeightDisplayWidget: Потік даних заблокований');
        setIsConnected(false);
        return;
      }

      // Подключаемся к весам
      const connected = await scaleService.connect();
      if (!connected) {
        console.warn('WeightDisplayWidget: Не вдалося підключитися до вагів');
        setIsConnected(false);
        return;
      }

      setIsActive(true);
      setIsPaused(false);
      setIsConnected(connected);
      
    } catch (error) {
      console.error('WeightDisplayWidget: Error starting weighing:', error);
      setIsConnected(false);
    }
  };

  // Функція зупинки зважування
  const stopWeighing = () => {
    setIsActive(false);
    setIsPaused(false);
    setIsError(false);
    setErrorMessage(null);

    // Скидаємо стан стабільності
    weightStabilityRef.current = null;
    lastStableWeightRef.current = null;
    currentWeightRef.current = null;
    lastDisplayedWeightRef.current = null;
    anomalousValueRef.current = null;
    
    // Очищаємо таймери
    if (tareTimeoutRef.current) {
      clearTimeout(tareTimeoutRef.current);
      tareTimeoutRef.current = null;
    }
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  };

  // Функція паузи/відновлення зважування
  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  // Функція для надсилання команди Tare
  const sendTareCommand = async () => {
    try {
      const scaleService = ScaleService.getInstance();
      console.log('WeightDisplayWidget: Отправляем команду Tare...');
      
      const success = await scaleService.tare();
      if (success) {
        console.log('WeightDisplayWidget: Команда Tare виконана успішно');
        setIsError(false);
        setErrorMessage(null);
        lastSuccessfulReadRef.current = Date.now();
      } else {
        console.warn('WeightDisplayWidget: Команда Tare не виконана');
      }
    } catch (error) {
      console.error('WeightDisplayWidget: Помилка під час виконання команди Tare:', error);
    }
  };

  // Запуск/зупинення моніторингу
  useEffect(() => {
    if (isActive) {
      // Перевіряємо підключення
      checkConnection();
      connectionCheckRef.current = setInterval(checkConnection, 5000);

      // Запускаємо читання ваги
      LoggingService.equipmentLog(`⚖️ [WeightDisplayWidget]: Запуск моніторингу з інтервалом ${pollingInterval}мс`);
      readWeight();
      intervalRef.current = setInterval(readWeight, pollingInterval);
    } else {
      // Зупиняємо моніторинг
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (connectionCheckRef.current) {
        clearInterval(connectionCheckRef.current);
        connectionCheckRef.current = null;
      }
      if (stableWeightTimeoutRef.current) {
        clearTimeout(stableWeightTimeoutRef.current);
        stableWeightTimeoutRef.current = null;
      }

      // Скидаємо стан
      setCurrentWeight(null);
      setIsStable(false);
      setIsConnected(false);
      setIsPaused(false);
      setIsError(false);
      setErrorMessage(null);
      setLastUpdate(null);
      lastStableWeightRef.current = null;
      weightStabilityRef.current = null;
      currentWeightRef.current = null;
      lastDisplayedWeightRef.current = null;
      anomalousValueRef.current = null;
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (connectionCheckRef.current) clearInterval(connectionCheckRef.current);
      if (stableWeightTimeoutRef.current) clearTimeout(stableWeightTimeoutRef.current);
      if (tareTimeoutRef.current) clearTimeout(tareTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, [isActive, pollingInterval]);

  // Управління паузою - зупиняємо/запускаємо інтервали
  useEffect(() => {
    if (!isActive) return;

    if (isPaused) {
      // Зупиняємо інтервали при паузі
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (connectionCheckRef.current) {
        clearInterval(connectionCheckRef.current);
        connectionCheckRef.current = null;
      }
      LoggingService.equipmentLog(`⚖️ [WeightDisplayWidget]: Пауза - інтервали зупинені`);
    } else {
      // Запускаємо інтервали при відновленні
      if (!intervalRef.current) {
        checkConnection();
        connectionCheckRef.current = setInterval(checkConnection, 5000);
        readWeight();
        intervalRef.current = setInterval(readWeight, pollingInterval);
        LoggingService.equipmentLog(`⚖️ [WeightDisplayWidget]: Відновлення - інтервали запущені`);
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (connectionCheckRef.current) clearInterval(connectionCheckRef.current);
    };
  }, [isPaused, isActive, pollingInterval]);

  const getStatusColor = (): string => {
    if (isError) return 'text-red-500';
    if (!isConnected) return 'text-red-500';
    if (isPaused) return 'text-orange-500';
    if (!isStable) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusText = (): string => {
    if (isError) return errorMessage || 'Помилка';
    if (!isConnected) return 'Не підключено';
    if (isPaused) return 'На паузі';
    if (!isStable) return 'Нестабільно';
    return 'Стабільно';
  };

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex flex-col items-center space-y-3">
        <div className="flex items-center justify-between w-full">
          <h3 className="text-sm font-medium text-gray-600">Поточна вага</h3>
          <div className="flex items-center gap-2">
            {isActive && (
              <Button
                color="warning"
                size="sm"
                onPress={togglePause}
                className="text-xs"
                isIconOnly
              >
                {isPaused ? <Play size={16} /> : <Pause size={16} />}
              </Button>
            )}
            <Button
              color={isActive ? 'danger' : 'primary'}
              size="sm"
              onPress={isActive ? stopWeighing : startWeighing}
              className="text-xs"
            >
              {isActive ? 'Зупинити' : 'Запустити'}
            </Button>
          </div>
        </div>
        
        <div className="text-center">
          <div className={`text-3xl flex items-center gap-1.5 font-bold mb-1 ${isError ? 'text-red-500' : 'text-gray-900'}`}>
            <div className="">
              <NumberFlow
                value={currentWeight || 0}
                format={{ minimumFractionDigits: 3, maximumFractionDigits: 3 }}
                className="tabular-nums"
              />
              <span className={`text-lg ml-1 ${isError ? 'text-red-500' : 'text-gray-500'}`}>кг</span>
            </div>
            {expectedWeight !== null && expectedWeight !== undefined && (
              <div className="flex items-center gap-1.5">
                <DynamicIcon name="arrow-right" strokeWidth={2} size={14} />
                <div className="text-3xl text-gray-600">
                  <NumberFlow
                    value={expectedWeight}
                    format={{ minimumFractionDigits: 3, maximumFractionDigits: 3 }}
                    className="tabular-nums"
                  />
                  <span className="text-lg text-gray-500 ml-1">кг</span>
                </div>
              </div>
            )}
          </div>
          
          <div className={`text-xs font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </div>
        </div>

        {lastUpdate && (
          <div className="text-xs text-gray-400">
            Оновлено: {lastUpdate.toLocaleTimeString()}
          </div>
        )}

        {!isActive && (
          <div className="text-xs text-gray-400">
            Натисніть "Запустити" для початку зважування
          </div>
        )}
      </div>
    </Card>
  );
};
