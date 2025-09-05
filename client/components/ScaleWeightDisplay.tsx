import React from 'react';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

interface ScaleWeightDisplayProps {
  currentScaleWeight: number;
  totalOrderWeight: number;
  className?: string;
}

export const ScaleWeightDisplay: React.FC<ScaleWeightDisplayProps> = ({
  currentScaleWeight,
  totalOrderWeight,
  className = ''
}) => {
  const [equipmentState] = useEquipmentFromAuth();

  const realWeight = equipmentState.currentWeight?.weight || 0;
  const isStable = equipmentState.currentWeight?.isStable || false;
  const isConnected = equipmentState.isConnected;

  return (
    <div className={cn("w-full bg-white p-4 rounded-lg shadow border", className)}>
      <div className="space-y-3">
        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Поточна вага</span>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? (isStable ? "bg-green-500" : "bg-yellow-500 animate-pulse") : "bg-red-500"
            )} />
            <span className="text-xs text-gray-500">
              {isConnected ? (isStable ? "Стабільно" : "Нестабільно") : "Відключено"}
            </span>
          </div>
        </div>

        {/* Текущий вес */}
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {isConnected ? `${realWeight.toFixed(2)} кг` : '--.-- кг'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Реальний час
          </div>
        </div>

        {/* Ожидаемый вес */}
        {totalOrderWeight > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <div className="flex justify-between items-center text-xs text-gray-600">
              <span>Поточна вага замовлення:</span>
              <span>{currentScaleWeight.toFixed(1)} кг</span>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-600 mt-1">
              <span>Очікувана вага:</span>
              <span>{totalOrderWeight.toFixed(1)} кг</span>
            </div>
            {/* Индикатор разницы */}
            {isConnected && realWeight > 0 && (
              <div className="mt-2 text-center">
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full",
                  Math.abs(realWeight - currentScaleWeight) < 0.1
                    ? "bg-green-100 text-green-700"
                    : Math.abs(realWeight - currentScaleWeight) < 0.5
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                )}>
                  {realWeight > currentScaleWeight ? '+' : ''}
                  {(realWeight - currentScaleWeight).toFixed(2)} кг
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
