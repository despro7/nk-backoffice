import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  cumulativeTolerance?: number | null; // Накопичена похибка для відображення (в грамах)
  className?: string;
  isActive?: boolean; // Додаємо для автоматичного керування
  isPaused?: boolean; // Додаємо для фіксації ваги
  pollingMode?: 'active' | 'reserve' | 'auto'; // Режим polling
  onPollingModeChange?: (mode: 'active' | 'reserve') => void; // Callback при зміні режиму
}

export const WeightDisplayWidget: React.FC<WeightDisplayWidgetProps> = (props) => {
  const {
    onWeightChange,
    expectedWeight,
    cumulativeTolerance,
    className = '',
    isActive: isActiveProp,
    isPaused: isPausedProp,
    pollingMode = 'auto',
    onPollingModeChange
  } = props;

  const prevExpectedWeightRef = useRef<number | null | undefined>(expectedWeight);
  useEffect(() => {
    if (prevExpectedWeightRef.current !== expectedWeight) {
      prevExpectedWeightRef.current = expectedWeight;
    }
  }, [expectedWeight]);

  // Отримуємо параметри з налаштувань
  const [state] = useEquipmentFromAuth();
  const spikeThreshold = (state.config?.scale as any)?.amplitudeSpikeThresholdKg ?? 2.0;
  const activePollingInterval = (state.config?.scale as any)?.activePollingInterval ?? 1000;
  const reservePollingInterval = (state.config?.scale as any)?.reservePollingInterval ?? 5000;
  const activePollingDuration = (state.config?.scale as any)?.activePollingDuration ?? 30000;
  const weightThresholdForActive = (state.config?.scale as any)?.weightThresholdForActive ?? 0.010;

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

  // Стани для керування polling режимами
  const [currentPollingMode, setCurrentPollingMode] = useState<'active' | 'reserve'>(pollingMode === 'active' ? 'active' : 'reserve');
  const [activePollingTimeout, setActivePollingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [lastWeightChangeTime, setLastWeightChangeTime] = useState<number>(Date.now());
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
    if (!isActive || !isConnected) return;

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
                  // Відкладаємо виклик callback після завершення рендеру
                  queueMicrotask(() => onWeightChange?.(0));
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
                // Відкладаємо виклик callback після завершення рендеру
                queueMicrotask(() => onWeightChange?.(weight));
                
                // Перевіряємо активність ваги для перемикання режиму
                checkWeightActivity(weight);
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

    // Скидаємо стан polling режимів - синхронізуємо з пропом
    if (pollingMode !== 'auto') {
      setCurrentPollingMode(pollingMode === 'active' ? 'active' : 'reserve');
    } else {
      setCurrentPollingMode('reserve');
    }
    setLastWeightChangeTime(Date.now());

    // Очищаємо таймери
    if (tareTimeoutRef.current) {
      clearTimeout(tareTimeoutRef.current);
      tareTimeoutRef.current = null;
    }
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    if (activePollingTimeout) {
      clearTimeout(activePollingTimeout);
      setActivePollingTimeout(null);
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

  // Функції для керування polling режимами
  const switchToActivePolling = useCallback(() => {
    setCurrentPollingMode(prevMode => {
      if (prevMode === 'active') return prevMode;

      setLastWeightChangeTime(Date.now());
      queueMicrotask(() => onPollingModeChange?.('active'));

      // Очищаємо попередній таймаут
      if (activePollingTimeout) {
        clearTimeout(activePollingTimeout);
        setActivePollingTimeout(null);
      }

      // Встановлюємо таймаут для повернення до резервного режиму
      const timeout = setTimeout(() => {
        LoggingService.equipmentLog('⏰ [WeightDisplayWidget]: Таймаут активного polling, переходимо до резервного');
        setCurrentPollingMode(currentMode => {
          if (currentMode === 'active') {
            // Синхронізуємо з пропом через callback
            queueMicrotask(() => onPollingModeChange?.('reserve'));
            return 'reserve';
          }
          return currentMode;
        });
      }, activePollingDuration);

      setActivePollingTimeout(timeout);

      return 'active';
    });
  }, [activePollingDuration, onPollingModeChange]);

  const switchToReservePolling = useCallback(() => {
    setCurrentPollingMode(prevMode => {
      if (prevMode === 'reserve') return prevMode;

      queueMicrotask(() => onPollingModeChange?.('reserve'));

      // Очищаємо таймаут активного polling
      if (activePollingTimeout) {
        clearTimeout(activePollingTimeout);
        setActivePollingTimeout(null);
      }

      return 'reserve';
    });
  }, [onPollingModeChange]);

  // Функція для перевірки чи потрібно перемикатися на активний режим
  const checkWeightActivity = useCallback((weight: number) => {
    if (!isActive || !weight || weight < weightThresholdForActive) return;

    const timeSinceLastChange = Date.now() - lastWeightChangeTime;
    if (timeSinceLastChange > 1000) { // Мінімум 1 секунда між змінами
      LoggingService.equipmentLog(`⚖️ [WeightDisplayWidget]: Виявлено активність ваги (${weight}кг), переключаємося на активний режим`);
      switchToActivePolling();
    }
  }, [isActive, weightThresholdForActive, lastWeightChangeTime, switchToActivePolling]);

  // Запуск/зупинення моніторингу
  useEffect(() => {
    if (isActive && isConnected) {
      // Перевіряємо підключення
      checkConnection();
      connectionCheckRef.current = setInterval(checkConnection, 5000);

      // Визначаємо інтервал залежно від режиму polling
      const pollingInterval = currentPollingMode === 'active' ? activePollingInterval : reservePollingInterval;
      
      // Запускаємо читання ваги
      LoggingService.equipmentLog(`⚖️ [WeightDisplayWidget]: Запуск моніторингу в режимі ${currentPollingMode} з інтервалом ${pollingInterval}мс`);
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
      if (activePollingTimeout) {
        clearTimeout(activePollingTimeout);
        setActivePollingTimeout(null);
      }

      // Скидаємо стан
      setCurrentWeight(null);
      setIsStable(false);
      // setIsConnected(false);
      setIsPaused(false);
      setIsError(false);
      setErrorMessage(null);
      setLastUpdate(null);
      setCurrentPollingMode('reserve');
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
      if (activePollingTimeout) clearTimeout(activePollingTimeout);
    };
  }, [isActive, currentPollingMode, activePollingInterval, reservePollingInterval, activePollingTimeout]);

  // Обробка зміни pollingMode пропа
  useEffect(() => {
    if (pollingMode === 'active') {
      switchToActivePolling();
    } else if (pollingMode === 'reserve') {
      switchToReservePolling();
    }
    // Для 'auto' режиму не робимо нічого - використовуємо внутрішню логіку
  }, [pollingMode]);

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
        const pollingInterval = currentPollingMode === 'active' ? activePollingInterval : reservePollingInterval;
        intervalRef.current = setInterval(readWeight, pollingInterval);
        LoggingService.equipmentLog(`⚖️ [WeightDisplayWidget]: Відновлення - інтервали запущені`);
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (connectionCheckRef.current) clearInterval(connectionCheckRef.current);
    };
  }, [isPaused, isActive, currentPollingMode, activePollingInterval, reservePollingInterval]);

  const getStatusColor = (): string => {
    if (isError) return 'text-red-600';
    if (!isConnected) return 'text-red-600';
    if (!isActive) return 'text-neutral-400';
    if (isPaused) return 'text-yellow-600';
    if (!isStable) return 'text-yellow-600/75';
    return 'text-green-500';
  };

  const getStatusText = (): string | React.ReactNode => {
    if (isError) return <>
      <DynamicIcon name="alert-circle" size={14} />
      {errorMessage || 'Помилка'}
    </>;
    if (!isConnected) return <>
      <DynamicIcon name="alert-circle" size={14} />
      Не підключено
    </>;
    if (!isActive) return 'Читання даних зупинено';
    if (isPaused) return <>
      <DynamicIcon name="pause-circle" size={14} />
      На паузі
    </>;
    if (!isStable) return <>
      <DynamicIcon name="signal-medium" size={14} />
      Нестабільно
    </>;
    return <>
      <DynamicIcon name="signal-high" size={14} />
      Стабільно
    </>;
  };

  return (
    <Card className={`${className} bg-transparent shadow-none`}>
      <div className="flex flex-col items-center gap-3 px-3 py-5 bg-white rounded-b-lg">
        <div className="text-3xl flex gap-1.5 font-bold">
            
          {/* Поточна вага (кг) */}
          <div className="flex flex-col items-center">
            <span className={`w-full text-xs font-normal ${isError ? 'text-red-600' : 'text-neutral-400'}`}>Поточна вага</span>
            <NumberFlow
              value={currentWeight || 0}
              format={{ minimumFractionDigits: 3, maximumFractionDigits: 3 }}
              className={`tabular-nums transition-colors duration-300 ${!isActive ? 'text-neutral-300' : isError ? 'text-red-600' : 'text-neutral-700'}`}
            />
          </div>
            
          <DynamicIcon className="text-gray-400 mt-8" name="arrow-right" strokeWidth={2} size={14} />
            
          {/* Очікувана вага (кг) */}
          <div className="flex flex-col items-center">
            <span className="w-full text-xs font-normal text-neutral-400">Очікувана вага</span>
            <div className="flex items-center gap-1">
              <NumberFlow
                value={expectedWeight || 0}
                format={{ minimumFractionDigits: 3, maximumFractionDigits: 3 }}
                className="tabular-nums text-neutral-700"
              />
              <NumberFlow
                value={cumulativeTolerance || 0}
                format={{ maximumFractionDigits: 0 }}
                prefix='±'
                suffix='г'
                className="tabular-nums font-medium text-[13px] text-yellow-900/75 bg-yellow-400/30 rounded-full border-1 border-yellow-900/5 px-1.5 py-[1px]"
              />
            </div>
          </div>
        </div>

        {/* {lastUpdate && (
          <div className="text-xs text-gray-400">
            Оновлено: {lastUpdate.toLocaleTimeString()}
          </div>
        )} */}

      </div>
      <div className="flex items-center justify-between w-full p-3">

          {/* <h3 className={`text-xs font-medium ml-1 ${getStatusColor()}`}> */}
          <h3 className={`flex items-center gap-1 text-xs font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </h3>
          <div className="flex items-center gap-2">
            {isActive && (
              <Button
                color="default"
                size="sm"
                onPress={togglePause}
                className="text-xs h-7 text-neutral-600"
                isIconOnly
              >
                {isPaused ? <Play size={12} /> : <Pause size={12} />}
              </Button>
            )}
            <Button
              color={isActive ? 'danger' : 'primary'}
              variant="flat"
              size="sm"
              onPress={isActive ? stopWeighing : startWeighing}
              className={`text-xs h-7 ${isConnected ? (isActive ? 'text-red-700' : 'text-neutral-600') : 'bg-red-400 text-white'}`}
            >
              {isConnected ? (isActive ? 'Stop' : 'Start') : 'Connect'}
            </Button>
          </div>
        </div>
    </Card>
  );
};
