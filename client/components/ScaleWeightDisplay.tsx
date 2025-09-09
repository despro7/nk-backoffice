import React, { useState, useEffect, useCallback } from 'react';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

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
  const [weightHistory, setWeightHistory] = useState<WeightHistory[]>([]);
  const [isConnectingScale, setIsConnectingScale] = useState(false);

  const realWeight = equipmentState.currentWeight?.weight || 0;
  const isStable = equipmentState.currentWeight?.isStable || false;
  const isConnected = equipmentState.isConnected;

  // Функция для парсинга последнего числа из сырых данных
  const parseLastWeightFromRaw = useCallback(() => {
    if (!equipmentState.lastRawScaleData) return null;

    // Ищем число с точкой или запятой (в формате 1.234 или 1,234)
    const weightMatch = equipmentState.lastRawScaleData.match(/[\d]+[.,][\d]+/);
    if (weightMatch) {
      const weightStr = weightMatch[0].replace(',', '.');
      const weight = parseFloat(weightStr);
      return !isNaN(weight) && weight >= 0 ? weight : null;
    }
    return null;
  }, [equipmentState.lastRawScaleData]);

  const rawWeight = parseLastWeightFromRaw();

  // Отслеживаем изменения веса и сохраняем историю
  useEffect(() => {
    if (equipmentState.currentWeight) {
      const newEntry: WeightHistory = {
        weight: equipmentState.currentWeight.weight,
        timestamp: equipmentState.currentWeight.timestamp,
        isStable: equipmentState.currentWeight.isStable,
        rawMessage: equipmentState.lastRawScaleData
      };

      setWeightHistory(prev => {
        const updated = [newEntry, ...prev].slice(0, 10); // Храним последние 10 значений
        return updated;
      });

      console.log('📊 ScaleWeightDisplay: Weight updated:', {
        weight: equipmentState.currentWeight.weight,
        isStable: equipmentState.currentWeight.isStable,
        timestamp: equipmentState.currentWeight.timestamp,
        rawMessage: equipmentState.lastRawScaleData
      });
    }
  }, [equipmentState.currentWeight, equipmentState.lastRawScaleData]);

  // Health check каждые 15-30 секунд
  useEffect(() => {
    const healthCheck = () => {
      console.log('🏥 ScaleWeightDisplay: Health check - connection status:', isConnected);
    };

    // Первый health check
    healthCheck();

    // Повторяем каждые 15-30 секунд (случайный интервал)
    const interval = setInterval(() => {
      const randomDelay = 15000 + Math.random() * 15000; // 15-30 сек
      setTimeout(healthCheck, randomDelay);
    }, 15000);

    return () => clearInterval(interval);
  }, [isConnected]);

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
      const ScaleServiceClass = (await import('../services/ScaleService')).default;
      const scaleInstance = new ScaleServiceClass();
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
    <div className={cn("w-full bg-white p-4 rounded-lg shadow border", className)}>
      <div className="space-y-3">
        {/* Заголовок */}
        <div className="flex items-start justify-between">
          <span className="text-sm font-medium text-gray-700">Поточна вага</span>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-green-500" : "bg-red-500"
            )} />
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
          <div className="text-2xl font-bold text-gray-900">
            {isConnected && rawWeight !== null ? `${rawWeight.toFixed(3)} кг` : '--.-- кг'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {isConnected ? 'Реальний час' : 'Ваги відключені'}
          </div>
        </div>


        {/* Сырые данные и отладочная информация */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-2 bg-gray-100 rounded text-xs">
            <div className="text-gray-600 flex gap-4">
              <span>Raw: {equipmentState.lastRawScaleData || '–'}</span>
              <span>Parsed: {rawWeight !== null ? `${rawWeight.toFixed(3)}` : '–'}</span>
            </div>
          </div>
        )}

        {/* Ожидаемый вес на текущем этапе */}
        {currentScaleWeight > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
              <span>Очікувана вага (поточний етап):</span>
              <span>{currentScaleWeight.toFixed(1)} кг</span>
            </div>
            {/* Общий вес заказа для справки */}
            {totalOrderWeight > 0 && totalOrderWeight !== currentScaleWeight && (
              <div className="flex justify-between items-center text-xs text-gray-600">
                <span>Загальна вага замовлення:</span>
                <span>{totalOrderWeight.toFixed(1)} кг</span>
              </div>
            )}
            {/* Индикатор разницы */}
            {isConnected && rawWeight !== null && (
              <div className="mt-2 text-center">
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full",
                  Math.abs(rawWeight - currentScaleWeight) < 0.1
                    ? "bg-green-100 text-green-700"
                    : Math.abs(rawWeight - currentScaleWeight) < 0.5
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                )}>
                  {(() => {
                    const difference = rawWeight - currentScaleWeight;
                    // Отладка индикатора разницы (только если есть значительная разница)
                    if (Math.abs(difference) > 0.1) {
                      console.log('📊 ScaleWeightDisplay: Индикатор разницы:', {
                        rawWeight,
                        currentScaleWeight,
                        difference: difference.toFixed(2)
                      });
                    }
                    return (difference > 0 ? '+' : '') + difference.toFixed(2);
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
