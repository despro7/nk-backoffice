import React, { useState, useEffect, useCallback } from 'react';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import ScaleService from '../services/ScaleService';

interface ScaleWeightDisplayProps {
  currentScaleWeight: number; // Ожидаемый вес на текущем этапе
  totalOrderWeight: number; // Общий вес всего заказа (для справки)
  className?: string;
}

interface WeightHistory {
  weight: number;
  timestamp: Date;
  isStable: boolean;
  rawMessage?: string;
}

export const ScaleWeightDisplay: React.FC<ScaleWeightDisplayProps> = ({
  currentScaleWeight,
  totalOrderWeight,
  className = ''
}) => {
  const [equipmentState, equipmentActions] = useEquipmentFromAuth();
  const [isConnectingScale, setIsConnectingScale] = useState(false);
  const [pollingCountdown, setPollingCountdown] = useState<number | null>(null);
  const [activePollingStartTime, setActivePollingStartTime] = useState<number | null>(null);

  const realWeight = equipmentState.currentWeight?.weight || 0;
  const isStable = equipmentState.currentWeight?.isStable || false;
  const isConnected = equipmentState.isScaleConnected; // Используем специфично статус весов

  // Логирование обновлений веса (без сохранения истории)
  useEffect(() => {
    if (equipmentState.currentWeight) {
      console.log('📊 ScaleWeightDisplay: Weight updated:', {
        weight: equipmentState.currentWeight.weight,
        isStable: equipmentState.currentWeight.isStable,
        timestamp: equipmentState.currentWeight.timestamp
      });
    }
  }, [equipmentState.currentWeight]);

  // Упрощенный health check только для логов (каждые 30 секунд)
  useEffect(() => {
    const healthCheck = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🏥 ScaleWeightDisplay: Connection status:', isConnected);
      }
    };

    const interval = setInterval(healthCheck, 30000); // 30 сек
    return () => clearInterval(interval);
  }, [isConnected]);

  // Отслеживание времени начала активного polling
  useEffect(() => {
    if (equipmentState.isActivePolling && !activePollingStartTime) {
      setActivePollingStartTime(Date.now());
    } else if (!equipmentState.isActivePolling) {
      setActivePollingStartTime(null);
    }
  }, [equipmentState.isActivePolling, activePollingStartTime]);

  // Таймер обратного отсчёта для polling
  useEffect(() => {
    let countdownInterval: NodeJS.Timeout | null = null;

    if (equipmentState.isActivePolling) {
      if (activePollingStartTime) {
        // Для активного polling показываем оставшееся время до окончания activePollingDuration
        const activePollingDuration = equipmentState.config?.scale?.activePollingDuration || 30000;
        const elapsed = Date.now() - activePollingStartTime;
        const remaining = Math.max(0, activePollingDuration - elapsed);
        
        setPollingCountdown(Math.ceil(remaining / 1000));
        
        countdownInterval = setInterval(() => {
          const currentElapsed = Date.now() - activePollingStartTime;
          const currentRemaining = Math.max(0, activePollingDuration - currentElapsed);
          setPollingCountdown(Math.ceil(currentRemaining / 1000));
        }, 1000);
      } else {
        // Если активный polling запущен, но время начала еще не установлено, показываем интервал
        const interval = equipmentState.config?.scale?.activePollingInterval || 1000;
        setPollingCountdown(Math.ceil(interval / 1000));
        
        countdownInterval = setInterval(() => {
          setPollingCountdown(prev => {
            if (prev === null || prev <= 1) {
              return Math.ceil(interval / 1000);
            }
            return prev - 1;
          });
        }, 1000);
      }
    } else if (equipmentState.isReservePolling) {
      // Для резервного polling показываем интервал между запросами
      const interval = equipmentState.config?.scale?.reservePollingInterval || 5000;
      setPollingCountdown(Math.ceil(interval / 1000));
      
      countdownInterval = setInterval(() => {
        setPollingCountdown(prev => {
          if (prev === null || prev <= 1) {
            return Math.ceil(interval / 1000);
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setPollingCountdown(null);
    }

    return () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  }, [equipmentState.isActivePolling, equipmentState.isReservePolling, equipmentState.config?.scale?.activePollingInterval, equipmentState.config?.scale?.reservePollingInterval, equipmentState.config?.scale?.activePollingDuration, activePollingStartTime]);

  // Функция для ручного подключения к весам
  const handleManualScaleConnect = async () => {
    if (equipmentState.isSimulationMode) {
      console.log('⚠️ ScaleWeightDisplay: Cannot connect in simulation mode');
      return;
    }

    setIsConnectingScale(true);
    try {
      console.log('🔧 ScaleWeightDisplay: Manual scale connection attempt...');
      // Используем ручной выбор порта (autoConnect=false)
      const scaleInstance = ScaleService.getInstance();
      const connected = await scaleInstance.connect(false);
      if (connected) {
        console.log('✅ ScaleWeightDisplay: Scale connected successfully');
        // Обновляем состояние оборудования через actions
        equipmentActions.refreshConfig();
      } else {
        console.log('❌ ScaleWeightDisplay: Failed to connect scale');
      }
    } catch (error) {
      console.log('❌ ScaleWeightDisplay: Error connecting scale:', error);
    } finally {
      setIsConnectingScale(false);
    }
  };


  return (
    <div className={cn("w-full bg-white p-4 rounded-lg shadow-sm border", className)}>
      <div className="space-y-3">
        {/* Заголовок */}
        <div className="flex items-start justify-between">
          
          <div className="text-sm font-medium text-gray-700">
            <span className={cn("inline-block w-2 h-2 rounded-full mr-1 mb-0.5", isConnected ? "bg-green-500" : "bg-red-500")} /> Поточна вага
          </div>
          <div className="flex items-center gap-2">
            {/* Индикатор активного polling */}
            {equipmentState.isActivePolling && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs text-blue-600">Активний</span>
              </div>
            )}
            {!isConnected && !equipmentState.isSimulationMode && (
              <button
                onClick={handleManualScaleConnect}
                disabled={isConnectingScale}
                className={cn(
                  "px-2 py-1 text-xs rounded-md transition-colors",
                  !isConnectingScale
                    ? "bg-red-100 text-red-700 hover:bg-red-200"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                )}
              >
                {isConnectingScale ? 'Підключення...' : 'Підключити'}
              </button>
            )}
          </div>
        </div>

        {/* Текущий вес */}
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">
            {isConnected ? `${realWeight.toFixed(3)} кг` : '-.--- кг'}
          </div>
          {/* <div className="text-sm text-gray-500 mt-1">
            {isConnected ? 'Поточна вага' : 'Ваги не підключені'}
          </div> */}
          {/* Индикатор стабильности */}
          {isConnected && (
            <div className="flex justify-center items-center mt-2">
              <div className={cn(
                "w-2 h-2 rounded-full mr-2",
                isStable ? "bg-green-500" : "bg-yellow-500"
              )} />
              <span className="text-xs text-gray-600">
                {isStable ? 'Стабільно' : 'Нестабільно'}
              </span>
            </div>
          )}
        </div>


        {/* Сырые данные и отладочная информация (только в dev режиме) */}
        {process.env.NODE_ENV === 'development' && isConnected && (
          <div className="mt-3 p-2 bg-gray-50 rounded text-xs border-t">
            <div className="text-gray-600 space-y-1">
              <div>Parsed: {`${realWeight.toFixed(3)} кг`}</div>
              <div>Updated: {equipmentState.currentWeight?.timestamp?.toLocaleTimeString() || '–'}</div>
              <div className="flex justify-between items-center">
                <span>Polling:</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-2 py-1 rounded text-xs",
                    equipmentState.isActivePolling 
                      ? "bg-blue-100 text-blue-700" 
                      : equipmentState.isReservePolling 
                      ? "bg-green-100 text-green-700" 
                      : "bg-gray-100 text-gray-500"
                  )}>
                    {equipmentState.isActivePolling ? 
                      `Active (${equipmentState.config?.scale?.activePollingInterval || 1000}ms)` : 
                     equipmentState.isReservePolling ? 
                      `Reserve (${equipmentState.config?.scale?.reservePollingInterval || 5000}ms)` : 
                     'Stopped'}
                  </span>
                  {pollingCountdown !== null && (
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-mono",
                      equipmentState.isActivePolling 
                        ? "bg-blue-50 text-blue-600 border border-blue-200" 
                        : "bg-green-50 text-green-600 border border-green-200"
                    )}>
                      {equipmentState.isActivePolling ? `${pollingCountdown}s` : `${pollingCountdown}s`}
                    </span>
                  )}
                </div>
              </div>
              {/* <div className="text-xs text-gray-500 space-y-1">
                <div>Page: {window.location.pathname}</div>
                <div>Scale: {isConnected ? 'Connected' : 'Disconnected'}</div>
                <div>Simulation: {equipmentState.isSimulationMode ? 'Yes' : 'No'}</div>
                <div>Active Polling: {equipmentState.isActivePolling ? 'Yes' : 'No'}</div>
                <div>Reserve Polling: {equipmentState.isReservePolling ? 'Yes' : 'No'}</div>
                <div>Config: {equipmentState.config ? 'Loaded' : 'Not loaded'}</div>
              </div> */}
            </div>
          </div>
        )}

        {/* Ожидаемый вес на текущем этапе (упрощенно) */}
        {currentScaleWeight > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex justify-between items-center text-sm text-gray-700 mb-2">
              <span>Очікувана вага:</span>
              <span className="font-medium">{currentScaleWeight.toFixed(3)} кг</span>
            </div>
            
            {/* Индикатор разницы (только если весы подключены) */}
            {isConnected && (
              <div className="text-center">
                <span className={cn(
                  "text-sm px-3 py-1 rounded-full font-medium",
                  Math.abs(realWeight - currentScaleWeight) < 0.05
                    ? "bg-green-100 text-green-800"
                    : Math.abs(realWeight - currentScaleWeight) < 0.2
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
                )}>
                  Різниця: {(() => {
                    const difference = realWeight - currentScaleWeight;
                    return (difference > 0 ? '+' : '') + difference.toFixed(3);
                  })()} кг
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
