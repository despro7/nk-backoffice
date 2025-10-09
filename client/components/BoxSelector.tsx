import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Select, SelectItem, Switch, Card, CardBody, CardHeader, Button, cn, CardFooter } from '@heroui/react';
import { useApi } from '../hooks/useApi';
import { SettingsBoxes, BoxRecommendationsResponse, BoxRecommendationMode } from '../types/boxes';
import { setCookie, getCookie, deleteCookie, areCookiesEnabled } from '../lib/cookieUtils';
import { DynamicIcon } from 'lucide-react/dynamic';
import { LoggingService } from '../services/LoggingService';

interface BoxSelectorProps {
  totalPortions: number;
  onBoxesChange: (boxes: SettingsBoxes[], totalWeight: number, boxesInfo?: any) => void;
  onActiveBoxChange?: (activeBoxIndex: number) => void;
  activeBoxIndex: number; // Додаємо activeBoxIndex як prop
  className?: string;
}

export const BoxSelector: React.FC<BoxSelectorProps> = ({
  totalPortions,
  onBoxesChange,
  onActiveBoxChange,
  activeBoxIndex,
  className = ''
}) => {
  const { apiCall } = useApi();
  
  // Константа для імені кукі
  const BOX_MODE_COOKIE = 'nova_box_recommendation_mode';
  
  const [boxes, setBoxes] = useState<SettingsBoxes[]>([]);
  const [recommendations, setRecommendations] = useState<BoxRecommendationsResponse | null>(null);
  const [selectedBoxes, setSelectedBoxes] = useState<SettingsBoxes[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTotalPortions, setLastTotalPortions] = useState<number>(0);
  const [recommendationMode, setRecommendationMode] = useState<BoxRecommendationMode>('spacious');
  const [transitionMode, setTransitionMode] = useState<boolean>(false);
  // const [activeBoxIndex, setActiveBoxIndex] = useState<number>(0); // Видалено локальний activeBoxIndex

  // Мемоізуємо функцію onBoxesChange щоб уникнути нескінченного циклу
  const memoizedOnBoxesChange = useCallback(onBoxesChange, []);

  // Логіка розділення чек-листа на коробки (використовується для валідації)
  const getPortionsPerBox = useMemo(() => {
    if (selectedBoxes.length === 0) return 0;
    return Math.ceil(totalPortions / selectedBoxes.length);
  }, [totalPortions, selectedBoxes.length]);

  // Завантажуємо коробки
  const fetchBoxes = useCallback(async () => {
    try {
      const response = await apiCall('/api/boxes');
      
      if (response.ok) {
        const boxesData = await response.json();
        
        if (boxesData && boxesData.length > 0) {
          setBoxes(boxesData);
          setError(null);
        } else {
          setError('База даних коробок порожня. Запустіть seed файл.');
          return;
        }
      } else {
        setError(`Не вдалося завантажити налаштування коробок: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      setError('Помилка при завантаженні налаштувань коробок');
    }
  }, [apiCall]);

  // Сповіщаємо батьківський компонент про зміну коробок
  const notifyBoxesChange = useCallback((newSelectedBoxes: SettingsBoxes[]) => {
    const totalWeight = newSelectedBoxes.reduce((sum, b) => sum + Number(b.weight), 0);
    
    // Обчислюємо portionsPerBox для поточних коробок
    const portionsPerBox = Math.ceil(totalPortions / newSelectedBoxes.length);
    
    // Передаємо додаткову інформацію про розділення на коробки
    const boxesInfo = {
      boxes: newSelectedBoxes,
      totalWeight,
      totalBoxes: newSelectedBoxes.length,
      portionsPerBox,
      activeBoxIndex,
      boxPortionsRanges: newSelectedBoxes.map((_, index) => {
        const start = index * portionsPerBox + 1;
        const end = Math.min((index + 1) * portionsPerBox, totalPortions);
        return { start, end };
      })
    };
    

    
    memoizedOnBoxesChange(newSelectedBoxes, totalWeight, boxesInfo);
  }, [memoizedOnBoxesChange, totalPortions, activeBoxIndex]);

  // Завантажуємо рекомендації
  const fetchRecommendations = useCallback(async (portions: number) => {
    try {
      const response = await apiCall(`/api/boxes/recommendations/${portions}?mode=${recommendationMode}`);
      
      if (response.ok) {
        const recommendationsData: BoxRecommendationsResponse = await response.json();
        setRecommendations(recommendationsData);
        
        // Автоматично вибираємо рекомендовані коробки
        const recommendedBoxes = recommendationsData.boxes || [];
        
        // Спочатку встановлюємо коробки
        setSelectedBoxes(recommendedBoxes);
        
        // Потім сповіщаємо батьківський компонент
        // Передаємо recommendedBoxes напряму, а не через стан
        const totalWeight = recommendedBoxes.reduce((sum, b) => sum + Number(b.weight), 0);
        
        // Обчислюємо portionsPerBox для переданих коробок
        const portionsPerBox = Math.ceil(portions / recommendedBoxes.length);
        
        // Передаємо додаткову інформацію про розділення на коробки
        const boxesInfo = {
          boxes: recommendedBoxes,
          totalWeight,
          totalBoxes: recommendedBoxes.length,
          portionsPerBox,
          activeBoxIndex: 0,
          boxPortionsRanges: recommendedBoxes.map((_, index) => {
            const start = index * portionsPerBox + 1;
            const end = Math.min((index + 1) * portionsPerBox, portions);
            return { start, end };
          })
        };
        
        memoizedOnBoxesChange(recommendedBoxes, totalWeight, boxesInfo);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Не вдалося отримати рекомендації по коробкам');
      }
    } catch (err) {
      setError('Помилка при отриманні рекомендацій по коробкам');
    } finally {
      setLoading(false);
      setTransitionMode(false);
    }
  }, [apiCall, memoizedOnBoxesChange, activeBoxIndex, recommendationMode]);

  // Функція для оновлення рекомендацій при зміні режиму
  const handleModeChange = useCallback((newMode: BoxRecommendationMode) => {
    LoggingService.orderAssemblyLog('📦 Зміна режиму коробок:', newMode);
    
    setTransitionMode(true);
    setRecommendationMode(newMode);
    
    // Зберігаємо обраний режим в кукі на 365 днів
    setCookie(BOX_MODE_COOKIE, newMode, { expires: 365 });
    
    // Перевіряємо, що кукі встановилась
    setTimeout(() => {
      const savedValue = getCookie(BOX_MODE_COOKIE);
      console.log('Cookie value after setting:', savedValue);
    }, 100);
    
    // Очищуємо попередні помилки при зміні режиму
    setError(null);
    
    // Плавно приховуємо старі рекомендації
    setTimeout(() => {
      setTransitionMode(false);
    }, 150);
  }, [BOX_MODE_COOKIE]);

  // Функція для скидання збереженого режиму
  const handleResetMode = useCallback(() => {
    const defaultMode: BoxRecommendationMode = 'economical';
    setTransitionMode(true);
    setRecommendationMode(defaultMode);
    
    // Видаляємо збережений режим з кукі
    deleteCookie(BOX_MODE_COOKIE);
    
    // Очищуємо помилки
    setError(null);
    
    // Плавно приховуємо старі рекомендації
    setTimeout(() => {
      setTransitionMode(false);
    }, 150);
  }, [BOX_MODE_COOKIE]);

  // Завантажуємо коробки при монтуванні
  useEffect(() => {
    if (boxes.length > 0) return;
    fetchBoxes();
  }, [fetchBoxes, boxes.length]);

  // Синхронізуємо режим з кукі при монтуванні
  useEffect(() => {
    // LoggingService.orderAssemblyLog('📦 Ініціалізація режиму коробок з cookies...');
    
    const savedMode = getCookie(BOX_MODE_COOKIE);
    if (savedMode === 'spacious' || savedMode === 'economical') {
      // LoggingService.orderAssemblyLog('📦 Встановлено режим з cookie:', savedMode);
      setRecommendationMode(savedMode);
    } else {
      LoggingService.orderAssemblyLog('📦 Встановлено режим пакування: economical');
    }
  }, [BOX_MODE_COOKIE]);

  // Завантажуємо рекомендації при зміні порцій або режиму
  useEffect(() => {
    if (boxes.length === 0 || totalPortions <= 0 || loading) {
      return;
    }

    // Перевіряємо, чи змінились порції або режим
    const shouldFetch = totalPortions !== lastTotalPortions || 
                       (recommendations && recommendations.mode !== recommendationMode);

    if (shouldFetch) {
      // Якщо змінюється тільки режим, не показуємо повне завантаження
      if (totalPortions === lastTotalPortions && recommendations) {
        setTransitionMode(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setLastTotalPortions(totalPortions);
      fetchRecommendations(totalPortions);
    }
  }, [totalPortions, recommendationMode, fetchRecommendations, boxes.length, lastTotalPortions, loading, recommendations]);

  // Прибираємо окремий useEffect для режиму, оскільки він тепер обробляється вище

  // Обробник зміни вибору коробки
  const handleBoxChange = useCallback((boxId: string, index: number) => {
    const box = boxes.find(b => b.id.toString() === boxId);
    if (!box) return;

    const newSelectedBoxes = [...selectedBoxes];
    newSelectedBoxes[index] = box;
    setSelectedBoxes(newSelectedBoxes);

    // Сповіщаємо батьківський компонент про зміну
    notifyBoxesChange(newSelectedBoxes);
  }, [boxes, selectedBoxes, notifyBoxesChange]);

  // Додавання нової коробки
  const addBox = useCallback(() => {
    if (boxes.length > 0) {
      const newSelectedBoxes = [...selectedBoxes, boxes[0]];
      setSelectedBoxes(newSelectedBoxes);
      
      // Сповіщаємо батьківський компонент про зміну
      notifyBoxesChange(newSelectedBoxes);
    }
  }, [boxes, selectedBoxes, notifyBoxesChange]);

  // Видалення коробки
  const removeBox = useCallback((index: number) => {
    const newSelectedBoxes = selectedBoxes.filter((_, i) => i !== index);
    setSelectedBoxes(newSelectedBoxes);
    
    // Сповіщаємо батьківський компонент про зміну
    notifyBoxesChange(newSelectedBoxes);
  }, [selectedBoxes, notifyBoxesChange]);

  // Обчислювані значення
  const totalBoxesWeight = useMemo(() => 
    selectedBoxes.reduce((sum, b) => sum + Number(b.weight), 0), 
    [selectedBoxes]
  );

  const totalMaxCapacity = useMemo(() => 
    selectedBoxes.reduce((sum, b) => sum + b.qntTo, 0), 
    [selectedBoxes]
  );

  // Валідація коробок
  const isBoxesValid = useMemo(() => {
    if (selectedBoxes.length === 0) return true;
    
    const portionsPerBox = Math.ceil(totalPortions / selectedBoxes.length);
    // Перевіряємо кожну коробку окремо
    return selectedBoxes.every(box => box.qntTo >= portionsPerBox);
  }, [selectedBoxes, totalPortions]);

  const getBoxValidationStatus = useCallback((box: SettingsBoxes) => {
    if (selectedBoxes.length === 0) return 'default';
    const portionsPerBox = Math.ceil(totalPortions / selectedBoxes.length);
    if (box.qntTo < portionsPerBox) {
      return 'danger';
    }
    return 'default';
  }, [selectedBoxes.length, totalPortions]);

  const hasInappropriateBoxes = useMemo(() => {
    if (selectedBoxes.length === 0) return false;
    const portionsPerBox = Math.ceil(totalPortions / selectedBoxes.length);
    return selectedBoxes.some(box => box.qntTo < portionsPerBox);
  }, [selectedBoxes, totalPortions]);

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-10 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-600 text-sm ${className}`}>
        {error}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Заголовок */}
      {/* <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Коробки
        </h3>
        <Button
          variant="solid"
          size="sm"
          color="secondary"
          className="gap-2"
          onPress={addBox}
        >
          <Plus className="w-4 h-4" /> Додати
        </Button>
      </div> */}

      {/* Інформація про рекомендації */}
      {/* {recommendations && (
        <div className={`border rounded-lg p-3 duration-300 ease-in-out ${
          recommendations.overflowWarning 
            ? 'bg-orange-50 border-orange-200' 
            : 'bg-blue-50 border-blue-200'
        } ${
          transitionMode ? 'opacity-50 transform scale-95' : 'opacity-100 transform scale-100'
        }`}>
          <div className={`text-sm ${
            console.log("recommendation object", recommendations),
            recommendations.overflowWarning ? 'text-orange-800' : 'text-blue-800'
          }`}>
            <p><strong>Рекомендується:</strong> {recommendations.totalBoxes} коробок</p>
            <p><strong>Общий вес коробок:</strong> {Number(recommendations.totalWeight).toFixed(1)} кг</p>
            {recommendations.remainingQuantity && recommendations.remainingQuantity > 0 && (
              <p className="text-orange-600">
                <strong>Увага:</strong> {recommendations.remainingQuantity} порцій не поміститься в вибрані коробки
              </p>
            )}
            {recommendations.overflowWarning && (
              <p className="text-orange-600 font-medium">
                ⚠️ В економічному режимі можливе переповнення коробок
              </p>
            )}
          </div>
        </div>
      )} */}

      {/* Попередження про непідходящі коробки */}
      {/* {hasInappropriateBoxes && (
        <div className={`bg-red-50 border border-red-200 rounded-lg p-3 duration-300 ease-in-out ${
          transitionMode ? 'opacity-50 transform scale-95' : 'opacity-100 transform scale-100'
        }`}>
          <div className="text-sm text-red-800">
            <p><strong>⚠️ Увага:</strong> Вибрано коробки, які не вміщують свою частину замовлення</p>.
            <p>Кожна коробка повинна вміщати мінімум {getPortionsPerBox} порцій</p>
          </div>
        </div>
      )} */}

      {/* Інформація про розділення на коробки */}
      {/* {selectedBoxes.length > 1 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-sm text-gray-700">
            <p><strong>Замовлення розділене на {selectedBoxes.length} коробок:</strong></p>
            <p>По {getPortionsPerBox} порцій на коробку</p>
            <p className="text-blue-600 mt-2">
              💡 Використовуйте вкладки в чек-листі для переключення між коробками
            </p>
          </div>
        </div>
      )} */}

      {/* Список обраних коробок */}
      {selectedBoxes.map((box, index) => {
        const portionsPerBox = Math.ceil(totalPortions / selectedBoxes.length);
        const start = index * portionsPerBox + 1;
        const end = Math.min((index + 1) * portionsPerBox, totalPortions);
        const isActive = index === activeBoxIndex;
        
        return (
          <div
            key={index + 1}
            className="flex-1 cursor-pointer"
            onClick={() => onActiveBoxChange?.(index)}
          >
            <Card className={`transition-shadow duration-200 ease-in-out ${isActive && 'ring-2 ring-lime-600/80'}`}>
              <CardBody className="flex flex-row items-center gap-4">
                <DynamicIcon name="package" size={20} strokeWidth={1.5} className={`absolute left-20 top-1/2 -translate-y-1/2 scale-[3] opacity-5 ${isActive && "text-lime-700"}`} /> 
                <div className="flex flex-col gap-1">
                  <span className={`text-base font-semibold py-0 duration-200 flex items-center whitespace-nowrap gap-2 ${isActive && "text-lime-700"}`}>Коробка #{ index + 1 }</span>
                  <span className={`text-xs text-gray-600 ${isActive && "text-lime-700"}`}>{box.width}×{box.height}×{box.length} см</span>
                </div>
                <Select
                  aria-label="Коробка"
                  labelPlacement='outside'
                  variant='flat'
                  color='default'
                  size='md'
                  selectedKeys={[box.id.toString()]}
                  onSelectionChange={(keys) => {
                    const selectedKey = Array.from(keys)[0]?.toString();
                    if (selectedKey) {
                      handleBoxChange(selectedKey, index);
                    }
                  }}
                  classNames={{
                    base: "max-w-xs",
                    trigger: `${isActive && "bg-lime-700/10 hover:bg-lime-500/10 shadow-lime-800/20"}`,
                  }}
                  isDisabled={transitionMode}
                  // Запобігаємо спливанню події кліка від Select
                  onClick={(e) => e.stopPropagation()}
                >
                  {boxes
                    .sort((a, b) => Number(a.weight) - Number(b.weight)) // Сортуємо за вагою від меншого до більшого
                    .map((boxOption) => {
                      const portionsPerBox = selectedBoxes.length > 0 ? Math.ceil(totalPortions / selectedBoxes.length) : 0;
                      return (
                        <SelectItem 
                          key={boxOption.id} 
                          textValue={`${boxOption.marking} (${boxOption.qntFrom}-${boxOption.qntTo} порцій)`}
                        >
                          <span className={boxOption.qntTo < portionsPerBox ? 'text-red-600' : ''}>
                            {boxOption.marking} ({boxOption.qntFrom}-{boxOption.qntTo} порцій)
                          </span>
                        </SelectItem>
                      );
                    })}
                </Select>
              </CardBody>
            </Card>
          </div>
        );
      })}

      {/* Перемикач режиму економічного пакування */}
      <div className="flex flex-col gap-3 mt-8">
        <Switch
          isSelected={recommendationMode === 'economical'}
          onValueChange={(checked) => handleModeChange(checked ? 'economical' : 'spacious')}
          color="danger"
          classNames={{
            base: cn(
              "inline-flex flex-row-reverse w-full bg-white items-center",
              "justify-between cursor-pointer rounded-lg gap-3 px-2 py-4 pr-5",
              "data-[selected=true]:ring-danger data-[selected=true]:ring-2",
              "transition-transform duration-200 ease-in-out",
              `${transitionMode ? "opacity-75 scale-[0.98]" : "opacity-100 scale-100"}`
            ),
            wrapper: "p-0 h-4 overflow-visible",
            thumb: cn(
              "w-6 h-6 border-2 shadow-lg",
              "group-data-[hover=true]:border-danger",
              //обраний
              "group-data-[selected=true]:ms-6",
              "group-data-[selected=true]:border-danger",
              // натиснутий
              "group-data-[pressed=true]:w-7",
              "group-data-pressed:group-data-selected:ms-4",
            ),
          }}
        >
          <div className="flex flex-col gap-2">
            <p className="text-medium font-semibold leading-[1.1]">
              Економічний режим пакування {recommendationMode === 'economical' && <span className="bg-danger rounded px-1 py-0.5 text-white text-[10px] tracking-wider">УВІМКНЕНО</span>}
            </p>
            <p className="text-[13px] leading-snug text-default-400">Мінімальна кількість коробок, можливе переповнення.</p>
          </div>
        </Switch>
      </div>

    </div>
  );
};
