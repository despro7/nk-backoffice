import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatPrice, formatRelativeDate, getCategoryColors } from '../lib/formatUtils';
import { Input, addToast, Textarea, Switch, Tooltip, Select, SelectItem } from '@heroui/react';
import { ToastService } from '@/services/ToastService';
import ProductsStatsSummary, { type ProductsStats } from '@/components/ProductsStatsSummary';

import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  SortDescriptor,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Selection,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@heroui/react';
import { LoggingService } from '@/services/LoggingService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useDebug } from '@/contexts/DebugContext';


interface Product {
  id: string;
  sku: string;
  name: string;
  costPerItem: number;
  currency: string;
  categoryId: number;
  categoryName: string;
  weight?: number; // Вага в грамах
  manualOrder?: number; // Ручне сортування
  barcode?: string; // Штрих‑код
  portionsPerBox?: number; // Порцій у коробці (для порційних товарів, default 24)
  set: any; // Вже розпарсений об'єкт або null
  additionalPrices: any; // Вже розпарсений об'єкт або null
  stockBalanceByStock: any; // Вже розпарсений об'єкт або null
  lastSyncAt: string;
  isOutdated?: boolean; // Чи застарілий товар (немає в WordPress)
  dilovodId?: string; // ID товару в Діловоді
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

type StatsResponse = ProductsStats;

const ProductSets: React.FC = () => {
  const { user } = useAuth();
  const { isDebugMode } = useDebug();
  const { isAdmin, canEditProducts } = useRoleAccess();
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]); // Все товары для поиска названий в комплектах
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [showOutdated, setShowOutdated] = useState(false);

  // Безпечна функція для отримання залишків за складами
  const parseStockBalance = (stockBalanceByStock: any): Record<string, number> => {
    if (!stockBalanceByStock) return {};

    try {
      // Якщо це вже об'єкт, повертаємо як є
      if (typeof stockBalanceByStock === 'object' && stockBalanceByStock !== null) {
        return stockBalanceByStock as Record<string, number>;
      }

      // Якщо це рядок, намагаємось розпарити (для зворотної сумісності)
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

  // Стан для сортування (за замовчуванням: ручне сортування за зростанням)
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor | undefined>({
    column: 'manualOrder',
    direction: 'ascending'
  } as any);

  // Стан для редагування ваги
  const [editingWeight, setEditingWeight] = useState<{ [key: string]: string }>({});
  const [savingWeight, setSavingWeight] = useState<string | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0); // Для примусового оновлення
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Стан для підтвердження видалення ваги
  const [deleteConfirmProductId, setDeleteConfirmProductId] = useState<string | null>(null);

  // Стан для ручної синхронізації
  const [isManualSyncModalOpen, setIsManualSyncModalOpen] = useState(false);
  const [manualSkuList, setManualSkuList] = useState('');
  const [manualSyncing, setManualSyncing] = useState(false);
  const manualSyncAbortController = useRef<AbortController | null>(null);

  // AbortController для основної синхронізації
  const syncAbortController = useRef<AbortController | null>(null);

  // Стан для модалки SKU whitelist
  const [isSkuWhitelistModalOpen, setIsSkuWhitelistModalOpen] = useState(false);
  const [skuWhitelistText, setSkuWhitelistText] = useState('');
  const [skuWhitelistSaving, setSkuWhitelistSaving] = useState(false);

  // Стан для експорту в SalesDrive
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPayload, setExportPayload] = useState<any[]>([]);
  const [exporting, setExporting] = useState(false);
  const [expandSets, setExpandSets] = useState(false);
  const [expandSetsSaving, setExpandSetsSaving] = useState(false);

  // Стан для модалки управління ID груп комплектів (Set Parent IDs)
  const [isSetParentIdsModalOpen, setIsSetParentIdsModalOpen] = useState(false);
  const [setParentIds, setSetParentIds] = useState<string[]>([]);
  const [setParentIdsLoading, setSetParentIdsLoading] = useState(false);
  const [setParentIdsSaving, setSetParentIdsSaving] = useState(false);
  const [newSetParentIdInput, setNewSetParentIdInput] = useState('');

  // Стан для монолітних категорій (комплекти яких не розгортаються)
  const [monolithicCategories, setMonolithicCategories] = useState<Set<string>>(new Set());
  const [monolithicLoading, setMonolithicLoading] = useState(false);
  const [monolithicSaving, setMonolithicSaving] = useState(false);
  const [categoriesMapping, setCategoriesMapping] = useState<{ [name: string]: number }>({});

  // Завантажити whitelist з сервера
  const fetchSkuWhitelist = async () => {
    try {
      const response = await fetch('/api/products/sku-whitelist', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.skus)) {
          data.skus = data.skus.join(', ');
        }
        setSkuWhitelistText(data.skus || '');
      } else {
        console.warn('Не вдалося завантажити SKU whitelist');
      }
    } catch (error) {
      console.warn('Помилка мережі при завантаженні SKU whitelist:', error);
    }
  };

  useEffect(() => {
    if (isSkuWhitelistModalOpen) {
      fetchSkuWhitelist();
    }
  }, [isSkuWhitelistModalOpen]);

  // Завантажити масив ID груп комплектів з сервера
  const fetchSetParentIds = async () => {
    setSetParentIdsLoading(true);
    try {
      const response = await fetch('/api/products/set-parent-ids', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setSetParentIds(Array.isArray(data.ids) ? data.ids : []);
      } else {
        console.warn('Не вдалося завантажити Set Parent IDs');
      }
    } catch (error) {
      console.warn('Помилка мережі при завантаженні Set Parent IDs:', error);
    } finally {
      setSetParentIdsLoading(false);
    }
  };

  // Зберегти масив ID груп комплектів на сервері
  const saveSetParentIds = async () => {
    setSetParentIdsSaving(true);
    try {
      const response = await fetch('/api/products/set-parent-ids', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: setParentIds }),
        credentials: 'include',
      });
      if (response.ok) {
        ToastService.show({ title: 'Збережено', description: 'ID груп комплектів оновлено', color: 'success' });
        setIsSetParentIdsModalOpen(false);
      } else {
        const err = await response.json().catch(() => ({}));
        ToastService.show({ title: 'Помилка', description: err.error || 'Не вдалося зберегти', color: 'danger' });
      }
    } catch (error) {
      ToastService.show({ title: 'Помилка мережі', description: String(error), color: 'danger' });
    } finally {
      setSetParentIdsSaving(false);
    }
  };

  useEffect(() => {
    if (isSetParentIdsModalOpen) {
      fetchSetParentIds();
    }
  }, [isSetParentIdsModalOpen]);

  // Завантажити монолітні категорії
  const fetchMonolithicCategories = async () => {
    setMonolithicLoading(true);
    try {
      const response = await fetch('/api/settings/monolithic_assembly_categories', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        // Дані зберігаються як JSON stringified array в полі value
        try {
          const ids = JSON.parse(data.value);
          
          // Конвертуємо старі назви в ID, якщо потрібно
          const convertedIds = Array.isArray(ids) ? ids.map(item => {
            // Якщо це вже число (ID), повертаємо як є
            if (typeof item === 'number') return item;
            // Якщо це рядок, намагаємося знайти відповідний ID в mapping
            if (typeof item === 'string' && categoriesMapping[item]) {
              return categoriesMapping[item];
            }
            // Якщо не знайшли, повертаємо як є (може бути вже ID як рядок)
            return item;
          }) : [];
          
          setMonolithicCategories(new Set(convertedIds.map(String)));
        } catch (error) {
          setMonolithicCategories(new Set());
        }
      } else {
      }
    } catch (error) {
      console.warn('Не вдалося завантажити монолітні категорії:', error);
    } finally {
      setMonolithicLoading(false);
    }
  };

  // Завантажити mapping назв категорій до ID
  const fetchCategoriesMapping = async () => {
    try {
      const response = await fetch('/api/products/categories-mapping', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setCategoriesMapping(data.mapping || {});
      } else {
      }
    } catch (error) {
      console.warn('Не вдалося завантажити mapping категорій:', error);
    }
  };

  const saveMonolithicCategories = async (keys: Selection) => {
    const selectedIds = Array.from(keys as Set<string>);
    setMonolithicCategories(new Set(selectedIds));

    setMonolithicSaving(true);
    try {
      await fetch('/api/settings/monolithic_assembly_categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(selectedIds) }),
        credentials: 'include',
      });
      ToastService.show({ title: 'Збережено', description: 'Список монолітних категорій оновлено', color: 'success' });
    } catch (error) {
      ToastService.show({ title: 'Помилка збереження', description: String(error), color: 'danger' });
    } finally {
      setMonolithicSaving(false);
    }
  };

  useEffect(() => {
    fetchCategoriesMapping();
  }, []);

  // Завантажуємо monolithic categories після завантаження mapping
  useEffect(() => {
    if (Object.keys(categoriesMapping).length > 0) {
      fetchMonolithicCategories();
    }
  }, [categoriesMapping]);

  // Стан для вибору товарів у таблиці
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set([]));

  // Стан для статистики порцій (тільки в debug-режимі) — кількість в активних замовленнях
  const [portionsBySku, setPortionsBySku] = useState<Map<string, { newQty: number; confirmedQty: number }>>(new Map());
  const [portionsLoading, setPortionsLoading] = useState(false);
  // Ref для читання актуального isDebugMode всередині async-функції без stale closure
  const isDebugModeRef = useRef(isDebugMode);
  useEffect(() => { isDebugModeRef.current = isDebugMode; });

  const fetchPortions = useCallback(async () => {
    if (!isDebugModeRef.current) return;
    setPortionsLoading(true);
    try {
      const [resNew, resConf] = await Promise.all([
        fetch('/api/orders/products/stats?status=1', { credentials: 'include' }),
        fetch('/api/orders/products/stats?status=2', { credentials: 'include' }),
      ]);
      const [datNew, datConf] = await Promise.all([resNew.json(), resConf.json()]);

      const map = new Map<string, { newQty: number; confirmedQty: number }>();
      if (datNew.success && Array.isArray(datNew.data)) {
        for (const item of datNew.data) {
          if (item.sku && item.orderedQuantity > 0) {
            const existing = map.get(item.sku) ?? { newQty: 0, confirmedQty: 0 };
            map.set(item.sku, { ...existing, newQty: item.orderedQuantity });
          }
        }
      }
      if (datConf.success && Array.isArray(datConf.data)) {
        for (const item of datConf.data) {
          if (item.sku && item.orderedQuantity > 0) {
            const existing = map.get(item.sku) ?? { newQty: 0, confirmedQty: 0 };
            map.set(item.sku, { ...existing, confirmedQty: item.orderedQuantity });
          }
        }
      }
      setPortionsBySku(map);
    } catch (err) {
      console.error('Помилка завантаження статистики порцій:', err);
    } finally {
      setPortionsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isDebugMode) fetchPortions();
  }, [isDebugMode, fetchPortions]);

  // Завантажуємо збережене налаштування "Розгорнути комплекти" з сервера
  useEffect(() => {
    fetch('/api/settings/salesdrive-export', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data.success) setExpandSets(data.expandSets); })
      .catch(() => {/* використовуємо default false */});
  }, []);

  // Зберігаємо зміну "Розгорнути комплекти" на сервері
  const handleExpandSetsChange = async (value: boolean) => {
    setExpandSets(value);
    setExpandSetsSaving(true);
    try {
      await fetch('/api/settings/salesdrive-export', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ expandSets: value }),
      });
    } catch {
      // тихо — якщо не вдалося зберегти, UI показує актуальне значення
    } finally {
      setExpandSetsSaving(false);
    }
  };

  // Індекс для быстрого и стабильного поиска товаров по SKU
  const productsBySku = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of allProducts) {
      const key = product.sku?.toString().trim().toLowerCase();
      if (key) map.set(key, product);
    }
    return map;
  }, [allProducts]);

  // Определяем колонки таблицы
  const allColumns = [
    {
      key: 'manualOrder',
      label: '№',
      allowsSorting: true,
    },
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
      key: 'weight',
      label: 'Вага (гр)',
      allowsSorting: true,
    },
    {
      key: 'stock1',
      label: 'Залишки ГП',
      allowsSorting: true,
    },
    {
      key: 'stock2',
      label: 'Залишки М',
      allowsSorting: true,
    },
    {
      key: 'portionsPerBox',
      label: 'Порцій/кор.',
      allowsSorting: true,
    },
    {
      key: 'portions',
      label: 'В замовленнях',
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

  // Фільтруємо колонки: portions — тільки в debug-режимі
  const columns = useMemo(
    () => isDebugMode ? allColumns : allColumns.filter(c => c.key !== 'portions'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDebugMode]
  );

  // Фільтруємо та сортуємо дані для відображення
  const displayProducts = useMemo(() => {
    let filtered = [...products];

    // Фільтр по пошуку
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Фільтр по категорії
    if (selectedCategory) {
      filtered = filtered.filter(product =>
        product.categoryName === selectedCategory
      );
    }

    // Фільтр по застарілим товарам
    if (!showOutdated) {
      filtered = filtered.filter(product => !product.isOutdated);
    }

    // Сортування
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
        } else if (sortDescriptor.column === 'manualOrder') {
          first = (a.manualOrder ?? 0);
          second = (b.manualOrder ?? 0);
        } else if (sortDescriptor.column === 'barcode') {
          first = a.barcode || '';
          second = b.barcode || '';
        } else if (sortDescriptor.column === 'portions') {
          const pA = portionsBySku.get(a.sku);
          const pB = portionsBySku.get(b.sku);
          first = (pA?.newQty ?? 0) + (pA?.confirmedQty ?? 0);
          second = (pB?.newQty ?? 0) + (pB?.confirmedQty ?? 0);
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
  }, [products, searchTerm, selectedCategory, sortDescriptor, showOutdated, portionsBySku]);

  // Функція для рендеринга комірок таблиці
  const renderCell = (product: Product, columnKey: React.Key) => {
    switch (columnKey) {
      case 'manualOrder': {
        const productIdStr = product.id.toString();
        const isEditing = editingWeight[`manual-${productIdStr}`] !== undefined;
        const isSaving = savingWeight === `manual-${productIdStr}`;
        const currentOrder = product as any;
        const currentManualOrder = (currentOrder.manualOrder ?? 0) as number;

        const startEditingManual = () => {
          setEditingWeight(prev => ({ ...prev, [`manual-${productIdStr}`]: String(currentManualOrder) }));
          setForceUpdate(v => v + 1);
        };
        const cancelEditingManual = () => {
          setEditingWeight(prev => {
            const next = { ...prev };
            delete next[`manual-${productIdStr}`];
            return next;
          });
        };
        const finishEditingManual = async () => {
          const value = inputRefs.current[`manual-${productIdStr}` as any]?.value ?? editingWeight[`manual-${productIdStr}`];
          if (value === undefined || value === '') {
            cancelEditingManual();
            return;
          }
          const newOrder = parseInt(String(value));
          if (isNaN(newOrder) || newOrder < 0) {
            ToastService.show({ title: 'Некоректне значення', description: 'Вкажіть ціле число ≥ 0', color: 'warning' });
            cancelEditingManual();
            return;
          }
          try {
            setSavingWeight(`manual-${productIdStr}`);
            const response = await fetch(`/api/products/${productIdStr}/manual-order`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ manualOrder: newOrder }),
              credentials: 'include'
            });
            if (!response.ok) {
              const err = await response.json().catch(() => ({}));
              ToastService.show({ title: 'Помилка', description: `Не вдалося оновити: ${err.error || response.statusText}`, color: 'danger' });
            } else {
              setProducts(prev => prev.map(p => p.id === product.id ? ({ ...p, ...(p as any), manualOrder: newOrder } as any) : p));
              ToastService.show({ title: 'Оновлено', description: `Номер встановлено: ${newOrder}`, color: 'success' });
            }
          } finally {
            setSavingWeight(null);
            cancelEditingManual();
          }
        };

        return (
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <input
                  ref={(el) => { (inputRefs.current as any)[`manual-${productIdStr}`] = el; }}
                  key={`manual-input-${productIdStr}-${forceUpdate}`}
                  type="number"
                  defaultValue={editingWeight[`manual-${productIdStr}`] ?? ''}
                  onChange={(e) => setEditingWeight(prev => ({ ...prev, [`manual-${productIdStr}`]: e.target.value }))}
                  className="w-12 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="0"
                  step="1"
                  disabled={isSaving}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishEditingManual();
                    else if (e.key === 'Escape') cancelEditingManual();
                  }}
                  onWheel={e => e.currentTarget.blur()}
                  autoFocus
                  placeholder="0"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button size="sm" color="success" variant="flat" onPress={() => finishEditingManual()} disabled={isSaving} className="min-w-0 p-1">
                  {isSaving ? <DynamicIcon name="loader-2" className="animate-spin" size={12} /> : <DynamicIcon name="check" size={12} />}
                </Button>
                <Button size="sm" color="danger" variant="flat" onPress={() => cancelEditingManual()} disabled={isSaving} className="min-w-0 p-1">
                  <DynamicIcon name="x" size={12} />
                </Button>
              </>
            ) : (
              <div
                className={`text-sm text-gray-900 ${canEditProducts() ? 'cursor-pointer hover:bg-gray-100' : 'cursor-not-allowed opacity-60'} px-2 py-1 rounded min-w-[36px] text-center`}
                onClick={() => canEditProducts() && startEditingManual()}
                title={canEditProducts() ? "Натисніть для редагування" : "Немає прав для редагування"}
              >
                {currentManualOrder}
              </div>
            )}
          </div>
        );
      }
      case 'name': {
        const productIdStr = product.id.toString();
        const isEditing = editingWeight[`barcode-${productIdStr}`] !== undefined;
        const isSaving = savingWeight === `barcode-${productIdStr}`;
        const currentBarcode = (product as any).barcode ?? '';
        const startEditingBarcode = () => {
          setEditingWeight(prev => ({ ...prev, [`barcode-${productIdStr}`]: String(currentBarcode) }));
          setForceUpdate(v => v + 1);
        };
        const cancelEditingBarcode = () => {
          setEditingWeight(prev => {
            const next = { ...prev };
            delete next[`barcode-${productIdStr}`];
            return next;
          });
        };
        const finishEditingBarcode = async () => {
          const value = inputRefs.current[`barcode-${productIdStr}` as any]?.value ?? editingWeight[`barcode-${productIdStr}`];
          if (value === undefined) {
            cancelEditingBarcode();
            return;
          }
          const newBarcode = String(value).trim();
          try {
            setSavingWeight(`barcode-${productIdStr}`);
            const response = await fetch(`/api/products/${productIdStr}/barcode`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ barcode: newBarcode }),
              credentials: 'include'
            });
            if (!response.ok) {
              const err = await response.json().catch(() => ({}));
              ToastService.show({ title: 'Помилка', description: `Не вдалося оновити: ${err.error || response.statusText}`, color: 'danger' });
            } else {
              setProducts(prev => prev.map(p => p.id === product.id ? ({ ...p, ...(p as any), barcode: newBarcode } as any) : p));
              ToastService.show({ title: 'Оновлено', description: `Штрих‑код встановлено: ${newBarcode}`, color: 'success' });
            }
          } finally {
            setSavingWeight(null);
            cancelEditingBarcode();
          }
        };
      
        return (
          <div className="flex flex-col gap-1">
            {/* Product Name */}
            <div className="flex flex-col text-sm font-bold text-gray-900">
              {product.name}
              {product.isOutdated && (<span className="w-fit text-xs py-0.5 px-1.5 rounded bg-red-500 text-white font-medium">Застарілий</span>)}
            </div>
            {/* Product Meta */}
            <div className="text-sm font-normal text-gray-500">
              <div className="flex gap-3 items-center">
                {/* {product.weight && (
                <span className="flex gap-1 items-center">
                  <DynamicIcon name="weight" size={14} /> {product.weight} гр.
                </span>
                )} */}
                <span className="flex gap-1 items-center">
                  <DynamicIcon name="tag" size={14} /> {formatPrice(product.costPerItem)}
                </span>
                <span className="flex items-center">
                  <DynamicIcon name="hash" size={14} /> {product.sku}
                </span>
              </div>
            </div>
            {/* Product Barcode */}
            <div className="flex items-center gap-1">
              {isEditing ? (
                <>
                  <input
                    ref={el => { (inputRefs.current as any)[`barcode-${productIdStr}`] = el; }}
                    key={`barcode-input-${productIdStr}-${forceUpdate}`}
                    type="text"
                    defaultValue={editingWeight[`barcode-${productIdStr}`] ?? ''}
                    onChange={e => setEditingWeight(prev => ({ ...prev, [`barcode-${productIdStr}`]: e.target.value }))}
                    className="w-36 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                    onKeyDown={e => { if (e.key === 'Enter') finishEditingBarcode(); else if (e.key === 'Escape') cancelEditingBarcode(); }}
                    onWheel={e => e.currentTarget.blur()}
                    autoFocus
                    placeholder="---"
                    onFocus={e => e.currentTarget.select()}
                  />
                  <Button size="sm" color="success" variant="flat" onPress={finishEditingBarcode} disabled={isSaving} className="min-w-0 px-2 py-1">
                    {isSaving ? <DynamicIcon name="loader-2" className="animate-spin" size={12} /> : <DynamicIcon name="check" size={12} />}
                  </Button>
                  <Button size="sm" color="danger" variant="flat" onPress={cancelEditingBarcode} disabled={isSaving} className="min-w-0 px-2 py-1">
                    <DynamicIcon name="x" size={12} />
                  </Button>
                </>
              ) : (
                <div
                  className={`flex items-center gap-1 text-sm text-gray-700 bg-gray-100 ${canEditProducts() ? 'cursor-pointer hover:bg-gray-200' : 'cursor-not-allowed opacity-60'} px-2 py-1 rounded min-w-[80px] text-center`}
                  onClick={() => canEditProducts() && startEditingBarcode()}
                  title={canEditProducts() ? "Натисніть для редагування" : "Немає прав для редагування"}
                >
                  <DynamicIcon name="scan-barcode" size={14} /> {currentBarcode || <span className="text-neutral-500">додати штрих-код</span>}
                </div>
              )}
            </div>
            {isAdmin() && isDebugMode && (
              <>
                {/* Dilovod good ID */}
                <div className="text-sm text-blue-800">
                  <span className="font-medium">good_id:</span> {product.dilovodId || <span className="text-neutral-500">N/A good ID</span>}
                </div>
              </>
            )}
          </div>
        );
      }

      case 'category':
        const categoryColors = getCategoryColors(product.categoryId);
        return (
          <Chip
            color="default"
            variant="flat"
            size="sm"
            className={`${categoryColors.bg} ${categoryColors.text} border-0`}
          >
            {product.categoryName + (isDebugMode ? ` (id${product.categoryId})` : '') || 'Без категорії'}
          </Chip>
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
                  onWheel={e => e.currentTarget.blur()}
                  className="w-12 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                    // Виділяємо весь текст при фокусі для зручності редагування
                    e.target.select();
                  }}
                />
                <Button
                  size="sm"
                  color="success"
                  variant="flat"
                  onPress={() => finishEditingWeight(productIdStr)}
                  disabled={isSaving}
                  className="min-w-8 p-1"
                >
                  {isSaving ? (
                    <DynamicIcon name="loader-2" className="animate-spin" size={12} />
                  ) : (
                    <DynamicIcon name="check" size={12} />
                  )}
                </Button>
                <Button
                  size="sm"
                  color="default"
                  variant="flat"
                  onPress={() => cancelEditingWeight(productIdStr)}
                  disabled={isSaving}
                  className="min-w-8 p-1 text-neutral-600"
                >
                  <DynamicIcon name="x" size={12} />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <div
                  className={`text-sm text-center text-gray-900 ${canEditProducts() ? 'cursor-pointer hover:bg-gray-100' : 'cursor-not-allowed opacity-60'} px-1.5 py-1 rounded min-w-[50px] whitespace-nowrap tabular-nums underline underline-offset-3 decoration-dotted`}
                  onClick={() => canEditProducts() && startEditingWeight(productIdStr, currentWeight)}
                  title={canEditProducts() ? "Натисніть для редагування" : "Немає прав для редагування"}
                >
                  {currentWeight || '—'} г
                </div>
                {canEditProducts() && currentWeight === 0 && (
                  <Button
                    size="sm"
                    color="default"
                    variant="flat"
                    onPress={(e) => {
                      (e as any).stopPropagation();
                      // Автоматично встановлюємо вагу за замовчуванням на основі категорії
                      const defaultWeight = product.categoryId === 1 ? 410 : 330; // 1 - перші страви, решта - другі
                      updateProductWeight(productIdStr, defaultWeight);
                    }}
                    className="min-w-8 p-1 text-neutral-600"
                    title={`Встановити вагу за замовчуванням: ${product.categoryId === 1 ? '410' : '330'}г`}
                  >
                    <DynamicIcon name="plus" size={12} />
                  </Button>
                )}
                {canEditProducts() && currentWeight > 0 && (
                  <Button
                    size="sm"
                    color="danger"
                    variant="flat"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmProductId(productIdStr);
                    }}
                    className="min-w-8 p-1"
                    title="Видалити вагу"
                  >
                    <DynamicIcon name="trash-2" size={12} />
                  </Button>
                )}
              </div>
            )}
          </div>
        );

      case 'stock1': {
        const stock1Data = parseStockBalance(product.stockBalanceByStock);
        const stock1Value = stock1Data["1"] || 0;

        if (isDebugMode) {
          const p = portionsBySku.get(product.sku);
          const inOrders = (p?.newQty ?? 0) + (p?.confirmedQty ?? 0);
          const available = stock1Value - inOrders;
          return (
            <div className="flex flex-col gap-0.5 leading-tight">
              <span className={`text-sm font-medium ${available > 0 ? 'text-gray-900' : available === 0 ? 'text-gray-400' : 'text-red-600 font-bold'}`}>
                {available}
              </span>
              {inOrders > 0 && (
                <span className="text-[11px] text-gray-400">
                  з {stock1Value}
                </span>
              )}
            </div>
          );
        }

        return (
          <span className={`text-sm ${stock1Value > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
            {stock1Value}
          </span>
        );
      }

      case 'portions': {
        if (!isDebugMode) return null;
        if (portionsLoading) return <span className="text-gray-300 text-xs">…</span>;
        const p = portionsBySku.get(product.sku);
        const qNew = p?.newQty ?? 0;
        const qConf = p?.confirmedQty ?? 0;
        const total = qNew + qConf;
        if (total === 0) return <span className="text-gray-300 text-sm">—</span>;
        return (
          <div className="flex gap-1 text-sm leading-tight">
            <span className="font-bold text-neutral-800">{total}</span>
            <div className="flex gap-0.5">
              ({qNew > 0 && (
                <span className="text-yellow-700 font-medium" title="Нові">
                  {qNew}
                </span>
              )}
              /
              {qConf > 0 && (
                <span className="text-green-700 font-medium" title="Підтверджені">
                  {qConf}
                </span>
              )})
            </div>
          </div>
        );
      }

      case 'stock2':
        const stock2Data = parseStockBalance(product.stockBalanceByStock);
        const stock2Value = stock2Data["2"] || 0;
        return (
          <span className={`text-sm ${stock2Value > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
            {stock2Value}
          </span>
        );

      case 'portionsPerBox': {
        const productIdStr2 = product.id.toString();
        const ppbKey = `ppb-${productIdStr2}`;
        const isEditingPpb = editingWeight[ppbKey] !== undefined;
        const isSavingPpb = savingWeight === ppbKey;
        const currentPpb = (product as any).portionsPerBox ?? 24;

        // Комплектні товари — portionsPerBox не редагуємо
        const isSetProduct = product.set && Array.isArray(product.set) && (product.set as unknown[]).length > 0;
        if (isSetProduct) {
          return <span className="text-sm text-gray-400" title="Комплектний товар">—</span>;
        }

        const startEditingPpb = () => {
          setEditingWeight(prev => ({ ...prev, [ppbKey]: String(currentPpb) }));
          setForceUpdate(v => v + 1);
        };
        const cancelEditingPpb = () => {
          setEditingWeight(prev => {
            const next = { ...prev };
            delete next[ppbKey];
            return next;
          });
        };
        const finishEditingPpb = async () => {
          const value = (inputRefs.current as any)[ppbKey]?.value ?? editingWeight[ppbKey];
          if (value === undefined || value === '') { cancelEditingPpb(); return; }
          const newPpb = parseInt(String(value));
          if (isNaN(newPpb) || newPpb < 1) {
            ToastService.show({ title: 'Некоректне значення', description: 'Має бути ціле число ≥ 1', color: 'warning' });
            cancelEditingPpb();
            return;
          }
          try {
            setSavingWeight(ppbKey);
            const response = await fetch(`/api/products/${productIdStr2}/portions-per-box`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ portionsPerBox: newPpb }),
              credentials: 'include',
            });
            if (!response.ok) {
              const err = await response.json().catch(() => ({}));
              ToastService.show({ title: 'Помилка', description: `Не вдалося оновити: ${err.error || response.statusText}`, color: 'danger' });
            } else {
              setProducts(prev => prev.map(p => p.id === product.id ? ({ ...p, portionsPerBox: newPpb } as any) : p));
              ToastService.show({ title: 'Оновлено', description: `Порцій у коробці: ${newPpb}`, color: 'success' });
            }
          } finally {
            setSavingWeight(null);
            cancelEditingPpb();
          }
        };

        return (
          <div className="flex items-center gap-1">
            {isEditingPpb ? (
              <>
                <input
                  ref={el => { (inputRefs.current as any)[ppbKey] = el; }}
                  key={`ppb-input-${productIdStr2}-${forceUpdate}`}
                  type="number"
                  defaultValue={editingWeight[ppbKey] ?? ''}
                  onChange={e => setEditingWeight(prev => ({ ...prev, [ppbKey]: e.target.value }))}
                  className="w-12 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="1" step="1"
                  disabled={isSavingPpb}
                  onKeyDown={e => { if (e.key === 'Enter') finishEditingPpb(); else if (e.key === 'Escape') cancelEditingPpb(); }}
                  onWheel={e => e.currentTarget.blur()}
                  autoFocus
                  onFocus={e => e.currentTarget.select()}
                />
                <Button size="sm" color="success" variant="flat" onPress={finishEditingPpb} disabled={isSavingPpb} className="min-w-0 p-1">
                  {isSavingPpb ? <DynamicIcon name="loader-2" className="animate-spin" size={12} /> : <DynamicIcon name="check" size={12} />}
                </Button>
                <Button size="sm" color="default" variant="flat" onPress={cancelEditingPpb} disabled={isSavingPpb} className="min-w-0 p-1 text-neutral-600">
                  <DynamicIcon name="x" size={12} />
                </Button>
              </>
            ) : (
              <div
                className={`text-sm text-center text-gray-900 ${canEditProducts() ? 'cursor-pointer hover:bg-gray-100' : 'cursor-not-allowed opacity-60'} px-1.5 py-1 rounded min-w-[36px] tabular-nums underline underline-offset-3 decoration-dotted`}
                onClick={() => canEditProducts() && startEditingPpb()}
                title={canEditProducts() ? 'Натисніть для редагування' : 'Немає прав для редагування'}
              >
                {currentPpb}
              </div>
            )}
          </div>
        );
      }

      case 'set':
        if (product.set) {
          try {
            // Данные уже приходят в виде объекта с сервера
            const setData = product.set;
            if (setData && Array.isArray(setData) && setData.length > 0) {
              return (
                <div className="text-sm text-gray-900">
                  <div className="font-medium">Комплект ({setData.length}&nbsp;{setData.length === 1 ? 'позиція' : setData.length > 1 && setData.length < 5 ? 'позиції' : 'позицій'})</div>
                    <Popover showArrow placement="left">
                      <PopoverTrigger>
                        <span className="flex items-center gap-1 text-sm text-gray-500 cursor-pointer hover:text-gray-700 select-none w-fit">
                          <DynamicIcon name="list-check" size={12} />
                          <span className="underline decoration-dotted underline-offset-3">Показати склад</span>
                        </span>
                      </PopoverTrigger>
                      <PopoverContent className="p-3 bg-neutral-100">
                        {(() => {
                          const COL_SIZE = 15;
                          // Розбиваємо на стовпці по COL_SIZE елементів
                          const cols: typeof setData[] = [];
                          for (let i = 0; i < setData.length; i += COL_SIZE) {
                            cols.push(setData.slice(i, i + COL_SIZE));
                          }
                          return (
                            <div className="flex gap-6 text-[12px]">
                              {cols.map((col, colIdx) => (
                                <ol
                                  key={colIdx}
                                  className="space-y-0.5 list-decimal list-inside"
                                  start={colIdx * COL_SIZE + 1}
                                >
                                  {col.map((item, i) => {
                                    const targetSku = String(item.id).trim().toLowerCase();
                                    const componentProduct = productsBySku.get(targetSku) || allProducts.find(p => p.id?.toString() === String(item.id));
                                    const componentName = componentProduct?.name || item.id;
                                    return (
                                      <li key={colIdx * COL_SIZE + i} title={`SKU: ${item.id}`} className="whitespace-nowrap">
                                        {componentName} ({item.id})×{item.quantity}
                                      </li>
                                    );
                                  })}
                                </ol>
                              ))}
                            </div>
                          );
                        })()}
                      </PopoverContent>
                    </Popover>
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
          <span className="block text-sm text-gray-500 max-w-[80px]">
            <Tooltip color="secondary" content={formatRelativeDate(product.lastSyncAt, { maxRelativeHours: 0 })}>{formatRelativeDate(product.lastSyncAt)}</Tooltip>
          </span>
        );

      default:
        return '';
    }
  };

  const fetchProducts = async (pageParam?: number, searchParam?: string, categoryParam?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: (pageParam ?? currentPage).toString(),
        limit: '100', // Збільшуємо ліміт для завантаження всіх товарів
        sortBy: (sortDescriptor?.column as string) || 'manualOrder',
        sortOrder: sortDescriptor?.direction === 'ascending' ? 'asc' : 'desc'
      });

      const searchToUse = typeof searchParam === 'string' ? searchParam : searchTerm;
      const categoryToUse = typeof categoryParam === 'string' ? categoryParam : selectedCategory;

      if (searchToUse) {
        params.append('search', searchToUse);
      }

      if (categoryToUse) {
        params.append('category', categoryToUse);
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

  // Синхронізація товарів з Dilovod
  const syncProductsWithDilovod = async () => {
    // Якщо синхронізація вже йде, скасовуємо її
    if (syncStatus?.isRunning && syncAbortController.current) {
      console.log('Скасовуємо синхронізацію товарів...');

      // Скасовуємо на клієнті
      syncAbortController.current.abort();

      // Також надсилаємо запит на сервер для скасування
      try {
        await fetch('/api/products/sync/cancel', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (error) {
        console.warn('Не вдалося надіслати запит на скасування на сервер:', error);
      }

      setSyncStatus({
        isRunning: false,
        message: 'Синхронізацію скасовано користувачем',
        syncedProducts: 0,
        syncedSets: 0,
        errors: []
      });
      addToast({
        title: 'Синхронізацію скасовано',
        description: 'Синхронізацію товарів було перервано',
        color: 'warning'
      });
      return;
    }

    if (!isAdmin()) {
      setSyncStatus({
        isRunning: false,
        message: 'У вас немає прав для виконання синхронізації',
        syncedProducts: 0,
        syncedSets: 0,
        errors: ['Access denied']
      });
      return;
    }

    // Створюємо новий AbortController для цієї синхронізації
    syncAbortController.current = new AbortController();

    setSyncStatus({
      isRunning: true,
      message: 'Починаємо синхронізацію...',
      syncedProducts: 0,
      syncedSets: 0,
      errors: []
    });

    try {
      const response = await fetch('/api/products/sync', {
        method: 'POST',
        credentials: 'include',
        signal: syncAbortController.current.signal
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

        // Показуємо toast з результатом синхронізації
        addToast({
          title: 'Синхронізацію завершено',
          description: result.message,
          color: result.errors?.length > 0 ? 'warning' : 'success'
        });

        // Оновлюємо список товарів після синхронізації
        fetchProducts();
        fetchAllProducts(); // Оновлюємо всі товари для комплектів
      } else {
        const error = await response.json();
        setSyncStatus({
          isRunning: false,
          message: `Помилка: ${error.error || 'Невідома помилка'}`,
          syncedProducts: 0,
          syncedSets: 0,
          errors: [error.error || 'Невідома помилка']
        });

        addToast({
          title: 'Помилка синхронізації',
          description: error.error || 'Невідома помилка',
          color: 'danger'
        });
      }
    } catch (error: any) {
      // Перевіряємо, чи це скасування запиту
      if (error.name === 'AbortError') {
        console.log('Синхронізація товарів була скасована');
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Невідома помилка';
      setSyncStatus({
        isRunning: false,
        message: `Помилка мережі: ${errorMessage}`,
        syncedProducts: 0,
        syncedSets: 0,
        errors: [errorMessage]
      });

      addToast({
        title: 'Помилка мережі',
        description: errorMessage,
        color: 'danger'
      });
    } finally {
      syncAbortController.current = null;
    }
  };

  // Синхронізувати залишки товарів з Dilovod
  const syncStockBalances = async () => {
    try {
      setStockSyncing(true);
      setStockSyncStatus({
        isRunning: true,
        message: 'Синхронізація залишків...',
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
            message: `Залишки успішно синхронізовані! Оновлено ${result.updatedProducts} товарів`,
            updatedProducts: result.updatedProducts,
            errors: result.errors || []
          });

          // Оновлюємо список товарів після синхронізації залишків
          await fetchProducts();
        } else {
          setStockSyncStatus({
            isRunning: false,
            message: `Помилка синхронізації залишків: ${result.message}`,
            updatedProducts: 0,
            errors: result.errors || []
          });
        }
      } else {
        const errorData = await response.json();
        setStockSyncStatus({
          isRunning: false,
          message: `Помилка API: ${errorData.error || 'Невідома помилка'}`,
          updatedProducts: 0,
          errors: [errorData.error || 'Невідома помилка']
        });
      }
    } catch (error) {
      console.error('Помилка синхронізації залишків:', error);
      setStockSyncStatus({
        isRunning: false,
        message: `Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
        updatedProducts: 0,
        errors: [error instanceof Error ? error.message : 'Невідома помилка']
      });
    } finally {
      setStockSyncing(false);
    }
  };

  // Тестування отримання комплектів
  const testSetsOnly = async () => {
    if (!isAdmin()) {
      alert('У вас немає прав для виконання тестування');
      return;
    }

    try {
      console.log('Починаємо тестування комплектів...');
      const response = await fetch('/api/products/test-sets-only', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Результат тестування:', result);

        if (result.success) {
          alert(`Тест завершено успішно!\n\n${result.message}\n\nПеревірте консоль сервера для детальної інформації.`);
        } else {
          alert(`Тест завершено з помилкою:\n\n${result.message}`);
        }
      } else {
        const error = await response.json();
        alert(`Помилка тестування: ${error.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      alert(`Помилка мережі: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    }
  };

  // Тест отримання одного товару за SKU безпосередньо з Dilovod
  const testSingleDilovodProduct = async () => {
    if (!isAdmin()) {
      ToastService.show({
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
        ToastService.show({
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
      ToastService.show({
        title: "Товар отримано",
        description: `SKU: ${product.sku}, Категорія: ${product.category?.name || '—'} (id: ${product.category?.id ?? '—'})`,
        color: "success",
        hideIcon: false
      });
    } catch (error) {
      ToastService.show({
        title: "Помилка мережі",
        description: `Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
        color: "danger"
      });
    }
  };

  // Очищення статусу синхронізації
  const clearSyncStatus = () => {
    setSyncStatus(null);
  };

  // Відкриття модалки ручної синхронізації
  const openManualSyncModal = () => {
    // Збираємо SKU з обраних товарів
    let skuListText = '';
    if (selectedKeys !== 'all' && selectedKeys.size > 0) {
      const selectedSkus = displayProducts
        .filter(p => selectedKeys.has(p.id.toString()) || selectedKeys.has(p.id))
        .map(p => p.sku);
      skuListText = selectedSkus.join(', ');
    }
    setManualSkuList(skuListText);
    setIsManualSyncModalOpen(true);
  };

  // Ручна синхронізація за списком SKU
  const [manualSyncEnabled, setManualSyncEnabled] = useState(false);
  const syncProductsManual = async () => {
    // Якщо синхронізація вже йде, скасовуємо її
    if (manualSyncing && manualSyncAbortController.current) {
      console.log('Скасовуємо ручну синхронізацію товарів...');
      manualSyncAbortController.current.abort();
      setManualSyncing(false);
      setSyncStatus({
        isRunning: false,
        message: 'Синхронізацію скасовано користувачем',
        syncedProducts: 0,
        syncedSets: 0,
        errors: []
      });
      addToast({
        title: 'Синхронізацію скасовано',
        description: 'Ручну синхронізацію товарів було перервано',
        color: 'warning'
      });
      return;
    }

    if (!isAdmin()) {
      addToast({
        title: 'Помилка',
        description: 'У вас немає прав для виконання синхронізації',
        color: 'danger'
      });
      return;
    }

    // Парсимо список SKU (розділювачі: кома, пробіл, новий рядок)
    const skus = manualSkuList
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (skus.length === 0) {
      addToast({
        title: 'Помилка',
        description: 'Введіть хоча б один SKU для синхронізації',
        color: 'warning'
      });
      return;
    }

    // Створюємо новий AbortController для цієї синхронізації
    manualSyncAbortController.current = new AbortController();

    setManualSyncing(true);
    setSyncStatus({
      isRunning: true,
      message: `Синхронізуємо ${skus.length} товарів...`,
      syncedProducts: 0,
      syncedSets: 0,
      errors: []
    });

    try {
      const response = await fetch('/api/products/sync-manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ skus }),
        credentials: 'include',
        signal: manualSyncAbortController.current.signal
      });

      if (response.ok) {
        const result = await response.json();
        setSyncStatus({
          isRunning: false,
          message: result.message,
          syncedProducts: result.syncedProducts,
          syncedSets: result.syncedSets,
          errors: result.errors || [],
          ...(result.createdProducts !== undefined && { createdProducts: result.createdProducts }),
          ...(result.updatedProducts !== undefined && { updatedProducts: result.updatedProducts }),
          ...(result.skippedProducts !== undefined && { skippedProducts: result.skippedProducts }),
        } as any);

        addToast({
          title: 'Синхронізацію завершено',
          description: result.message,
          color: result.errors?.length > 0 ? 'warning' : 'success'
        });

        // Оновлюємо список товарів після синхронізації
        fetchProducts();
        fetchAllProducts();
        setIsManualSyncModalOpen(false);
      } else {
        const error = await response.json();
        setSyncStatus({
          isRunning: false,
          message: `Помилка: ${error.error || 'Невідома помилка'}`,
          syncedProducts: 0,
          syncedSets: 0,
          errors: [error.error || 'Невідома помилка']
        });

        addToast({
          title: 'Помилка синхронізації',
          description: error.error || 'Невідома помилка',
          color: 'danger'
        });
      }
    } catch (error: any) {
      // Перевіряємо, чи це скасування запиту
      if (error.name === 'AbortError') {
        console.log('Ручна синхронізація товарів була скасована');
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Невідома помилка';
      setSyncStatus({
        isRunning: false,
        message: `Помилка мережі: ${errorMessage}`,
        syncedProducts: 0,
        syncedSets: 0,
        errors: [errorMessage]
      });

      addToast({
        title: 'Помилка мережі',
        description: errorMessage,
        color: 'danger'
      });
    } finally {
      setManualSyncing(false);
      manualSyncAbortController.current = null;
    }
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

  // Функції для експорту в SalesDrive
  const prepareExportToSalesDrive = async () => {
    try {
      const url = `/api/products/export-to-salesdrive${expandSets ? '?expandSets=true' : ''}`;
      const response = await fetch(url, {
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();

        setExportPayload(result.payload);
        setIsExportModalOpen(true);
        
        // Показуємо повідомлення про режим експорту
        const modeMsg = result.expandedSets 
          ? 'Комплекти розгорнуто на кінцеві товари' 
          : 'Комплекти експортуються "як є"';
        const adjustMsg = result.adjustedStock && result.adjustedCount > 0
          ? `. Залишки скориговано для ${result.adjustedCount} SKU`
          : '';
        addToast({ 
          title: 'Payload готовий', 
          description: `${result.count} товарів. ${modeMsg}${adjustMsg}`, 
          color: 'success' 
        });
      } else {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        addToast({ title: 'Помилка', description: error.error || 'Не вдалося отримати дані для експорту', color: 'danger' });
      }
    } catch (error) {
      console.error('Error preparing export:', error);
      addToast({ title: 'Помилка мережі', description: error instanceof Error ? error.message : 'Невідома помилка', color: 'danger' });
    }
  };

  const executeExportToSalesDrive = async () => {
    try {
      setExporting(true);

      const response = await fetch('/api/products/export-to-salesdrive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: exportPayload }),
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        ToastService.show({ title: 'Успіх', description: result.message, color: 'success', hideIcon: false });
        setIsExportModalOpen(false);
        setExportPayload([]);
      } else {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        ToastService.show({ 
          title: 'Помилка експорту',
          description: error.error || 'Не вдалося експортувати товари',
          color: 'danger',
          hideIcon: false,
          icon: "alert-triangle",
          iconSize: 16,
        });
      }
    } catch (error) {
      console.error('Error exporting to SalesDrive:', error);
      ToastService.show({
        title: 'Помилка мережі',
        description: error instanceof Error ? error.message : 'Невідома помилка',
        color: 'danger',
        hideIcon: false,
        icon: "alert-triangle",
        iconSize: 16,
      });
    } finally {
      setExporting(false);
    }
  };

  // Функція для оновлення ваги товару
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

        // Оновлюємо локальний стан
        setProducts(prevProducts =>
          prevProducts.map(product =>
            product.id.toString() === productId ? { ...product, weight: newWeight } : product
          )
        );

        // Очищаємо стан редагування
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

  // Функція для початку редагування ваги
  const startEditingWeight = (productId: string, currentWeight: number) => {
    setEditingWeight(prev => {
      const newState = {
        ...prev,
        [productId]: currentWeight.toString()
      };
      return newState;
    });
  };

  // Функція для завершення редагування ваги
  const finishEditingWeight = (productId: string) => {
    // Завжди отримуємо значення з ref (DOM елемента), оскільки воно актуальне
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

  // Функція для скасування редагування ваги
  const cancelEditingWeight = (productId: string) => {
    setEditingWeight(prev => {
      const newState = { ...prev };
      delete newState[productId];
      return newState;
    });
  };

  // Автоматичне оновлення при зміні фільтрів
  useEffect(() => {
    fetchProducts();
    fetchStats();
    fetchAllProducts();
  }, []); // Завантажуємо тільки при монтуванні

  // Оновлення даних при зміні категорії
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory]);

  // Затримка для пошуку, щоб не робити запит при кожному символі
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // При зміні сторінки потрібно перезапитувати товари
  useEffect(() => {
    fetchProducts(currentPage, searchTerm, selectedCategory);
  }, [currentPage]);


  return (
    <div className="max-w-full">
      <div className="mb-6">
        <p className="text-gray-600">Управління товарами та комплектами з системи Dilovod</p>
      </div>

      {/* Статистика */}
      <ProductsStatsSummary stats={stats} className="mb-8" />

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
              onPress={clearSyncStatus}
              variant="flat"
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
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  {(syncStatus as any).createdProducts > 0 && (
                    <div className="flex items-center gap-2">
                      <DynamicIcon name="plus-circle" size={16} className="text-green-600" />
                      <span className="font-medium text-gray-700">Створено:</span>
                      <span className="text-green-600 font-semibold">{(syncStatus as any).createdProducts}</span>
                    </div>
                  )}
                  {(syncStatus as any).updatedProducts > 0 && (
                    <div className="flex items-center gap-2">
                      <DynamicIcon name="refresh-cw" size={16} className="text-blue-600" />
                      <span className="font-medium text-gray-700">Оновлено:</span>
                      <span className="text-blue-600 font-semibold">{(syncStatus as any).updatedProducts}</span>
                    </div>
                  )}
                  {(syncStatus as any).skippedProducts > 0 && (
                    <div className="flex items-center gap-2">
                      <DynamicIcon name="skip-forward" size={16} className="text-gray-500" />
                      <span className="font-medium text-gray-700">Пропущено:</span>
                      <span className="text-gray-600 font-semibold">{(syncStatus as any).skippedProducts}</span>
                    </div>
                  )}
                  {syncStatus.syncedSets > 0 && (
                    <div className="flex items-center gap-2">
                      <DynamicIcon name="package" size={16} className="text-purple-600" />
                      <span className="font-medium text-gray-700">Комплектів:</span>
                      <span className="text-purple-600 font-semibold">{syncStatus.syncedSets}</span>
                    </div>
                  )}
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
        <div className={`bg-white p-4 rounded-lg shadow mb-6 ${stockSyncStatus.isRunning
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
              <p className={`font-medium ${stockSyncStatus.isRunning
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

      {/* Таблиця товарів */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table
          key={`products-table-${Object.keys(editingWeight).length}-${allProducts.length}-${isDebugMode}`}
          aria-label="Таблиця товарів та комплектів"
          sortDescriptor={sortDescriptor}
          onSortChange={setSortDescriptor}
          selectionMode={isAdmin() && manualSyncEnabled ? "multiple" : undefined}
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
          classNames={{
            wrapper: "min-h-[400px]",
          }}
          topContent={
            <div className="flex flex-col gap-4 p-2">
              {/* Кнопки дій */}
              <div className={`flex flex-wrap gap-4 pb-6 ${!isAdmin() ? 'hidden' : ''}`} >
                {/* Ліва частина - основні кнопки */}
                <div className="flex flex-1 items-center gap-3">
                  <Switch isSelected={manualSyncEnabled} onValueChange={setManualSyncEnabled}></Switch>
                  <Button
                    onPress={openManualSyncModal}
                    disabled={manualSyncing || !isAdmin()}
                    color="primary"
                    variant="flat"
                    className="bg-blue-400 text-white"
                  >
                    <DynamicIcon name="list-filter" size={14} />
                    Ручна синхронізація
                    {selectedKeys !== 'all' && (selectedKeys as Set<string>).size > 0 && (
                        " (" + (selectedKeys as Set<string>).size + ")"
                    )}
                  </Button>

                  <Button
                    onPress={syncProductsWithDilovod}
                    disabled={!isAdmin()}
                    color={syncStatus?.isRunning ? 'danger' : 'primary'}
                  >
                    {syncStatus?.isRunning ? (
                      <>
                        <DynamicIcon name="x" size={14} />
                        Скасувати синхронізацію
                      </>
                    ) : (
                      <>
                        <DynamicIcon name="refresh-cw" size={14} />
                        Синхронізувати всі товари
                      </>
                    )}
                  </Button>

                  <Button
                    onPress={syncStockBalances}
                    disabled={stockSyncing || !isAdmin()}
                    color="success"
                    className="text-white"
                  >
                    {stockSyncing ? (
                      <>
                        <DynamicIcon name="loader-2" className="animate-spin" size={14} />
                        Синхронізація...
                      </>
                    ) : (
                      <>
                        <DynamicIcon name="refresh-cw" size={14} />
                        Оновити залишки
                      </>
                    )}
                  </Button>

                  <Button
                    onPress={prepareExportToSalesDrive}
                    disabled={!isAdmin()}
                    color="secondary"
                    className="text-white"
                  >
                    <DynamicIcon name="upload" size={14} />
                    Експорт в SalesDrive
                  </Button>

                  {/* Перемикач режиму експорту */}
                  <div className="flex items-center gap-2">
                    <Switch isSelected={expandSets} onValueChange={handleExpandSetsChange} isDisabled={expandSetsSaving}></Switch>
                    <span className="text-sm text-gray-700 leading-4">Розгорнути <br/>комплекти</span>
                    <Tooltip color="primary" content="Якщо увімкнено, товари, які є комплектами, будуть розгорнуті на свої складові при експорті в SalesDrive">
                      <DynamicIcon 
                        name="help-circle" 
                        size={16} 
                        className="text-gray-400 cursor-help"
                      />
                    </Tooltip>
                  </div>
                </div>

                {/* Права частина - налаштування */}
                <div className="flex flex-1 items-center justify-end gap-3">
                  {/* Вибір монолітних категорій */}
                  <Select
                    label="Монолітні комплекти"
                    placeholder="Оберіть категорії..."
                    selectionMode="multiple"
                    size="sm"
                    className="max-w-[200px] flex-shrink-0"
                    selectedKeys={monolithicCategories}
                    onSelectionChange={saveMonolithicCategories}
                    isDisabled={monolithicLoading}
                    startContent={monolithicSaving ? <DynamicIcon name="loader-2" className="animate-spin" size={14} /> : <DynamicIcon name="layout-list" size={14} />}
                    // description="Комплекти цих категорій не розгортатимуться в чеклисті"
                  >
                    {(stats?.categoriesCount || [])
                      .filter((cat) => {
                        const lowerName = cat.name.toLowerCase();
                        return lowerName.includes('набори') || 
                               lowerName.includes('набір') || 
                               lowerName.includes('комплект') ||
                               lowerName.includes('набор');
                      })
                      .filter((cat, index, arr) => {
                        const categoryId = categoriesMapping[cat.name] || cat.name;
                        // Залишаємо тільки перше входження кожного categoryId
                        return arr.findIndex(c => (categoriesMapping[c.name] || c.name) === categoryId) === index;
                      })
                      .map((cat) => {
                        const categoryId = categoriesMapping[cat.name] || cat.name;
                        return (
                          <SelectItem key={categoryId.toString()} textValue={cat.name}>
                            {cat.name}
                          </SelectItem>
                        );
                      })}
                  </Select>

                  {/* Кнопка управління ID груп комплектів */}
                  <Button
                    onPress={() => setIsSetParentIdsModalOpen(true)}
                    disabled={!isAdmin()}
                    color="warning"
                    variant="flat"
                    className="flex-shrink-0"
                  >
                    <DynamicIcon name="layers" size={14} />
                    Set Parent IDs
                  </Button>

                  {/* Whitelist номерів SKU, які не підлягають застаріванню */}
                  <Button
                    onPress={() => setIsSkuWhitelistModalOpen(true)}
                    variant="flat"
                    className="flex-shrink-0"
                  >
                    <DynamicIcon name="shield-check" size={14} />
                    SKU Whitelist
                  </Button>
                </div>
              </div>

              {/* Пошук і фільтри */}
              <div className="flex flex-wrap gap-4 w-full">
                <div className="flex flex-wrap gap-2 items-center">
                  {/* Switch "Відображати застарілі товари" */}
                  <div className="flex items-center gap-2 mr-4">
                    <Switch
                      isSelected={showOutdated}
                      onValueChange={setShowOutdated}
                    />
                    <span className="text-sm text-gray-700 leading-4">Показати<br/>застарілі</span>
                  </div>

                  {/* Фільтр по категорії */}
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        variant="flat"
                        className="justify-between"
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
                          {item.label} ({item.key === "" ? allProducts.length : allProducts.filter(p => p.categoryName === item.key).length})
                        </DropdownItem>
                      )}
                    </DropdownMenu>
                  </Dropdown>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <Input
                    placeholder="Пошук по назві або SKU..."
                    value={searchTerm}
                    isClearable
                    onClear={() => setSearchTerm('')}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    startContent={<DynamicIcon name="search" size={16} className="" />}
                  />
                  
                  <div className="flex items-center text-small text-default-400 whitespace-nowrap">
                    {(searchTerm || selectedCategory) && (
                      <span>Знайдено: {displayProducts.length}</span>
                    )}
                    {loading && (
                      <span className="flex items-center gap-1">
                        <DynamicIcon name="loader-2" className="animate-spin" size={14} />
                        Пошук...
                      </span>
                    )}
                  </div>
                </div>

                {/* Кнопка очищення фільтрів */}
                  {(searchTerm || selectedCategory) && (
                    <Button
                      variant="light"
                      color="danger"
                      // size="sm"
                      onPress={() => {
                        setSearchTerm('');
                        setSelectedCategory('');
                        setCurrentPage(1);
                        fetchProducts(1, '', '');
                      }}
                      className="text-red-700 flex items-center ml-auto"
                    >
                      <DynamicIcon name="x-circle" size={14} />
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
            emptyContent={showOutdated ? "Товари не знайдено" : (
              <div className="flex flex-col items-center gap-3 py-4">
                <span>Товари не знайдено, спробуйте увімкнути фільтр</span>
                <div className="flex items-center gap-2">
                  <Switch isSelected={showOutdated} onValueChange={setShowOutdated} className="text-gray-700">Показати застарілі товари</Switch>
                </div>
              </div>
            )}
            isLoading={loading}
            loadingContent={
              <div className="flex items-center justify-center p-8">
                <DynamicIcon name="loader-2" className="animate-spin mr-2" size={16} />
                <span>Завантаження...</span>
              </div>
            }
          >
            {(item: Product) => (
              <TableRow
                key={item.id}
                className={item.isOutdated ? 'grayscale-50 opacity-50 bg-red-50' : ''}
              >
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
              onPress={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              variant="flat"
              size="sm"
            >
              Попередня
            </Button>

            <span className="px-3 py-2 text-sm text-gray-700">
              Сторінка {currentPage} з {pagination.pages}
            </span>

            <Button
              onPress={() => setCurrentPage(Math.min(pagination.pages, currentPage + 1))}
              disabled={currentPage === pagination.pages}
              variant="flat"
              size="sm"
            >
              Наступна
            </Button>
          </nav>
        </div>
      )}

      {/* Тестовые кнопки */}
      {isAdmin() && (
        <div className="mt-6 p-4 border rounded-lg bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Тестування Dilovod API</h2>
          </div>

          <div className="flex gap-4">
            <Button onPress={testDilovodConnection} variant="flat">
              Тест підключення
            </Button>

            <Button onPress={testBalanceBySku} variant="flat">
              Залишки по SKU
            </Button>

            {/* <Button
              onPress={testSetsOnly}
              disabled={!isAdmin()}
              variant="flat"
            >
              <DynamicIcon name="package-x" size={14} />
              Тест комплектацій
            </Button> */}
            <Button
              onPress={testSingleDilovodProduct}
              disabled={!isAdmin()}
              variant="flat"
            >
              <DynamicIcon name="search" size={14} />
              Тест SKU (Dilovod)
            </Button>

            <Button onPress={clearTestResults} className='ml-auto bg-transparent border-1.5 border-danger text-danger hover:bg-danger-50'>
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
      )}


      {/* Модал підтвердження видалення ваги */}
      <ConfirmModal
        isOpen={!!deleteConfirmProductId}
        title="Підтвердження видалення"
        message="Видалити вагу товару? Значення буде скинуто до 0 г."
        confirmText="Видалити"
        cancelText="Скасувати"
        onCancel={() => setDeleteConfirmProductId(null)}
        onConfirm={() => {
          if (deleteConfirmProductId) {
            updateProductWeight(deleteConfirmProductId, 0);
          }
          setDeleteConfirmProductId(null);
        }}
      />

      {/* Модал ручної синхронізації */}
      <Modal 
        isOpen={isManualSyncModalOpen} 
        onClose={() => setIsManualSyncModalOpen(false)}
        size="lg"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <DynamicIcon name="list-filter" size={20} />
              Ручна синхронізація товарів
            </div>
            <p className="text-sm font-normal text-gray-500">
              Синхронізуйте тільки вибрані товари за списком SKU
            </p>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Textarea
                label="Список SKU"
                placeholder="Введіть SKU через кому, пробіл або кожен з нового рядка..."
                value={manualSkuList}
                onValueChange={setManualSkuList}
                minRows={8}
                maxRows={15}
                description={`Введено SKU: ${manualSkuList.split(/[\s,]+/).filter(s => s.trim().length > 0).length}`}
              />
              <div className="text-sm text-gray-500">
                <p className="font-medium mb-1">Формати введення:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Через кому: <code className="bg-gray-100 px-1 rounded">SKU1, SKU2, SKU3</code></li>
                  <li>Через пробіл: <code className="bg-gray-100 px-1 rounded">SKU1 SKU2 SKU3</code></li>
                  <li>Кожен з нового рядка</li>
                </ul>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="flat" 
              onPress={() => setIsManualSyncModalOpen(false)}
              disabled={manualSyncing}
            >
              {manualSyncing ? 'Закрити' : 'Скасувати'}
            </Button>
            <Button 
              color="primary" 
              onPress={syncProductsManual}
              disabled={manualSkuList.trim().length === 0}
            >
              {manualSyncing ? (
                <>
                  <DynamicIcon name="x" size={14} />
                  Скасувати синхронізацію
                </>
              ) : (
                <>
                  <DynamicIcon name="refresh-cw" size={14} />
                  Синхронізувати
                </>
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Модалка для редагування SKU whitelist (складається в таблицю settings_wp_sku) */}
      <Modal
        isOpen={isSkuWhitelistModalOpen}
        onClose={() => setIsSkuWhitelistModalOpen(false)}
        size="lg"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <DynamicIcon name="shield-check" size={20} />
              SKU Whitelist
            </div>
            <p className="text-sm font-normal text-gray-500">Сюди можна внести список SKU, які ніколи не повинні позначатися як застарілі.</p>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Textarea
                label="Whitelist SKU"
                placeholder="Введіть SKU через кому, пробіл або кожен з нового рядка..."
                value={skuWhitelistText}
                onValueChange={setSkuWhitelistText}
                minRows={8}
                maxRows={20}
                description={`Введено SKU: ${skuWhitelistText.split(/[,\s]+/).filter(s => s.trim().length > 0).length}`}
              />
              <div className="text-sm text-gray-500">
                <p className="font-medium mb-1">Порада:</p>
                <p>Запишіть SKU через кому, пробіл або з нового рядка. Збережений список буде використовуватися сервером у функції позначення застарілих товарів.</p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsSkuWhitelistModalOpen(false)} disabled={skuWhitelistSaving}>
              Скасувати
            </Button>
            <Button
              color="primary"
              onPress={async () => {
                try {
                  setSkuWhitelistSaving(true);
                  const response = await fetch('/api/products/sku-whitelist', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ skus: skuWhitelistText })
                  });

                  if (response.ok) {
                    addToast({ title: 'Збережено', description: 'Whitelist збережено на сервері', color: 'success' });
                    setIsSkuWhitelistModalOpen(false);
                  } else {
                    const err = await response.json().catch(() => ({}));
                    addToast({ title: 'Помилка', description: err.error || 'Не вдалося зберегти whitelist', color: 'danger' });
                  }
                } catch (error) {
                  addToast({ title: 'Помилка мережі', description: error instanceof Error ? error.message : 'Невідома помилка', color: 'danger' });
                } finally {
                  setSkuWhitelistSaving(false);
                }
              }}
              disabled={skuWhitelistSaving}
            >
              {skuWhitelistSaving ? (
                <>
                  <DynamicIcon name="loader-2" className="animate-spin" size={14} /> Збереження...
                </>
              ) : (
                'Зберегти'
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Модал експорту в SalesDrive */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        size="4xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <DynamicIcon name="upload" size={20} />
              Експорт товарів в SalesDrive
            </div>
            <p className="text-sm font-normal text-gray-500">
              Перевірте сформований payload і підтвердіть експорт {exportPayload.length} товарів
            </p>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              {/* Інформація про режим експорту */}
              <div className={`p-3 rounded-lg border ${expandSets ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <DynamicIcon 
                    name={expandSets ? 'layers' : 'package'} 
                    size={16} 
                    className={expandSets ? 'text-blue-600' : 'text-gray-600'}
                  />
                  <span className="text-sm font-medium">
                    {expandSets ? 'Режим: Розгорнуті комплекти' : 'Режим: Стандартний експорт'}
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  {expandSets 
                    ? 'Вкладені комплекти розгорнуто на кінцеві товари. SalesDrive отримає фінальний склад без вкладеності.'
                    : 'Комплекти експортуються "як є" з їх оригінальною структурою (може містити вкладені комплекти).'}
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-auto">
                <h4 className="text-sm font-medium mb-2">Payload для експорту:</h4>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-80">
                  {JSON.stringify(exportPayload, null, 2)}
                </pre>
              </div>
              <div className="text-sm text-gray-600">
                <p><strong>Кількість товарів:</strong> {exportPayload.length}</p>
                <p className="mt-1">Після підтвердження дані будуть відправлені на SalesDrive API для оновлення товарів.</p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => setIsExportModalOpen(false)}
              disabled={exporting}
            >
              Скасувати
            </Button>
            <Button
              color="primary"
              onPress={executeExportToSalesDrive}
              disabled={exporting || exportPayload.length === 0}
            >
              {exporting ? (
                <>
                  <DynamicIcon name="loader-2" className="animate-spin" size={14} />
                  Експорт...
                </>
              ) : (
                <>
                  <DynamicIcon name="upload" size={14} />
                  Підтвердити експорт
                </>
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Модалка управління ID батьківських груп комплектів (Set Parent IDs) */}
      <Modal
        isOpen={isSetParentIdsModalOpen}
        onClose={() => setIsSetParentIdsModalOpen(false)}
        size="lg"
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <DynamicIcon name="layers" size={18} />
              Set Parent IDs — ID груп комплектів
            </div>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 mb-3">
              Товари, у яких поле <code className="bg-gray-100 px-1 rounded">parent</code> збігається з одним із зазначених ID,
              вважатимуться <strong>комплектами</strong> під час синхронізації з Dilovod.
            </p>

            {setParentIdsLoading ? (
              <div className="flex items-center gap-2 py-4 text-gray-500">
                <DynamicIcon name="loader-2" className="animate-spin" size={16} />
                Завантаження...
              </div>
            ) : (
              <>
                {/* Список поточних ID */}
                <div className="space-y-2 mb-4">
                  {setParentIds.length === 0 && (
                    <p className="text-sm text-gray-400 italic">Список порожній</p>
                  )}
                  {setParentIds.map((id, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        size="sm"
                        value={id}
                        onChange={(e) =>
                          setSetParentIds(prev =>
                            prev.map((v, i) => (i === index ? e.target.value : v))
                          )
                        }
                        placeholder="ID групи в Dilovod"
                        className="flex-1 font-mono"
                      />
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        isIconOnly
                        onPress={() =>
                          setSetParentIds(prev => prev.filter((_, i) => i !== index))
                        }
                        title="Видалити"
                      >
                        <DynamicIcon name="trash-2" size={14} />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Додавання нового ID */}
                <div className="flex items-center gap-2">
                  <Input
                    size="sm"
                    value={newSetParentIdInput}
                    onChange={(e) => setNewSetParentIdInput(e.target.value)}
                    placeholder="Новий ID групи комплектів..."
                    className="flex-1 font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSetParentIdInput.trim()) {
                        setSetParentIds(prev => [...prev, newSetParentIdInput.trim()]);
                        setNewSetParentIdInput('');
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => {
                      if (newSetParentIdInput.trim()) {
                        setSetParentIds(prev => [...prev, newSetParentIdInput.trim()]);
                        setNewSetParentIdInput('');
                      }
                    }}
                  >
                    <DynamicIcon name="plus" size={14} />
                    Додати
                  </Button>
                </div>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => setIsSetParentIdsModalOpen(false)}
              disabled={setParentIdsSaving}
            >
              Скасувати
            </Button>
            <Button
              color="primary"
              onPress={saveSetParentIds}
              disabled={setParentIdsSaving || setParentIdsLoading}
            >
              {setParentIdsSaving ? (
                <>
                  <DynamicIcon name="loader-2" className="animate-spin" size={14} />
                  Збереження...
                </>
              ) : (
                <>
                  <DynamicIcon name="save" size={14} />
                  Зберегти
                </>
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default ProductSets;
