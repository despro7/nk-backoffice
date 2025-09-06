import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Select, SelectItem, Switch, Card, CardBody, CardHeader, Button, cn } from '@heroui/react';
import { useApi } from '../hooks/useApi';
import { SettingsBoxes, BoxRecommendationsResponse, BoxRecommendationMode } from '../types/boxes';
import { setCookie, getCookie, deleteCookie, areCookiesEnabled } from '../lib/cookieUtils';
import { DynamicIcon } from 'lucide-react/dynamic';

interface BoxSelectorProps {
  totalPortions: number;
  onBoxesChange: (boxes: SettingsBoxes[], totalWeight: number, boxesInfo?: any) => void;
  onActiveBoxChange?: (activeBoxIndex: number) => void;
  activeBoxIndex: number; // Добавляем activeBoxIndex как prop
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
  
  // Константа для имени куки
  const BOX_MODE_COOKIE = 'nova_box_recommendation_mode';
  
  const [boxes, setBoxes] = useState<SettingsBoxes[]>([]);
  const [recommendations, setRecommendations] = useState<BoxRecommendationsResponse | null>(null);
  const [selectedBoxes, setSelectedBoxes] = useState<SettingsBoxes[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTotalPortions, setLastTotalPortions] = useState<number>(0);
  const [recommendationMode, setRecommendationMode] = useState<BoxRecommendationMode>('spacious');
  const [transitionMode, setTransitionMode] = useState<boolean>(false);
  // const [activeBoxIndex, setActiveBoxIndex] = useState<number>(0); // Удален локальный activeBoxIndex

  // Мемоизируем функцию onBoxesChange чтобы избежать бесконечного цикла
  const memoizedOnBoxesChange = useCallback(onBoxesChange, []);

  // Логика разделения чек-листа на коробки (используется для валидации)
  const getPortionsPerBox = useMemo(() => {
    if (selectedBoxes.length === 0) return 0;
    return Math.ceil(totalPortions / selectedBoxes.length);
  }, [totalPortions, selectedBoxes.length]);

  // Функция для вычисления диапазона порций для коробки (используется для отображения)
  const getBoxPortionsRange = useCallback((boxIndex: number) => {
    if (selectedBoxes.length === 0) return { start: 0, end: 0 };
    
    const portionsPerBox = Math.ceil(totalPortions / selectedBoxes.length);
    const start = boxIndex * portionsPerBox + 1;
    const end = Math.min((boxIndex + 1) * portionsPerBox, totalPortions);
    
    return { start, end };
  }, [selectedBoxes.length, totalPortions]);

  // Загружаем коробки
  const fetchBoxes = useCallback(async () => {
    try {
      const response = await apiCall('/api/boxes');
      
      if (response.ok) {
        const boxesData = await response.json();
        
        if (boxesData && boxesData.length > 0) {
          setBoxes(boxesData);
          setError(null);
        } else {
          setError('База данных коробок пуста. Запустите seed файл.');
          return;
        }
      } else {
        setError(`Не удалось загрузить настройки коробок: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      setError('Ошибка при загрузке настроек коробок');
    }
  }, [apiCall]);

  // Уведомляем родительский компонент об изменении коробок
  const notifyBoxesChange = useCallback((newSelectedBoxes: SettingsBoxes[]) => {
    const totalWeight = newSelectedBoxes.reduce((sum, b) => sum + Number(b.weight), 0);
    
    // Вычисляем portionsPerBox для текущих коробок
    const portionsPerBox = Math.ceil(totalPortions / newSelectedBoxes.length);
    
    // Передаем дополнительную информацию о разделении на коробки
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

  // Загружаем рекомендации
  const fetchRecommendations = useCallback(async (portions: number) => {
    try {
      const response = await apiCall(`/api/boxes/recommendations/${portions}?mode=${recommendationMode}`);
      
      if (response.ok) {
        const recommendationsData: BoxRecommendationsResponse = await response.json();
        setRecommendations(recommendationsData);
        
        // Автоматически выбираем рекомендованные коробки
        const recommendedBoxes = recommendationsData.boxes || [];
        
        // Сначала устанавливаем коробки
        setSelectedBoxes(recommendedBoxes);
        
        // Затем уведомляем родительский компонент
        // Передаем recommendedBoxes напрямую, а не через состояние
        const totalWeight = recommendedBoxes.reduce((sum, b) => sum + Number(b.weight), 0);
        
        // Вычисляем portionsPerBox для переданных коробок
        const portionsPerBox = Math.ceil(portions / recommendedBoxes.length);
        
        // Передаем дополнительную информацию о разделении на коробки
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
        setError(errorData.error || 'Не удалось получить рекомендации по коробкам');
      }
    } catch (err) {
      setError('Ошибка при получении рекомендаций по коробкам');
    } finally {
      setLoading(false);
      setTransitionMode(false);
    }
  }, [apiCall, memoizedOnBoxesChange, activeBoxIndex, recommendationMode]);

  // Функция для обновления рекомендаций при изменении режима
  const handleModeChange = useCallback((newMode: BoxRecommendationMode) => {
    console.log('handleModeChange called with:', newMode);
    console.log('Setting cookie:', BOX_MODE_COOKIE, 'to:', newMode);
    
    setTransitionMode(true);
    setRecommendationMode(newMode);
    
    // Сохраняем выбранный режим в куки на 365 дней
    setCookie(BOX_MODE_COOKIE, newMode, { expires: 365 });
    
    // Проверяем, что кука установилась
    setTimeout(() => {
      const savedValue = getCookie(BOX_MODE_COOKIE);
      console.log('Cookie value after setting:', savedValue);
    }, 100);
    
    // Очищаем предыдущие ошибки при смене режима
    setError(null);
    
    // Плавно скрываем старые рекомендации
    setTimeout(() => {
      setTransitionMode(false);
    }, 150);
  }, [BOX_MODE_COOKIE]);

  // Функция для сброса сохраненного режима
  const handleResetMode = useCallback(() => {
    const defaultMode: BoxRecommendationMode = 'economical';
    setTransitionMode(true);
    setRecommendationMode(defaultMode);
    
    // Удаляем сохраненный режим из куки
    deleteCookie(BOX_MODE_COOKIE);
    
    // Очищаем ошибки
    setError(null);
    
    // Плавно скрываем старые рекомендации
    setTimeout(() => {
      setTransitionMode(false);
    }, 150);
  }, [BOX_MODE_COOKIE]);

  // Загружаем коробки при монтировании
  useEffect(() => {
    if (boxes.length > 0) return;
    fetchBoxes();
  }, [fetchBoxes, boxes.length]);

  // Синхронизируем режим с куками при монтировании
  useEffect(() => {
    console.log('Initializing recommendation mode from cookies...');
    console.log('Cookies enabled:', areCookiesEnabled());
    console.log('All cookies:', document.cookie);
    
    const savedMode = getCookie(BOX_MODE_COOKIE);
    console.log('Saved mode from cookie:', savedMode);
    if (savedMode === 'spacious' || savedMode === 'economical') {
      console.log('Setting recommendation mode to:', savedMode);
      setRecommendationMode(savedMode);
    } else {
      console.log('No valid cookie found, using default mode: economical');
    }
  }, [BOX_MODE_COOKIE]);

  // Загружаем рекомендации при изменении порций или режима
  useEffect(() => {
    if (boxes.length === 0 || totalPortions <= 0 || loading) {
      return;
    }

    // Проверяем, изменились ли порции или режим
    const shouldFetch = totalPortions !== lastTotalPortions || 
                       (recommendations && recommendations.mode !== recommendationMode);

    if (shouldFetch) {
      // Если меняется только режим, не показываем полную загрузку
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

  // Убираем отдельный useEffect для режима, так как он теперь обрабатывается выше

  // Обработчик изменения выбора коробки
  const handleBoxChange = useCallback((boxId: string, index: number) => {
    const box = boxes.find(b => b.id.toString() === boxId);
    if (!box) return;

    const newSelectedBoxes = [...selectedBoxes];
    newSelectedBoxes[index] = box;
    setSelectedBoxes(newSelectedBoxes);

    // Уведомляем родительский компонент об изменении
    notifyBoxesChange(newSelectedBoxes);
  }, [boxes, selectedBoxes, notifyBoxesChange]);

  // Добавление новой коробки
  const addBox = useCallback(() => {
    if (boxes.length > 0) {
      const newSelectedBoxes = [...selectedBoxes, boxes[0]];
      setSelectedBoxes(newSelectedBoxes);
      
      // Уведомляем родительский компонент об изменении
      notifyBoxesChange(newSelectedBoxes);
    }
  }, [boxes, selectedBoxes, notifyBoxesChange]);

  // Удаление коробки
  const removeBox = useCallback((index: number) => {
    const newSelectedBoxes = selectedBoxes.filter((_, i) => i !== index);
    setSelectedBoxes(newSelectedBoxes);
    
    // Уведомляем родительский компонент об изменении
    notifyBoxesChange(newSelectedBoxes);
  }, [selectedBoxes, notifyBoxesChange]);

  // Вычисляемые значения
  const totalBoxesWeight = useMemo(() => 
    selectedBoxes.reduce((sum, b) => sum + Number(b.weight), 0), 
    [selectedBoxes]
  );

  const totalMaxCapacity = useMemo(() => 
    selectedBoxes.reduce((sum, b) => sum + b.qntTo, 0), 
    [selectedBoxes]
  );

  // Валидация коробок
  const isBoxesValid = useMemo(() => {
    if (selectedBoxes.length === 0) return true;
    
    const portionsPerBox = Math.ceil(totalPortions / selectedBoxes.length);
    // Проверяем каждую коробку отдельно
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
    <div className="w-full flex flex-col gap-8">
      {/* Свитчер режима рекомендаций */}
      <div className="flex flex-col gap-3">
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
              //selected
              "group-data-[selected=true]:ms-6",
              "group-data-[selected=true]:border-danger",
              // pressed
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

      {/* Информация о рекомендациях */}
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
            <p><strong>Рекомендуется:</strong> {recommendations.totalBoxes} коробок</p>
            <p><strong>Общий вес коробок:</strong> {Number(recommendations.totalWeight).toFixed(1)} кг</p>
            {recommendations.remainingQuantity && recommendations.remainingQuantity > 0 && (
              <p className="text-orange-600">
                <strong>Внимание:</strong> {recommendations.remainingQuantity} порций не поместится в выбранные коробки
              </p>
            )}
            {recommendations.overflowWarning && (
              <p className="text-orange-600 font-medium">
                ⚠️ В экономичном режиме возможно переполнение коробок
              </p>
            )}
          </div>
        </div>
      )} */}

      {/* Предупреждение о неподходящих коробках */}
      {/* {hasInappropriateBoxes && (
        <div className={`bg-red-50 border border-red-200 rounded-lg p-3 duration-300 ease-in-out ${
          transitionMode ? 'opacity-50 transform scale-95' : 'opacity-100 transform scale-100'
        }`}>
          <div className="text-sm text-red-800">
            <p><strong>⚠️ Внимание:</strong> Выбраны коробки, которые не вмещают свою часть заказа</p>
            <p>Каждая коробка должна вмещать минимум {getPortionsPerBox} порций</p>
          </div>
        </div>
      )} */}

      {/* Информация о разделении на коробки */}
      {/* {selectedBoxes.length > 1 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-sm text-gray-700">
            <p><strong>Заказ разделен на {selectedBoxes.length} коробки:</strong></p>
            <p>По {getPortionsPerBox} порций на коробку</p>
            <p className="text-blue-600 mt-2">
              💡 Используйте вкладки в чек-листе для переключения между коробками
            </p>
          </div>
        </div>
      )} */}

      {/* Список выбранных коробок */}
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
            <Card 
              className={`duration-300 ease-in-out ${
                isActive ? 'ring-2 ring-blue-500 border-blue-600' : 'border-gray-200 hover:border-blue-300'
              } ${
                transitionMode ? 'opacity-75 transform scale-[0.98]' : 'opacity-100 transform scale-100'
              }`}
            >
              <CardHeader className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold px-1 py-0 duration-200 flex items-center gap-2">
                  <DynamicIcon name="package" size={20} strokeWidth={1.5} /> 
                  Коробка №{ index + 1 }
                </span>
                <div className="text-sm px-1 text-gray-600">{box.width}×{box.height}×{box.length} см</div>
              </CardHeader>
              <CardBody className="pt-0 pb-4">
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
                  className="max-w-xs"
                  isDisabled={transitionMode}
                  // Предотвращаем всплытие события клика от Select
                  onClick={(e) => e.stopPropagation()}
                >
                  {boxes
                    .sort((a, b) => Number(a.weight) - Number(b.weight)) // Сортируем по весу от меньшего к большему
                    .map((boxOption) => {
                      const portionsPerBox = selectedBoxes.length > 0 ? Math.ceil(totalPortions / selectedBoxes.length) : 0;
                      return (
                        <SelectItem 
                          key={boxOption.id} 
                          textValue={`${boxOption.marking} – ${boxOption.qntFrom}-${boxOption.qntTo} порцій`}
                        >
                          <span className={boxOption.qntTo < portionsPerBox ? 'text-red-600' : ''}>
                            {boxOption.marking} ({boxOption.qntFrom}-{boxOption.qntTo} порцій, {Number(boxOption.weight).toFixed(1)} кг)
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

      {/* Общая информация */}
      {/* {selectedBoxes.length > 0 && (
        <div className={`border rounded-lg p-3 ${isBoxesValid ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-sm ${isBoxesValid ? 'text-gray-700' : 'text-red-800'}`}>
            <p><strong>Всього коробок:</strong> {selectedBoxes.length}</p>
            <p><strong>Загальна вага коробок:</strong> {totalBoxesWeight.toFixed(1)} кг</p>
            <p><strong>Максимальна місткість:</strong> {totalMaxCapacity} порцій</p>
            {!isBoxesValid && (
              <p className="font-semibold mt-2">
                ⚠️ Увага: Деякі коробки не вміщують свою частину замовлення ({getPortionsPerBox} порцій на коробку)
              </p>
            )}
          </div>
        </div>
      )} */}
    </div>
  );
};
