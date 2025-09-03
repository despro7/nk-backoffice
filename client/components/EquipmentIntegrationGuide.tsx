import { Card, CardBody, CardHeader } from '@heroui/card';
import { DynamicIcon } from 'lucide-react/dynamic';

export const EquipmentIntegrationGuide = () => {
  return (
    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500">
      <CardHeader className="border-b border-blue-200">
        <DynamicIcon name="zap" size={20} className="text-blue-600 mr-2" />
        <h4 className="text-base font-semibold text-blue-800">Інтеграція реального обладнання</h4>
        <p className="text-sm text-blue-600 ml-auto">Технічна підготовка до підключення</p>
      </CardHeader>
      <CardBody className="flex flex-row gap-4">
        <div className="flex-1">
          {/* Сканер штрихкодов */}
          <div className="space-y-2">
            <h5 className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <DynamicIcon name="scan" size={16} />
              Сканер штрихкодів
            </h5>
            <div className="text-xs text-blue-600 space-y-1 ml-6">
              <p>• <strong>Тип:</strong> USB або Bluetooth сканер</p>
              <p>• <strong>Формат:</strong> Підтримка EAN-13, Code-128, QR-код</p>
              <p>• <strong>Інтеграція:</strong> Через Web Serial API або WebSocket</p>
              <p>• <strong>Функція:</strong> Автоматичне визначення товару по SKU</p>
            </div>
          </div>
          {/* Весы */}
          <div className="space-y-2">
            <h5 className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <DynamicIcon name="scale" size={16} />
              Ваги
            </h5>
            <div className="text-xs text-blue-600 space-y-1 ml-6">
              <p>• <strong>Тип:</strong> USB або RS-232 з'єднання</p>
              <p>• <strong>Точність:</strong> Мінімум 1 грам</p>
              <p>• <strong>Максимальна вага:</strong> 10-15 кг</p>
              <p>• <strong>Функція:</strong> Реальне зважування з валідацією</p>
            </div>
          </div>
          {/* API интеграция */}
          <div className="space-y-2">
            <h5 className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <DynamicIcon name="code" size={16} />
              API Інтеграція
            </h5>
            <div className="text-xs text-blue-600 space-y-1 ml-6">
              <p>• <strong>Web Serial API:</strong> Для USB обладнання</p>
              <p>• <strong>WebSocket:</strong> Для мережевого обладнання</p>
              <p>• <strong>Event-driven:</strong> Асинхронна обробка даних</p>
              <p>• <strong>Error handling:</strong> Обробка помилок з'єднання</p>
            </div>
          </div>
        </div>

        <div className="flex-1">
          {/* Готовность системы */}
          <div className="mt-4 p-3 bg-green-50 rounded-lg border-l-4 border-green-400">
            <h5 className="text-sm font-medium text-green-800 mb-2">
              ✅ Система готова до інтеграції
            </h5>
            <div className="text-xs text-green-700 space-y-1">
              <p>• Імітація процесів налаштована</p>
              <p>• Логіка валідації реалізована</p>
              <p>• UI компоненти адаптовані</p>
              <p>• API endpoints готові</p>
            </div>
          </div>
          {/* Следующие шаги */}
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
            <h5 className="text-sm font-medium text-yellow-800 mb-2">
              🚀 Наступні кроки
            </h5>
            <div className="text-xs text-yellow-700 space-y-1">
              <p>1. Підключення обладнання до комп'ютера</p>
              <p>2. Налаштування драйверів та з'єднання</p>
              <p>3. Тестування з'єднання через браузер</p>
              <p>4. Інтеграція з існуючою системою</p>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
