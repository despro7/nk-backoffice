import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Button } from '../components/ui/button';
import { formatDateTime, formatPrice } from '../lib/formatUtils';
import { addToast } from '@heroui/toast';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  ChipProps,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  SortDescriptor
} from '@heroui/react';
import { LoggingService } from '@/services/LoggingService';

interface Product {
  id: string;
  sku: string;
  name: string;
  costPerItem: number;
  currency: string;
  categoryId: number;
  categoryName: string;
  weight?: number; // Вес в граммах
  set: any; // Уже распарсенный объект или null
  additionalPrices: any; // Уже распарсенный объект или null
  stockBalanceByStock: any; // Уже распарсенный объект или null
  lastSyncAt: string;
}

interface ProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface StatsResponse {
  totalProducts: number;
  categoriesCount: Array<{
    name: string;
    count: number;
  }>;
  lastSync: string;
}

const ProductSets: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]); // Все товары для поиска названий в комплектах
  const [stats, setStats] = useState<StatsResponse | null>(null);

  // Безопасная функция для получения остатков по складам
  const parseStockBalance = (stockBalanceByStock: any): Record<string, number> => {
    if (!stockBalanceByStock) return {};
    
    try {
      // Если это уже объект, возвращаем как есть
      if (typeof stockBalanceByStock === 'object' && stockBalanceByStock !== null) {
        return stockBalanceByStock as Record<string, number>;
      }
      
      // Если это строка, пытаемся распарсить (для обратной совместимости)
      if (typeof stockBalanceByStock === 'string') {
        const parsed = JSON.parse(stockBalanceByStock);
        return parsed || {};
      }
      
      return {};
    } catch (error) {
      console.warn('Ошибка парсинга остатков:', error, 'Original data:', stockBalanceByStock);
      return {};
    }
  };
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [testResults, setTestResults] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<{
    isRunning: boolean;
    message: string;
    syncedProducts: number;
    syncedSets: number;
    errors: string[];
  } | null>(null);
  const [stockSyncing, setStockSyncing] = useState(false);
  const [stockSyncStatus, setStockSyncStatus] = useState<{
    isRunning: boolean;
    message: string;
    updatedProducts: number;
    errors: string[];
  } | null>(null);

  // Состояние для сортировки
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor | undefined>(undefined);

  // Состояние для редактирования веса
  const [editingWeight, setEditingWeight] = useState<{ [key: string]: string }>({});
  const [savingWeight, setSavingWeight] = useState<string | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0); // Для принудительного обновления
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Индекс для быстрого и стабильного поиска товаров по SKU
  const productsBySku = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of allProducts) {
      const key = product.sku?.toString().trim().toLowerCase();
      if (key) map.set(key, product);
    }
    return map;
  }, [allProducts]);

  // Определяем колонки таблицы
  const columns = [
    {
      key: 'name',
      label: 'Товар',
      allowsSorting: true,
    },
    {
      key: 'category',
      label: 'Категорія',
      allowsSorting: true,
    },
    {
      key: 'costPerItem',
      label: 'Ціна',
      allowsSorting: true,
    },
    {
      key: 'weight',
      label: 'Вага (гр)',
      allowsSorting: true,
    },
    {
      key: 'stock1',
      label: 'Склад 1',
      allowsSorting: true,
    },
    {
      key: 'stock2',
      label: 'Склад 2',
      allowsSorting: true,
    },
    {
      key: 'set',
      label: 'Комплект',
      allowsSorting: false,
    },
    {
      key: 'lastSyncAt',
      label: 'Оновлено',
      allowsSorting: true,
    },
  ];

  // Фильтруем и сортируем данные для отображения
  const displayProducts = useMemo(() => {
    let filtered = [...products];
    
    // Фильтр по поиску
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Фильтр по категории
    if (selectedCategory) {
      filtered = filtered.filter(product => 
        product.categoryName === selectedCategory
      );
    }
    
    // Сортировка
    if (sortDescriptor?.column) {
      filtered.sort((a, b) => {
        let first: any = a[sortDescriptor.column as keyof Product];
        let second: any = b[sortDescriptor.column as keyof Product];
        
        // Обработка специальных случаев для колонок
        if (sortDescriptor.column === 'category') {
          first = a.categoryName;
          second = b.categoryName;
        } else if (sortDescriptor.column === 'stock1') {
          const stockA = parseStockBalance(a.stockBalanceByStock);
          const stockB = parseStockBalance(b.stockBalanceByStock);
          first = stockA["1"] || 0;
          second = stockB["1"] || 0;
        } else if (sortDescriptor.column === 'stock2') {
          const stockA = parseStockBalance(a.stockBalanceByStock);
          const stockB = parseStockBalance(b.stockBalanceByStock);
          first = stockA["2"] || 0;
          second = stockB["2"] || 0;
        } else if (sortDescriptor.column === 'weight') {
          first = a.weight || 0;
          second = b.weight || 0;
        }
        
        if (first === null || first === undefined) first = '';
        if (second === null || second === undefined) second = '';
        
        let cmp = 0;
        if (first < second) cmp = -1;
        else if (first > second) cmp = 1;
        
        return sortDescriptor.direction === 'descending' ? -cmp : cmp;
      });
    }
    
    return filtered;
  }, [products, searchTerm, selectedCategory, sortDescriptor]);

  // Функция для рендеринга ячеек
  const renderCell = (product: Product, columnKey: React.Key) => {
    switch (columnKey) {
      case 'name':
        return (
          <div>
            <div className="text-sm font-bold text-gray-900">{product.name}</div>
            <div className="text-sm font-normal text-gray-500">
              {product.weight && (
                <span className="flex gap-1 items-center">
                  <DynamicIcon name="weight" size={14} /> {product.weight} гр.
                </span>
              )}
              <span className="flex gap-1 items-center">
                <DynamicIcon name="barcode" size={14} /> {product.sku}
              </span>
            </div>
          </div>
        );
      
      case 'category':
        const categoryColor: ChipProps["color"] = 
          product.categoryId === 1 ? "danger" :
          product.categoryId === 2 ? "success" : "secondary";
        
        return (
          <Chip color={categoryColor} variant="flat" size="sm" className={`${categoryColor === "secondary" && "bg-purple-200"}`}>
            {product.categoryName || 'Без категорії'}
          </Chip>
        );
      
      case 'costPerItem':
        return (
          <span className="text-sm text-gray-900">
            {formatPrice(product.costPerItem)}
          </span>
        );
      
      case 'weight':
        const productIdStr = product.id.toString();
        const isEditing = editingWeight[productIdStr] !== undefined;
        const isSaving = savingWeight === productIdStr;
        const currentWeight = product.weight || 0;
        
        return (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={(el) => {
                    inputRefs.current[productIdStr] = el;
                  }}
                  key={`weight-input-${productIdStr}-${forceUpdate}`}
                  type="number"
                  defaultValue={editingWeight[productIdStr] ?? ''}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setEditingWeight(prev => {
                      const newState = {
                        ...prev,
                        [productIdStr]: newValue
                      };
                      return newState;
                    });
                  }}
                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="1"
                  disabled={isSaving}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      finishEditingWeight(productIdStr);
                    } else if (e.key === 'Escape') {
                      cancelEditingWeight(productIdStr);
                    }
                  }}
                  autoFocus
                  placeholder="0"
                  onFocus={(e) => {
                    // Выделяем весь текст при фокусе для удобства редактирования
                    e.target.select();
                  }}
                />
                <Button
                  size="sm"
                  color="success"
                  variant="outline"
                  onClick={() => finishEditingWeight(productIdStr)}
                  disabled={isSaving}
                  className="min-w-0 p-1"
                >
                  {isSaving ? (
                    <DynamicIcon name="loader-2" className="animate-spin" size={12} />
                  ) : (
                    <DynamicIcon name="check" size={12} />
                  )}
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  variant="outline"
                  onClick={() => cancelEditingWeight(productIdStr)}
                  disabled={isSaving}
                  className="min-w-0 p-1"
                >
                  <DynamicIcon name="x" size={12} />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <div 
                  className="text-sm text-gray-900 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded min-w-[60px]"
                  onClick={() => startEditingWeight(productIdStr, currentWeight)}
                  title="Нажмите для редактирования"
                >
                  {currentWeight || '—'} г
                </div>
                {currentWeight === 0 && (
                  <Button
                    size="sm"
                    color="primary"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Автоматически устанавливаем вес по умолчанию на основе категории
                      const defaultWeight = product.categoryId === 1 ? 410 : 330; // 1 - первые блюда, остальные - вторые
                      updateProductWeight(productIdStr, defaultWeight);
                    }}
                    className="min-w-0 p-1"
                    title={`Установить вес по умолчанию: ${product.categoryId === 1 ? '410' : '330'}г`}
                  >
                    <DynamicIcon name="plus" size={12} />
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      
      case 'stock1':
        const stock1Data = parseStockBalance(product.stockBalanceByStock);
        const stock1Value = stock1Data["1"] || 0;
        return (
          <span className={`text-sm ${stock1Value > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
            {stock1Value}
          </span>
        );
      
      case 'stock2':
        const stock2Data = parseStockBalance(product.stockBalanceByStock);
        const stock2Value = stock2Data["2"] || 0;
        return (
          <span className={`text-sm ${stock2Value > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
            {stock2Value}
          </span>
        );
      
      case 'set':
        if (product.set) {
          try {
            // Данные уже приходят в виде объекта с сервера
            const setData = product.set;
            if (setData && Array.isArray(setData) && setData.length > 0) {
              return (
                <div className="text-sm text-gray-900">
                  <div className="font-medium">Комплект ({setData.length} позицій)</div>
                  <div className="text-xs text-gray-500">
                    {setData.map((item, index) => {
                      const targetSku = String(item.id).trim().toLowerCase();
                      const componentProduct = productsBySku.get(targetSku) ||
                        allProducts.find(p => p.id?.toString() === String(item.id));
                      const componentName = componentProduct?.name || item.id;
                      
                      return (
                        <div key={index}>
                          <span title={`SKU: ${item.id}`}>
                            {componentName} ({item.id})×{item.quantity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
          } catch (error) {
            console.error('Error processing set data:', error);
          }
        }
        return <span className="text-sm text-gray-500">Не комплект</span>;
      
      case 'lastSyncAt':
        return (
          <span className="text-sm text-gray-500">
            {formatDateTime(product.lastSyncAt)}
          </span>
        );
      
      default:
        return '';
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '100' // Увеличиваем лимит для загрузки всех товаров
      });

      if (searchTerm) {
        params.append('search', searchTerm);
      }

      if (selectedCategory) {
        params.append('category', selectedCategory);
      }

      const response = await fetch(`/api/products?${params}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data: ProductsResponse = await response.json();
        setProducts(data.products);
        setPagination(data.pagination);
        
        // Отладочная информация для первого товара
        if (data.products.length > 0) {
          const firstProduct = data.products[0];
          LoggingService.productSetsLog('🛒 [SettingsProductSets] Перший товар - структура даних:', {
            categoryId: firstProduct.categoryId,
            categoryIdType: typeof firstProduct.categoryId,
            categoryIdIsNull: firstProduct.categoryId === null,
            categoryIdIsUndefined: firstProduct.categoryId === undefined,
            categoryName: firstProduct.categoryName,
            hasStockData: !!firstProduct.stockBalanceByStock,
            product: firstProduct.name,
            set: firstProduct.set,
            setType: typeof firstProduct.set,
            stockBalanceByStock: firstProduct.stockBalanceByStock,
            stockType: typeof firstProduct.stockBalanceByStock,
            fullProduct: firstProduct, // Полная структура товара
          });
          
          LoggingService.productSetsLog('🛒 [SettingsProductSets] Все товары - categoryId статистика:', 
            data.products.map(p => ({
              sku: p.sku,
              name: p.name,
              categoryId: p.categoryId,
              categoryIdType: typeof p.categoryId,
              categoryName: p.categoryName
            }))
          );
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка всех товаров для поиска названий в комплектах
  const fetchAllProducts = async () => {
    try {
      const response = await fetch('/api/products?limit=1000', {
        credentials: 'include'
      });

      if (response.ok) {
        const data: ProductsResponse = await response.json();
        setAllProducts(data.products);
      }
    } catch (error) {
      console.error('Error fetching all products:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/products/stats/summary', {
        credentials: 'include'
      });

      if (response.ok) {
        const data: StatsResponse = await response.json();
        setStats(data);
        
        // Извлекаем уникальные категории
        const uniqueCategories = [...new Set(data.categoriesCount.map(c => c.name))];
        setCategories(uniqueCategories);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Синхронизация товаров с Dilovod
  const syncProductsWithDilovod = async () => {
    if (!['admin', 'boss'].includes(user?.role || '')) {
      setSyncStatus({
        isRunning: false,
        message: 'У вас нет прав для выполнения синхронизации',
        syncedProducts: 0,
        syncedSets: 0,
        errors: ['Access denied']
      });
      return;
    }

    setSyncStatus({
      isRunning: true,
      message: 'Начинаем синхронизацию...',
      syncedProducts: 0,
      syncedSets: 0,
      errors: []
    });

    try {
      const response = await fetch('/api/products/sync', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        setSyncStatus({
          isRunning: false,
          message: result.message,
          syncedProducts: result.syncedProducts,
          syncedSets: result.syncedSets,
          errors: result.errors || []
        });
        
        // Обновляем список товаров после синхронизации
        fetchProducts();
        fetchAllProducts(); // Обновляем все товары для комплектов
      } else {
        const error = await response.json();
        setSyncStatus({
          isRunning: false,
          message: `Ошибка: ${error.error || 'Неизвестная ошибка'}`,
          syncedProducts: 0,
          syncedSets: 0,
          errors: [error.error || 'Неизвестная ошибка']
        });
      }
    } catch (error) {
      setSyncStatus({
        isRunning: false,
        message: `Ошибка сети: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        syncedProducts: 0,
        syncedSets: 0,
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка']
      });
    }
  };

  // Синхронизировать остатки товаров с Dilovod
  const syncStockBalances = async () => {
    try {
      setStockSyncing(true);
      setStockSyncStatus({
        isRunning: true,
        message: 'Синхронизация остатков...',
        updatedProducts: 0,
        errors: []
      });

      const response = await fetch('/api/products/sync-stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          setStockSyncStatus({
            isRunning: false,
            message: `Остатки успешно синхронизированы! Обновлено ${result.updatedProducts} товаров`,
            updatedProducts: result.updatedProducts,
            errors: result.errors || []
          });
          
          // Обновляем список товаров после синхронизации остатков
          await fetchProducts();
        } else {
          setStockSyncStatus({
            isRunning: false,
            message: `Ошибка синхронизации остатков: ${result.message}`,
            updatedProducts: 0,
            errors: result.errors || []
          });
        }
      } else {
        const errorData = await response.json();
        setStockSyncStatus({
          isRunning: false,
          message: `Ошибка API: ${errorData.error || 'Неизвестная ошибка'}`,
          updatedProducts: 0,
          errors: [errorData.error || 'Неизвестная ошибка']
        });
      }
    } catch (error) {
      console.error('Ошибка синхронизации остатков:', error);
      setStockSyncStatus({
        isRunning: false,
        message: `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        updatedProducts: 0,
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка']
      });
    } finally {
      setStockSyncing(false);
    }
  };

  // Тестирование получения комплектов
  const testSetsOnly = async () => {
    if (!['admin', 'boss'].includes(user?.role || '')) {
      alert('У вас нет прав для выполнения тестирования');
      return;
    }

    try {
      console.log('Начинаем тестирование комплектов...');
      const response = await fetch('/api/products/test-sets-only', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Результат тестирования:', result);
        
        if (result.success) {
          alert(`Тест завершен успешно!\n\n${result.message}\n\nПроверьте консоль сервера для детальной информации.`);
        } else {
          alert(`Тест завершен с ошибкой:\n\n${result.message}`);
        }
      } else {
        const error = await response.json();
        alert(`Ошибка тестирования: ${error.error || 'Неизвестная ошибка'}`);
      }
    } catch (error) {
      alert(`Ошибка сети: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  };

  // Тест получения одного товара по SKU напрямую из Dilovod
  const testSingleDilovodProduct = async () => {
    if (!['admin', 'boss'].includes(user?.role || '')) {
      addToast({
        title: "Недостатньо прав",
        description: 'Лише адміністратори можуть виконувати цей тест',
        color: "warning"
      });
      return;
    }

    const sku = window.prompt('Введіть SKU для перевірки в Dilovod:');
    if (!sku) return;

    try {
      const response = await fetch(`/api/products/dilovod/${encodeURIComponent(sku)}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        addToast({
          title: "Помилка",
          description: `Не вдалося отримати товар: ${err.error || response.statusText}`,
          color: "danger"
        });
        LoggingService.productSetsLog('🧪 [SingleDilovodTest] Помилка отримання товару:', err);
        return;
      }

      const data = await response.json();
      const product = data.product;
      LoggingService.productSetsLog('🧪 [SingleDilovodTest] Результат товару:', product);
      addToast({
        title: "Товар отримано",
        description: `SKU: ${product.sku}, Категорія: ${product.category?.name || '—'} (id: ${product.category?.id ?? '—'})`,
        color: "success"
      });
    } catch (error) {
      addToast({
        title: "Помилка мережі",
        description: `Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
        color: "danger"
      });
    }
  };

  // Очистка статуса синхронизации
  const clearSyncStatus = () => {
    setSyncStatus(null);
  };

  const clearTestResults = () => {
    setTestResults('');
  };

  const addTestResult = (result: any) => {
    const timestamp = new Date().toLocaleString('uk-UA');
    const separator = '\n' + '='.repeat(80) + '\n';
    const timestampedResult = `[${timestamp}] ${JSON.stringify(result, null, 2)}`;
    
    setTestResults(prev => {
      if (prev) {
        return prev + separator + timestampedResult;
      } else {
        return timestampedResult;
      }
    });
  };

  const testDilovodConnection = async () => {
    try {
      console.log('Тестируем подключение к Dilovod...');
      const response = await fetch('/api/products/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      
      const result = await response.json();
      console.log('Результат теста подключения:', result);
      
      addTestResult(result);
    } catch (error) {
      console.error('Ошибка теста подключения:', error);
      addTestResult({ error: 'Ошибка: ' + error });
    }
  };

  const testBalanceBySku = async () => {
    try {
      console.log('Тестируем получение остатков по списку SKU...');
      const response = await fetch('/api/products/test-balance-by-sku', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      
      const result = await response.json();
      console.log('Результат получения остатков по SKU:', result);
      
      addTestResult(result);
    } catch (error) {
      console.error('Ошибка получения остатков по SKU:', error);
      addTestResult({ error: 'Ошибка: ' + error });
    }
  };

  const clearSkuCache = async () => {
    try {
      console.log('Очищаем кеш SKU...');
      const response = await fetch('/api/products/clear-sku-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      
      const result = await response.json();
      console.log('Результат очистки кеша SKU:', result);
      
      addTestResult(result);
    } catch (error) {
      console.error('Ошибка очистки кеша SKU:', error);
      addTestResult({ error: 'Ошибка: ' + error });
    }
  };

  // Функция для обновления веса товара
  const updateProductWeight = async (productId: string, newWeight: number) => {
    try {
      setSavingWeight(productId);
      
      const response = await fetch(`/api/products/${productId}/weight`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ weight: newWeight }),
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Обновляем локальное состояние
        setProducts(prevProducts =>
          prevProducts.map(product =>
            product.id.toString() === productId ? { ...product, weight: newWeight } : product
          )
        );
        
        // Очищаем состояние редактирования
        setEditingWeight(prev => {
          const newState = { ...prev };
          delete newState[productId];
          return newState;
        });
        
        addToast({
          title: "Успішно оновлено",
          description: `Вес товара обновлен на ${newWeight}г.`, 
          color: "success"
        });

      } else {
        const errorText = await response.text();
        
        try {
          const error = JSON.parse(errorText);
          addToast({
            title: "Помилка",
            description: `Ошибка обновления веса: ${error.error || 'Неизвестная ошибка'}`, 
            color: "danger"
          });
        } catch {
          addToast({
            title: "Помилка",
            description: `Ошибка обновления веса: ${response.status} ${response.statusText}`, 
            color: "danger"
          });
        }
      }
    } catch (error) {
      addToast({
        title: "Помилка мережі",
        description: `Ошибка сети: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`, 
        color: "danger"
      });
    } finally {
      setSavingWeight(null);
    }
  };

  // Функция для начала редактирования веса
  const startEditingWeight = (productId: string, currentWeight: number) => {
    setEditingWeight(prev => {
      const newState = {
        ...prev,
        [productId]: currentWeight.toString()
      };
      return newState;
    });
  };

  // Функция для завершения редактирования веса
  const finishEditingWeight = (productId: string) => {
    // Всегда получаем значение из ref (DOM элемента), так как оно актуальное
    const weightValue = inputRefs.current[productId]?.value;
    
    if (weightValue !== undefined && weightValue !== '') {
      const newWeight = parseInt(weightValue);
      if (!isNaN(newWeight) && newWeight >= 0) {
        updateProductWeight(productId, newWeight);
      } else {
        addToast({
          title: "Некоректний ввід",
          description: 'Введите корректный вес (целое число >= 0)', 
          color: "warning"
        });
        setEditingWeight(prev => {
          const newState = { ...prev };
          delete newState[productId];
          return newState;
        });
      }
    } else {
      addToast({
        title: "Відсутній ввід",
        description: 'Введите вес', 
        color: "warning"
      });
      setEditingWeight(prev => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
    }
  };

  // Функция для отмены редактирования веса
  const cancelEditingWeight = (productId: string) => {
    setEditingWeight(prev => {
      const newState = { ...prev };
      delete newState[productId];
      return newState;
    });
  };

  // Автоматическое обновление при изменении фильтров
  useEffect(() => {
    fetchProducts();
    fetchStats();
    fetchAllProducts();
  }, []); // Загружаем только при монтировании

  // Обновление данных при изменении категории
  useEffect(() => {
    if (products.length > 0) {
      // Обновляем данные при изменении категории
      fetchProducts();
    }
  }, [selectedCategory]);

  // Задержка для поиска, чтобы не делать запрос при каждом символе
  useEffect(() => {
    const timer = setTimeout(() => {
      if (products.length > 0) {
        fetchProducts();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);





  if (!user || !['admin', 'boss'].includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <DynamicIcon name="lock" size={48} className="mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-600">Доступ заборонено</h2>
          <p className="text-gray-500">У вас немає прав для перегляду цієї сторінки</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-full">
      <div className="mb-6">
        <p className="text-gray-600">Управління товарами та комплектами з системи Dilovod</p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-800">Всього товарів</h3>
          <p className="text-2xl font-bold text-blue-600">{stats?.totalProducts || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-800">Категорій</h3>
          <p className="text-2xl font-bold text-green-600">{stats?.categoriesCount?.length || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-800">Остання синхронізація</h3>
          <p className="text-sm text-gray-600">
            {stats?.lastSync ? new Date(stats.lastSync).toLocaleString('uk-UA') : 'Не синхронізовано'}
          </p>
        </div>
      </div>

      {/* Статус синхронизации */}
      {syncStatus && (
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-800">
              Статус синхронизации
              {syncStatus.isRunning && (
                <span className="ml-2 inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
              )}
            </h3>
            <Button
              onClick={clearSyncStatus}
              variant="outline"
              size="sm"
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </Button>
          </div>
          
          <div className="space-y-2">
            <p className={`text-sm ${syncStatus.isRunning ? 'text-blue-600' : syncStatus.errors.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {syncStatus.message}
            </p>
            
            {!syncStatus.isRunning && syncStatus.syncedProducts > 0 && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Синхронизировано товаров:</span>
                  <span className="ml-2 text-green-600 font-semibold">{syncStatus.syncedProducts}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Комплектов:</span>
                  <span className="ml-2 text-blue-600 font-semibold">{syncStatus.syncedSets}</span>
                </div>
              </div>
            )}
            
            {syncStatus.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-red-700 mb-2">Ошибки:</p>
                <ul className="text-sm text-red-600 space-y-1">
                  {syncStatus.errors.map((error, index) => (
                    <li key={index} className="pl-2 border-l-2 border-red-300">
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Статус синхронизации остатков */}
      {stockSyncStatus && (
        <div className={`bg-white p-4 rounded-lg shadow mb-6 ${
          stockSyncStatus.isRunning 
            ? 'bg-blue-50 border border-blue-200' 
            : stockSyncStatus.errors.length > 0 
              ? 'bg-red-50 border border-red-200' 
              : 'bg-green-50 border border-green-200'
        }`}>
          <div className="flex items-center">
            {stockSyncStatus.isRunning ? (
              <DynamicIcon name="loader-2" className="animate-spin mr-2 text-blue-600" size={16} />
            ) : stockSyncStatus.errors.length > 0 ? (
              <DynamicIcon name="alert-circle" className="mr-2 text-red-600" size={16} />
            ) : (
              <DynamicIcon name="check-circle" className="mr-2 text-green-600" size={16} />
            )}
            
            <div>
              <p className={`font-medium ${
                stockSyncStatus.isRunning 
                  ? 'text-blue-800' 
                  : stockSyncStatus.errors.length > 0 
                    ? 'text-red-800' 
                    : 'text-green-800'
              }`}>
                {stockSyncStatus.message}
              </p>
              
              {stockSyncStatus.updatedProducts > 0 && (
                <p className="text-sm text-green-700 mt-1">
                  Успішно оновлено {stockSyncStatus.updatedProducts} товарів
                </p>
              )}
              
              {stockSyncStatus.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-red-700 mb-1">Помилки:</p>
                  <ul className="text-sm text-red-600 space-y-1">
                    {stockSyncStatus.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Таблица товаров */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table
          key={`products-table-${Object.keys(editingWeight).length}-${allProducts.length}`}
          aria-label="Таблиця товарів та комплектів"
            sortDescriptor={sortDescriptor}
            onSortChange={setSortDescriptor}
            classNames={{
              wrapper: "min-h-[400px]",
            }}
            topContent={
              <div className="flex flex-col gap-4 p-2">
                {/* Статистика и информация */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                   <div className="flex flex-col sm:flex-row gap-4 text-small text-default-400 pl-1">
                     <span>Всього товарів: {products.length}</span>
                     {(searchTerm || selectedCategory) && (
                       <span>Знайдено: {displayProducts.length}</span>
                     )}
                     {loading && (
                       <span className="flex items-center gap-1">
                         <DynamicIcon name="loader-2" className="animate-spin" size={14} />
                         Оновлення...
                       </span>
                     )}
                   </div>
                  
                  {/* Кнопки действий */}
                  <div className="flex flex-wrap gap-4 pb-6">
                    <Button
                      onClick={syncProductsWithDilovod}
                      disabled={syncStatus?.isRunning || !['admin', 'boss'].includes(user?.role || '')}
                      size="sm"
                      color="primary"
                    >
                      {syncStatus?.isRunning ? (
                        <>
                          <DynamicIcon name="loader-2" className="mr-2 animate-spin" size={14} />
                          Синхронізація...
                        </>
                      ) : (
                        <>
                          <DynamicIcon name="refresh-cw" className="mr-2" size={14} />
                          Синхронізувати товари з Dilovod
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={syncStockBalances}
                      disabled={stockSyncing || !['admin', 'boss'].includes(user?.role || '')}
                      size="sm"
                      color="success"
                    >
                      {stockSyncing ? (
                        <>
                          <DynamicIcon name="loader-2" className="mr-2 animate-spin" size={14} />
                          Синхронізація залишків...
                        </>
                      ) : (
                        <>
                          <DynamicIcon name="refresh-cw" className="mr-2" size={14} />
                          Оновити залишки з Dilovod
                        </>
                      )}
                    </Button>

                    <Button
                       onClick={testSetsOnly}
                       disabled={!['admin', 'boss'].includes(user?.role || '')}
                       size="sm"
                       variant="outline"
                     >
                       <DynamicIcon name="package-x" className="mr-2" size={14} />
                       Тест комплектацій
                    </Button>
                    <Button
                      onClick={testSingleDilovodProduct}
                      disabled={!['admin', 'boss'].includes(user?.role || '')}
                      size="sm"
                      variant="outline"
                    >
                      <DynamicIcon name="search" className="mr-2" size={14} />
                      Тест SKU (Dilovod)
                    </Button>
                   </div>
                   
                   {/* Информация о правах доступа */}
                   {!['admin', 'boss'].includes(user?.role || '') && (
                     <p className="text-xs text-default-400 mt-2 text-center">
                       Тільки адміністратори можуть виконувати синхронізацію
                     </p>
                   )}
                </div>

                {/* Поиск и фильтры */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <DynamicIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      placeholder="Пошук по назві або SKU..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full sm:w-auto pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {searchTerm && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <DynamicIcon name="x" size={14} />
                      </Button>
                    )}
                  </div>
                  
                  <div className="w-full sm:w-48">
                    <Dropdown>
                      <DropdownTrigger>
                        <Button 
                          variant="outline" 
                          className="w-full justify-between"
                        >
                          {selectedCategory || 'Всі категорії'}
                          <DynamicIcon name="chevron-down" size={16} className="text-gray-400" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu 
                        selectedKeys={selectedCategory ? [selectedCategory] : []}
                        onSelectionChange={(keys) => {
                          const selected = Array.from(keys)[0] as string;
                          setSelectedCategory(selected || '');
                        }}
                        selectionMode="single"
                        items={[
                          { key: "", label: "Всі категорії" },
                          ...categories.map(category => ({ key: category, label: category }))
                        ]}
                      >
                        {(item) => (
                          <DropdownItem key={item.key}>
                            {item.label}
                          </DropdownItem>
                        )}
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                  
                  {/* Кнопка очистки фильтров */}
                  {(searchTerm || selectedCategory) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedCategory('');
                      }}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <DynamicIcon name="x-circle" className="mr-2" size={14} />
                      Очистити
                    </Button>
                  )}
                </div>
              </div>
            }
          >
            <TableHeader columns={columns}>
              {(column) => (
                <TableColumn 
                  key={column.key} 
                  allowsSorting={column.allowsSorting}
                  align="start"
                >
                  {column.label}
                </TableColumn>
              )}
            </TableHeader>
            <TableBody 
              items={displayProducts}
              emptyContent="Товари не знайдено"
              isLoading={loading}
              loadingContent={
                <div className="flex items-center justify-center p-8">
                  <DynamicIcon name="loader-2" className="animate-spin mr-2" size={16} />
                  <span>Завантаження...</span>
                </div>
              }
            >
              {(item: Product) => (
                <TableRow key={item.id}>
                  {(columnKey) => (
                    <TableCell>{renderCell(item, columnKey)}</TableCell>
                  )}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

      {/* Пагинация */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex justify-center">
          <nav className="flex space-x-2">
            <Button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              variant="secondary"
              size="sm"
            >
              Попередня
            </Button>
            
            <span className="px-3 py-2 text-sm text-gray-700">
              Сторінка {currentPage} з {pagination.pages}
            </span>
            
            <Button
              onClick={() => setCurrentPage(Math.min(pagination.pages, currentPage + 1))}
              disabled={currentPage === pagination.pages}
              variant="secondary"
              size="sm"
            >
              Наступна
            </Button>
          </nav>
        </div>
      )}

      {/* Тестовые кнопки */}
      <div className="mt-6 p-4 border rounded-lg bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Тестування Dilovod API</h2>
        </div>
        
        <div className="flex gap-4">
          <Button onClick={testDilovodConnection} variant="outline">
            Тест підключення
          </Button>

          <Button onClick={testBalanceBySku} variant="outline">
            Залишки по SKU
          </Button>

          <Button onClick={clearSkuCache} className='bg-danger text-white hover:bg-danger-400'>
            Очистити кеш SKU з WordPress
          </Button>

          <Button onClick={clearTestResults} className='ml-auto bg-transparent border-1.5 border-danger text-danger hover:bg-danger-50'>
            Очистити логи
          </Button>
        </div>
        
        {/* Результаты тестов */}
        {testResults && (
          <div className="mt-4">
            <h3 className="text-md font-medium mb-2">Результати тестів:</h3>
            <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto max-h-96 font-mono">
              {testResults}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductSets;
