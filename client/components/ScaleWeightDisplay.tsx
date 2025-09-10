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
  const [isConnectingScale, setIsConnectingScale] = useState(false);

  const realWeight = equipmentState.currentWeight?.weight || 0;
  const isStable = equipmentState.currentWeight?.isStable || false;
  const isConnected = equipmentState.isScaleConnected; // Используем специфично статус весов

  // Функция для парсинга последнего числа из сырых данных
  const parseLastWeightFromRaw = useCallback(() => {
    if (!equipmentState.lastRawScaleData) return null;

    // Конвертируем в строку, если это Uint8Array
    const rawDataStr = typeof equipmentState.lastRawScaleData === 'string'
      ? equipmentState.lastRawScaleData
      : Array.from(equipmentState.lastRawScaleData)
          .map(b => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');

    // Ищем число с точкой или запятой (в формате 1.234 или 1,234)
    const weightMatch = rawDataStr.match(/[\d]+[.,][\d]+/);
    if (weightMatch) {
      const weightStr = weightMatch[0].replace(',', '.');
      const weight = parseFloat(weightStr);
      return !isNaN(weight) && weight >= 0 ? weight : null;
    }
    return null;
  }, [equipmentState.lastRawScaleData]);

  const rawWeight = parseLastWeightFromRaw();

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
    <div className={cn("w-full bg-white p-4 rounded-lg shadow-sm border", className)}>
      <div className="space-y-3">
        {/* Заголовок */}
        <div className="flex items-start justify-between">
          <span className="text-sm font-medium text-gray-700">Поточна вага</span>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-green-500" : "bg-red-500"
            )} />
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
            {isConnected && rawWeight !== null ? `${rawWeight.toFixed(3)} кг` : '--.--- кг'}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {isConnected ? 'Поточна вага' : 'Ваги не підключені'}
          </div>
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
              <div>Raw: {equipmentState.lastRawScaleData || '–'}</div>
              <div>Parsed: {rawWeight !== null ? `${rawWeight.toFixed(3)} кг` : '–'}</div>
              <div>Updated: {equipmentState.currentWeight?.timestamp?.toLocaleTimeString() || '–'}</div>
              <div className="flex justify-between items-center">
                <span>Polling:</span>
                <span className={cn(
                  "px-2 py-1 rounded text-xs",
                  equipmentState.isActivePolling 
                    ? "bg-blue-100 text-blue-700" 
                    : equipmentState.isReservePolling 
                    ? "bg-green-100 text-green-700" 
                    : "bg-gray-100 text-gray-500"
                )}>
                  {equipmentState.isActivePolling ? 'Active (500ms)' : 
                   equipmentState.isReservePolling ? 'Reserve (5s)' : 
                   'Stopped'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Ожидаемый вес на текущем этапе (упрощенно) */}
        {currentScaleWeight > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex justify-between items-center text-sm text-gray-700 mb-2">
              <span>Очікувана вага:</span>
              <span className="font-medium">{currentScaleWeight.toFixed(2)} кг</span>
            </div>
            
            {/* Индикатор разницы (только если весы подключены) */}
            {isConnected && rawWeight !== null && (
              <div className="text-center">
                <span className={cn(
                  "text-sm px-3 py-1 rounded-full font-medium",
                  Math.abs(rawWeight - currentScaleWeight) < 0.05
                    ? "bg-green-100 text-green-800"
                    : Math.abs(rawWeight - currentScaleWeight) < 0.2
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
                )}>
                  Різниця: {(() => {
                    const difference = rawWeight - currentScaleWeight;
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
