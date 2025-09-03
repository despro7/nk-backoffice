import { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Switch } from '@heroui/react';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  expectedWeight: number;
  status: 'default' | 'pending' | 'success' | 'error' | 'done' | 'awaiting_confirmation' | 'confirmed';
  type: 'box' | 'product';
  boxSettings?: any;
  boxCount?: number;
  boxIndex?: number;
  portionsRange?: { start: number; end: number };
  portionsPerBox?: number;
}

interface SimulationButtonsProps {
  items: OrderItem[];
  className?: string;
  activeBoxIndex: number;
  onSimulateScan: (itemId: string) => void;
  onSimulateWeigh: (itemId: string) => void;
  weightTolerance: number;
  setShowPrintTTN: (showPrintTTN: boolean) => void;
  showPrintTTN: boolean;
}

export const SimulationButtons = ({
  items,
  activeBoxIndex,
  setShowPrintTTN,
  onSimulateScan,
  onSimulateWeigh,
  weightTolerance,
  className,
  showPrintTTN,
}: SimulationButtonsProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isWeighing, setIsWeighing] = useState(false);
  const [currentWeightTolerance, setCurrentWeightTolerance] = useState(weightTolerance || 0.1);

  // Обновляем локальное состояние при изменении пропса weightTolerance
  useEffect(() => {
    if (weightTolerance !== undefined) {
      setCurrentWeightTolerance(weightTolerance);
    }
  }, [weightTolerance]);

  // Получаем товары для текущей коробки, которые еще не обработаны
  const availableItems = items.filter(item => 
    item.type === 'product' && 
    (item.boxIndex || 0) === activeBoxIndex && 
    item.status === 'default'
  );

  // Имитация сканирования - случайно выбираем товар из доступных
  const handleSimulateScan = async () => {
    if (availableItems.length === 0) {
      alert('Немає доступних товарів для сканування в поточній коробці');
      return;
    }

    setIsScanning(true);
    
    // Имитируем задержку сканирования
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
    
    // Случайно выбираем товар для сканирования
    const randomItem = availableItems[Math.floor(Math.random() * availableItems.length)];
    
    // Вызываем функцию имитации сканирования
    onSimulateScan(randomItem.id);
    
    setIsScanning(false);
  };

  // Имитация взвешивания - работаем с активным товаром
  const handleSimulateWeigh = async () => {
    const pendingItem = items.find(item => 
      item.type === 'product' && 
      (item.boxIndex || 0) === activeBoxIndex && 
      item.status === 'pending'
    );

    if (!pendingItem) {
      alert('Спочатку потрібно просканувати товар (вибрати його в чек-листі)');
      return;
    }

    setIsWeighing(true);
    
    // Имитируем задержку взвешивания
    await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800));
    
    // Вызываем функцию имитации взвешивания
    onSimulateWeigh(pendingItem.id);
    
    setIsWeighing(false);
  };

  const hasAvailableItems = availableItems.length > 0;
  const hasPendingItem = items.some(item => 
    item.type === 'product' && 
    (item.boxIndex || 0) === activeBoxIndex && 
    item.status === 'pending'
  );

  return (
    <Card className={`w-full ${className || ''}`}>
      <CardHeader className="border-b border-gray-200">
        <DynamicIcon name="settings" size={20} className="text-gray-600 mr-2" />
        <h4 className="text-base font-semibold">Імітація обладнання</h4>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-600">Тестування процесу комплектації</p>
        {/* Кнопка имитации сканирования */}
        <div className="space-y-2">
          <Button
            color="primary"
            variant="solid"
            size="lg"
            className="w-full"
            onPress={handleSimulateScan}
            disabled={isScanning || !hasAvailableItems}
            startContent={isScanning ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <DynamicIcon name="scan" size={20} />
            )}
          >
            {isScanning ? 'Сканування...' : 'Імітація сканування'}
          </Button>
          <p className="text-xs text-gray-500 text-center">
            {hasAvailableItems 
              ? `Доступно товарів: ${availableItems.length}`
              : 'Немає доступних товарів'
            }
          </p>
        </div>

        {/* Кнопка имитации взвешивания */}
        <div className="space-y-2">
          <Button
            color="success"
            variant="solid"
            size="lg"
            className="w-full bg-green-600 text-white"
            onPress={handleSimulateWeigh}
            disabled={isWeighing || !hasPendingItem}
            startContent={isWeighing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <DynamicIcon name="scale" size={20} />
            )}
          >
            {isWeighing ? 'Зважування...' : 'Імітація зважування'}
          </Button>
          <p className="text-xs text-gray-500 text-center">
            {hasPendingItem 
              ? 'Товар готовий до зважування'
              : 'Спочатку проскануйте товар'
            }
          </p>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <Switch
            isSelected={showPrintTTN}
            onValueChange={setShowPrintTTN}
            color="primary"
            size="sm"
            classNames={{
              wrapper: "bg-secondary/50 transition-all duration-300",
              thumbIcon: "bg-white/50",
              base: "transition-all duration-300",
            }}
          >
            <span className="text-sm text-neutral-600">
              Показувати "Роздрукувати ТТН"
            </span>
          </Switch>
        </div>
        {/* Кнопка "Печать ТТН" только если свитчер включен и режим симуляции */}
        {/* {showPrintTTN && (
          <div className="mt-2">
            <Button
              color="warning"
              variant="solid"
              size="lg"
              className="w-full"
              onPress={() => {}}
              startContent={<DynamicIcon name="printer" size={20} />}
            >
              Печать ТТН (симуляция)
            </Button>
          </div>
        )} */}

        {/* Информация о текущих настройках */}
        {/* <div className="mt-4 p-3 bg-green-50 rounded-lg border-l-4 border-green-400">
          <h5 className="text-sm font-medium text-green-800 mb-2">
            ⚙️ Поточні налаштування
          </h5>
          <div className="text-xs text-green-700 space-y-1">
            <p>• <strong>Толерантність ваги:</strong> ±{(currentWeightTolerance * 1000).toFixed(0)} г</p>
            <p>• <strong>Формула перевірки:</strong> |Фактична - Очікувана| ≤ {currentWeightTolerance.toFixed(3)} кг</p>
          </div>
        </div> */}

        {/* Информация о подготовке к реальному оборудованию */}
        {/* <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-xs text-blue-700 space-y-1">
            <p>• <strong>Сканер:</strong> Автоматичне визначення товару по штрихкоду</p>
            <p>• <strong>Ваги:</strong> Реальне зважування з порівнянням очікуваного ваги</p>
            <p>• <strong>Валідація:</strong> Перевірка відповідності ваги та товару</p>
          </div>
        </div> */}
      </CardBody>
    </Card>
  );
};
