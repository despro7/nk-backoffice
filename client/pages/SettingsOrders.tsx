import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DynamicIcon } from 'lucide-react/dynamic';

import { formatDateTime } from '../lib/formatUtils';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Select,
  SelectItem,
  SortDescriptor,
  Switch,
  addToast
} from '@heroui/react';

interface SyncLog {
  id: string;
  type: 'orders' | 'products' | 'stocks';
  status: 'success' | 'error' | 'running';
  message: string;
  details?: any;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  recordsProcessed?: number;
  errors?: string[];
}

interface CacheStats {
  totalOrders: number;
  cachedOrders: number;
  cacheHitRate: number;
  lastCacheUpdate: string;
  averageCacheTime: number;
  totalCacheSize: number;
}

interface SyncSettings {
  autoSyncEnabled: boolean;
  cacheEnabled: boolean;
  cacheTtl: number;
  maxConcurrentSyncs: number;
  cacheLoggingEnabled: boolean;

  orders: {
    syncInterval: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    enabled: boolean;
  };

  products: {
    syncInterval: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    enabled: boolean;
  };

  stocks: {
    syncInterval: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    enabled: boolean;
  };
}

const SettingsOrders: React.FC = () => {
  const { user } = useAuth();

  // State for sync logs
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [syncLogsLoading, setSyncLogsLoading] = useState(false);
  const [syncLogsFilter, setSyncLogsFilter] = useState({
    type: '',
    status: '',
    dateFrom: null as Date | null,
    dateTo: null as Date | null,
    searchTerm: ''
  });

  // State for sync history
  const [syncHistory, setSyncHistory] = useState<any[]>([]);
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(false);
  const [syncHistoryFilter, setSyncHistoryFilter] = useState('all');
  const [syncHistoryStats, setSyncHistoryStats] = useState<any>(null);

  // State for cache stats
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheStatsLoading, setCacheStatsLoading] = useState(false);

  // State for sync settings
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    autoSyncEnabled: true,
    cacheEnabled: true,
    cacheTtl: 60,
    maxConcurrentSyncs: 2,
    cacheLoggingEnabled: false,

    orders: {
      syncInterval: 30,
      batchSize: 50,
      retryAttempts: 3,
      retryDelay: 60,
      enabled: true
    },

    products: {
      syncInterval: 6,
      batchSize: 100,
      retryAttempts: 2,
      retryDelay: 30,
      enabled: true
    },

    stocks: {
      syncInterval: 15,
      batchSize: 200,
      retryAttempts: 1,
      retryDelay: 15,
      enabled: true
    }
  });
  const [settingsLoading, setSettingsLoading] = useState(false);

  // State for manual sync
  const [manualSyncStartDate, setManualSyncStartDate] = useState<Date | null>(null);
  const [manualSyncEndDate, setManualSyncEndDate] = useState<Date | null>(null);
  const [manualSyncRunning, setManualSyncRunning] = useState(false);
  const [manualSyncResult, setManualSyncResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);

  // State for error details modal
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<SyncLog | null>(null);
  const errorDetailsModal = useDisclosure();

  // Table sorting
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: 'startedAt',
    direction: 'descending'
  });

  // Check if user is admin
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

  // Table columns for sync logs
  const syncLogColumns = [
    {
      key: 'startedAt',
      label: 'Дата початку',
      allowsSorting: true,
    },
    {
      key: 'type',
      label: 'Тип синхронізації',
      allowsSorting: true,
    },
    {
      key: 'status',
      label: 'Статус',
      allowsSorting: true,
    },
    {
      key: 'message',
      label: 'Повідомлення',
      allowsSorting: false,
    },
    {
      key: 'duration',
      label: 'Тривалість',
      allowsSorting: true,
    },
    {
      key: 'recordsProcessed',
      label: 'Оброблено',
      allowsSorting: true,
    },
  ];

  // Filtered and sorted sync logs
  const filteredSyncLogs = useMemo(() => {
    let filtered = [...syncLogs];

    // Filter by type
    if (syncLogsFilter.type) {
      filtered = filtered.filter(log => log.type === syncLogsFilter.type);
    }

    // Filter by status
    if (syncLogsFilter.status) {
      filtered = filtered.filter(log => log.status === syncLogsFilter.status);
    }

    // Filter by date range
    if (syncLogsFilter.dateFrom) {
      filtered = filtered.filter(log =>
        new Date(log.startedAt) >= syncLogsFilter.dateFrom!
      );
    }
    if (syncLogsFilter.dateTo) {
      filtered = filtered.filter(log =>
        new Date(log.startedAt) <= syncLogsFilter.dateTo!
      );
    }

    // Filter by search term
    if (syncLogsFilter.searchTerm) {
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(syncLogsFilter.searchTerm.toLowerCase())
      );
    }

    // Sort
    if (sortDescriptor?.column) {
      filtered.sort((a, b) => {
        let first: any = a[sortDescriptor.column as keyof SyncLog];
        let second: any = b[sortDescriptor.column as keyof SyncLog];

        if (first === null || first === undefined) first = '';
        if (second === null || second === undefined) second = '';

        let cmp = 0;
        if (first < second) cmp = -1;
        else if (first > second) cmp = 1;

        return sortDescriptor.direction === 'descending' ? -cmp : cmp;
      });
    }

    return filtered;
  }, [syncLogs, syncLogsFilter, sortDescriptor]);

  // Render sync log cells
  const renderSyncLogCell = (log: SyncLog, columnKey: React.Key) => {
    switch (columnKey) {
      case 'startedAt':
        return (
          <span className="text-sm text-gray-900">
            {formatDateTime(log.startedAt)}
          </span>
        );

      case 'type':
        const typeLabels = {
          orders: 'Замовлення',
          products: 'Товари',
          stocks: 'Залишки'
        };
        return (
          <Chip
            color={log.type === 'orders' ? 'primary' : log.type === 'products' ? 'success' : 'secondary'}
            variant="flat"
            size="sm"
          >
            {typeLabels[log.type]}
          </Chip>
        );

      case 'status':
        const statusLabels = {
          success: 'Успішно',
          error: 'Помилка',
          running: 'Виконується'
        };
        return (
          <Chip color="default" variant="flat" size="sm">
            {statusLabels[log.status]}
          </Chip>
        );

      case 'message':
        return (
          <div className="max-w-xs">
            <p className="text-sm text-gray-900 truncate" title={log.message}>
              {log.message}
            </p>
            {log.errors && log.errors.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => openErrorDetails(log)}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  {log.errors.length} помилок - деталі
                </button>
              </div>
            )}
          </div>
        );

      case 'duration':
        if (!log.duration) return <span className="text-sm text-gray-500">-</span>;
        return (
          <span className="text-sm text-gray-900">
            {Math.round(log.duration / 1000)}с
          </span>
        );

      case 'recordsProcessed':
        return (
          <span className="text-sm text-gray-900">
            {log.recordsProcessed || 0}
          </span>
        );

      default:
        return '';
    }
  };

  // Load sync logs
  const loadSyncLogs = async () => {
    setSyncLogsLoading(true);
    try {
      const response = await fetch('/api/orders/sync/logs', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setSyncLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Error loading sync logs:', error);
      addToast({
        title: 'Помилка',
        description: 'Не вдалося завантажити логи синхронізації',
        color: 'danger'
      });
    } finally {
      setSyncLogsLoading(false);
    }
  };

  // Load sync history
  const loadSyncHistory = async () => {
    setSyncHistoryLoading(true);
    try {
      const queryParams = syncHistoryFilter !== 'all' ? `?type=${syncHistoryFilter}` : '';
      const response = await fetch(`/api/orders/sync/history${queryParams}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setSyncHistory(data.data.history || []);
        setSyncHistoryStats(data.data.statistics || null);
      }
    } catch (error) {
      console.error('Error loading sync history:', error);
      addToast({
        title: 'Помилка',
        description: 'Не вдалося завантажити історію синхронізацій',
        color: 'danger'
      });
    } finally {
      setSyncHistoryLoading(false);
    }
  };

  // Load cache stats
  const loadCacheStats = async () => {
    setCacheStatsLoading(true);
    try {
      const response = await fetch('/api/orders/cache/stats', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setCacheStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading cache stats:', error);
      addToast({
        title: 'Помилка',
        description: 'Не вдалося завантажити статистику кешу',
        color: 'danger'
      });
    } finally {
      setCacheStatsLoading(false);
    }
  };

  // Load sync settings
  const loadSyncSettings = async () => {
    setSettingsLoading(true);
    try {
      const response = await fetch('/api/orders/sync/settings', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setSyncSettings(data.settings);
      }
    } catch (error) {
      console.error('Error loading sync settings:', error);
      addToast({
        title: 'Помилка',
        description: 'Не вдалося завантажити налаштування синхронізації',
        color: 'danger'
      });
    } finally {
      setSettingsLoading(false);
    }
  };

  // Save sync settings
  const saveSyncSettings = async () => {
    try {
      const response = await fetch('/api/orders/sync/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(syncSettings)
      });

      if (response.ok) {
        addToast({
          title: 'Успіх',
          description: 'Налаштування синхронізації збережено',
          color: 'success'
        });
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving sync settings:', error);
      addToast({
        title: 'Помилка',
        description: 'Не вдалося зберегти налаштування',
        color: 'danger'
      });
    }
  };

  // Manual sync
  const runManualSync = async () => {
    if (!manualSyncStartDate) {
      addToast({
        title: 'Помилка',
        description: 'Оберіть дату початку синхронізації',
        color: 'danger'
      });
      return;
    }

    // Если конечная дата не указана, используем текущую дату
    const endDate = manualSyncEndDate || new Date();
    if (manualSyncStartDate > endDate) {
      addToast({
        title: 'Помилка',
        description: 'Дата початку не може бути пізнішою за дату кінця',
        color: 'danger'
      });
      return;
    }

    setManualSyncRunning(true);
    try {
      const response = await fetch('/api/orders/sync/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startDate: manualSyncStartDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        })
      });

      const result = await response.json();

      if (response.ok) {
        setManualSyncResult({
          success: true,
          message: result.message,
          data: result.data
        });
        addToast({
          title: 'Успіх',
          description: result.message,
          color: 'success'
        });
        loadSyncLogs(); // Refresh logs
      } else {
        setManualSyncResult({
          success: false,
          message: result.error || 'Не вдалося виконати синхронізацію',
          data: result.data
        });
        addToast({
          title: 'Помилка',
          description: result.error || 'Не вдалося виконати синхронізацію',
          color: 'danger'
        });
      }
    } catch (error) {
      console.error('Error running manual sync:', error);
      addToast({
        title: 'Помилка',
        description: 'Не вдалося виконати ручну синхронізацію',
        color: 'danger'
      });
    } finally {
      setManualSyncRunning(false);
    }
  };

  // Clear cache
  const clearCache = async () => {
    if (syncSettings.cacheLoggingEnabled) {
      console.log('🗑️ [CACHE LOG] Starting cache clear operation...');
    }

    try {
      const startTime = Date.now();
      const response = await fetch('/api/orders/cache/clear', {
        method: 'POST',
        credentials: 'include'
      });

      const duration = Date.now() - startTime;

      if (response.ok) {
        if (syncSettings.cacheLoggingEnabled) {
          console.log(`✅ [CACHE LOG] Cache cleared successfully in ${duration}ms`);
        }
        addToast({
          title: 'Успіх',
          description: 'Кеш очищено',
          color: 'success'
        });
        loadCacheStats(); // Refresh stats
      } else {
        if (syncSettings.cacheLoggingEnabled) {
          console.log(`❌ [CACHE LOG] Cache clear failed in ${duration}ms`);
        }
      }
    } catch (error) {
      if (syncSettings.cacheLoggingEnabled) {
        console.error('❌ [CACHE LOG] Error clearing cache:', error);
      }
      addToast({
        title: 'Помилка',
        description: 'Не вдалося очистити кеш',
        color: 'danger'
      });
    }
  };

  // Open error details modal
  const openErrorDetails = (log: SyncLog) => {
    setSelectedLogForDetails(log);
    errorDetailsModal.onOpen();
  };

  // Load data on mount
  useEffect(() => {
    loadSyncLogs();
    loadSyncHistory();
    loadCacheStats();
    loadSyncSettings();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Налаштування синхронізації даних</h1>
          <p className="text-gray-600 mt-1">Керуйте синхронізацією замовлень, товарів, залишків та кешуванням</p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Всього логів</p>
                <p className="text-2xl font-bold text-gray-900">{syncLogs.length}</p>
              </div>
              <DynamicIcon name="file-text" size={24} className="text-gray-600" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Успішних синх.</p>
                              <p className="text-2xl font-bold text-gray-900">
                {syncLogs.filter(log => log.status === 'success').length}
              </p>
            </div>
            <DynamicIcon name="check-circle" size={24} className="text-gray-600" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Помилок</p>
                              <p className="text-2xl font-bold text-gray-900">
                {syncLogs.filter(log => log.status === 'error').length}
              </p>
            </div>
            <DynamicIcon name="alert-circle" size={24} className="text-gray-600" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Кеш хітрейт</p>
                              <p className="text-2xl font-bold text-gray-900">
                {cacheStats ? `${Math.round(cacheStats.cacheHitRate)}%` : '-'}
              </p>
            </div>
            <DynamicIcon name="database" size={24} className="text-gray-600" />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Cache Statistics */}
      <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="database" size={20} className="text-gray-600 mr-2" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Кешування замовлень</h2>
            <p className="text-sm text-gray-600 mt-1">Статистика та керування кешем розпакування комплектів</p>
          </div>
        </CardHeader>
        <CardBody className="p-6">
          {/* Cache Settings */}
          <div className="flex flex-wrap gap-6 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Switch
                isSelected={syncSettings.cacheEnabled}
                onValueChange={(isSelected) => setSyncSettings(prev => ({
                  ...prev,
                  cacheEnabled: isSelected
                }))}
                size="sm"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">Вкл./Выкл. кешування</div>
                <div className="text-xs text-gray-600">Автоматичне створення кеша при синхронізації</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                isSelected={syncSettings.cacheLoggingEnabled}
                onValueChange={(isSelected) => setSyncSettings(prev => ({
                  ...prev,
                  cacheLoggingEnabled: isSelected
                }))}
                size="sm"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">Логування кешування</div>
                <div className="text-xs text-gray-600">Детальні логи операцій кешування</div>
              </div>
            </div>
          </div>

          {cacheStatsLoading ? (
            <div className="flex items-center justify-center p-8">
              <DynamicIcon name="loader-2" className="animate-spin mr-2" size={16} />
              <span>Завантаження...</span>
            </div>
          ) : cacheStats ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{cacheStats.totalOrders}</div>
                <div className="text-sm text-gray-600">Всього замовлень</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{cacheStats.cachedOrders}</div>
                <div className="text-sm text-gray-600">Кешовано</div>
                <div className="text-xs text-green-600 mt-1">
                  {Math.round((cacheStats.cachedOrders / cacheStats.totalOrders) * 100)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{Math.round(cacheStats.averageCacheTime)}с</div>
                <div className="text-sm text-gray-600">Середній час життя кеша</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{Math.round(cacheStats.totalCacheSize / 1024)}KB</div>
                <div className="text-sm text-gray-600">Розмір кеша</div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500">Немає даних про кеш</div>
          )}

          <div className="mt-6 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Останнє оновлення: {cacheStats?.lastCacheUpdate ? new Date(cacheStats.lastCacheUpdate).toLocaleString('uk-UA') : 'Невідомо'}
            </div>
            <div className="flex gap-3">
              <Button
                onPress={clearCache}
                color="danger"
                variant="bordered"
                size="sm"
                isDisabled={!syncSettings.cacheEnabled}
              >
                <DynamicIcon name="trash-2" size={16} />
                Очистити кеш
              </Button>
              <Button
                onClick={loadCacheStats}
                color="primary"
                variant="bordered"
                size="sm"
                isDisabled={!syncSettings.cacheEnabled}
              >
                <DynamicIcon name="refresh-cw" size={16} />
                Оновити статистику
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Sync Settings */}
      <Card className="opacity-60 pointer-events-none">
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="settings" size={20} className="text-gray-400 mr-2" />
          <div>
            <h2 className="text-lg font-semibold text-gray-500">Загальні налаштування синхронізації</h2>
            <p className="text-sm text-gray-400 mt-1">Налаштування пакетної обробки, повторів та кешування для всіх типів синхронізації (тимчасово недоступно)</p>
          </div>
        </CardHeader>
        <CardBody className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Максимум одночасних синхронізацій
              </label>
              <Input
                type="number"
                value={syncSettings.maxConcurrentSyncs.toString()}
                onChange={(e) => setSyncSettings(prev => ({
                  ...prev,
                  maxConcurrentSyncs: parseInt(e.target.value) || 2
                }))}
                min="1"
                max="10"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                TTL кеша (хв)
              </label>
              <Input
                type="number"
                value={syncSettings.cacheTtl.toString()}
                onChange={(e) => setSyncSettings(prev => ({
                  ...prev,
                  cacheTtl: parseInt(e.target.value) || 60
                }))}
                min="5"
                max="1440"
              />
            </div>

            <div className="col-span-2">
              <p className="text-sm text-gray-600">
                Детальні налаштування для кожного типу синхронізації знаходяться нижче
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={syncSettings.autoSyncEnabled}
                  onChange={(e) => setSyncSettings(prev => ({
                    ...prev,
                    autoSyncEnabled: e.target.checked
                  }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Автоматична синхронізація</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={syncSettings.cacheEnabled}
                  onChange={(e) => setSyncSettings(prev => ({
                    ...prev,
                    cacheEnabled: e.target.checked
                  }))}
                  className="mr-2 rounded"
                />
                <span className="text-sm text-gray-700">Кешування увімкнено</span>
              </label>
            </div>

            {/* Sync Types Enable/Disable */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={syncSettings.orders.enabled}
                  onChange={(e) => setSyncSettings(prev => ({
                    ...prev,
                    orders: {
                      ...prev.orders,
                      enabled: e.target.checked
                    }
                  }))}
                  className="rounded"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Замовлення</span>
                  <p className="text-xs text-gray-500">Автоматична синхронізація</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={syncSettings.products.enabled}
                  onChange={(e) => setSyncSettings(prev => ({
                    ...prev,
                    products: {
                      ...prev.products,
                      enabled: e.target.checked
                    }
                  }))}
                  className="rounded"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Товари</span>
                  <p className="text-xs text-gray-500">Каталог та комплектації</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={syncSettings.stocks.enabled}
                  onChange={(e) => setSyncSettings(prev => ({
                    ...prev,
                    stocks: {
                      ...prev.stocks,
                      enabled: e.target.checked
                    }
                  }))}
                  className="rounded"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Залишки</span>
                  <p className="text-xs text-gray-500">Кількість на складах</p>
                </div>
              </div>
            </div>

            <Button
              onClick={saveSyncSettings}
              color="primary"
              size="sm"
              disabled={settingsLoading}
            >
              {settingsLoading ? (
                <>
                  <DynamicIcon name="loader-2" className="mr-2 animate-spin" size={14} />
                  Збереження...
                </>
              ) : (
                <>
                  <DynamicIcon name="save" size={16} />
                  Зберегти налаштування
                </>
              )}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Sync Settings by Type */}
      <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="sliders" size={20} className="text-gray-600 mr-2" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Налаштування за типами синхронізації</h2>
            <p className="text-sm text-gray-600 mt-1">Індивідуальні налаштування для кожного типу даних</p>
          </div>
        </CardHeader>
        <CardBody className="p-6">
          <div className="space-y-8">
            {/* Orders Sync Settings */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <DynamicIcon name="shopping-cart" size={20} className="text-gray-600" />
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Синхронізація замовлень</h3>
                  <p className="text-sm text-gray-600">Імпорт нових та оновлення існуючих замовлень з SalesDrive</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    isSelected={syncSettings.orders.enabled}
                    onValueChange={(isSelected) => setSyncSettings(prev => ({
                      ...prev,
                      orders: {
                        ...prev.orders,
                        enabled: isSelected
                      }
                    }))}
                    size="sm"
                  />
                  <span className="text-sm text-gray-700">Увімкнено</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Інтервал (хв)
                  </label>
                  <Input
                    type="number"
                    value={syncSettings.orders.syncInterval.toString()}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      orders: {
                        ...prev.orders,
                        syncInterval: parseInt(e.target.value) || 30
                      }
                    }))}
                    min="5"
                    max="480"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Пакет (шт)
                  </label>
                  <Input
                    type="number"
                    value={syncSettings.orders.batchSize.toString()}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      orders: {
                        ...prev.orders,
                        batchSize: parseInt(e.target.value) || 50
                      }
                    }))}
                    min="10"
                    max="200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Повтори
                  </label>
                  <Input
                    type="number"
                    value={syncSettings.orders.retryAttempts.toString()}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      orders: {
                        ...prev.orders,
                        retryAttempts: parseInt(e.target.value) || 3
                      }
                    }))}
                    min="0"
                    max="10"
                  />
                </div>
              </div>
            </div>

            {/* Products Sync Settings */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <DynamicIcon name="package" size={20} className="text-gray-600" />
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Синхронізація товарів</h3>
                  <p className="text-sm text-gray-600">Оновлення каталогу товарів, цін та комплектацій</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={syncSettings.products.enabled}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      products: {
                        ...prev.products,
                        enabled: e.target.checked
                      }
                    }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Увімкнено</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Інтервал (год)
                  </label>
                  <Input
                    type="number"
                    value={syncSettings.products.syncInterval.toString()}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      products: {
                        ...prev.products,
                        syncInterval: parseInt(e.target.value) || 6
                      }
                    }))}
                    min="1"
                    max="24"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Пакет (шт)
                  </label>
                  <Input
                    type="number"
                    value={syncSettings.products.batchSize.toString()}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      products: {
                        ...prev.products,
                        batchSize: parseInt(e.target.value) || 100
                      }
                    }))}
                    min="10"
                    max="500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Повтори
                  </label>
                  <Input
                    type="number"
                    value={syncSettings.products.retryAttempts.toString()}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      products: {
                        ...prev.products,
                        retryAttempts: parseInt(e.target.value) || 2
                      }
                    }))}
                    min="0"
                    max="5"
                  />
                </div>
              </div>
            </div>

            {/* Stocks Sync Settings */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <DynamicIcon name="warehouse" size={20} className="text-gray-600" />
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Синхронізація залишків</h3>
                  <p className="text-sm text-gray-600">Оновлення кількості товарів на складах та партіях</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={syncSettings.stocks.enabled}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      stocks: {
                        ...prev.stocks,
                        enabled: e.target.checked
                      }
                    }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Увімкнено</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Інтервал (хв)
                  </label>
                  <Input
                    type="number"
                    value={syncSettings.stocks.syncInterval.toString()}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      stocks: {
                        ...prev.stocks,
                        syncInterval: parseInt(e.target.value) || 15
                      }
                    }))}
                    min="5"
                    max="120"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Пакет (шт)
                  </label>
                  <Input
                    type="number"
                    value={syncSettings.stocks.batchSize.toString()}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      stocks: {
                        ...prev.stocks,
                        batchSize: parseInt(e.target.value) || 200
                      }
                    }))}
                    min="20"
                    max="1000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Повтори
                  </label>
                  <Input
                    type="number"
                    value={syncSettings.stocks.retryAttempts.toString()}
                    onChange={(e) => setSyncSettings(prev => ({
                      ...prev,
                      stocks: {
                        ...prev.stocks,
                        retryAttempts: parseInt(e.target.value) || 1
                      }
                    }))}
                    min="0"
                    max="3"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-4">
            <Button
              onClick={saveSyncSettings}
              color="primary"
              size="sm"
              disabled={settingsLoading}
            >
              {settingsLoading ? (
                <>
                  <DynamicIcon name="loader-2" className="mr-2 animate-spin" size={14} />
                  Збереження...
                </>
              ) : (
                <>
                  <DynamicIcon name="save" size={16} />
                  Зберегти налаштування
                </>
              )}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Manual Sync */}
      <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="play" size={20} className="text-gray-600 mr-2" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Ручна синхронізація замовлень</h2>
            <p className="text-sm text-gray-600 mt-1">Запуск синхронізації замовлень з довільною датою початку</p>
          </div>
        </CardHeader>
        <CardBody className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Дата початку синхронізації
              </label>
              <Input
                type="date"
                value={manualSyncStartDate ? manualSyncStartDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setManualSyncStartDate(e.target.value ? new Date(e.target.value) : null)}
                placeholder="Оберіть дату початку"
                className="max-w-xs"
              />
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Дата кінця синхронізації <span className="text-xs text-gray-500">(необов'язково)</span>
              </label>
              <Input
                type="date"
                value={manualSyncEndDate ? manualSyncEndDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setManualSyncEndDate(e.target.value ? new Date(e.target.value) : null)}
                placeholder="Оберіть дату кінця"
                className="max-w-xs"
              />
            </div>

            <Button
              onClick={runManualSync}
              color="success"
              disabled={manualSyncRunning || !manualSyncStartDate}
            >
              {manualSyncRunning ? (
                <>
                  <DynamicIcon name="loader-2" className="mr-2 animate-spin" size={14} />
                  Синхронізація...
                </>
              ) : (
                <>
                  <DynamicIcon name="play" size={16} />
                  Запустити синхронізацію
                </>
              )}
            </Button>
          </div>

          {/* Результаты ручной синхронизации */}
          {manualSyncResult && (
            <div className={`mt-6 p-4 rounded-lg border ${manualSyncResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <DynamicIcon
                  name={manualSyncResult.success ? "check-circle" : "x-circle"}
                  size={16}
                  className={manualSyncResult.success ? "text-green-600" : "text-red-600"}
                />
                <span className={`font-medium ${manualSyncResult.success ? 'text-green-800' : 'text-red-800'}`}>
                  {manualSyncResult.success ? 'Синхронізація успішна' : 'Помилка синхронізації'}
                </span>
              </div>
              <p className="text-sm text-gray-700 mb-3">{manualSyncResult.message}</p>

              {manualSyncResult.data && manualSyncResult.data.metadata && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-gray-900">{manualSyncResult.data.metadata.newOrders}</div>
                    <div className="text-gray-600">Нових замовлень</div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{manualSyncResult.data.metadata.updatedOrders}</div>
                    <div className="text-gray-600">Оновлено</div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{manualSyncResult.data.synced}</div>
                    <div className="text-gray-600">Загалом синхронізовано</div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{manualSyncResult.data.metadata.totalDuration.toFixed(1)}с</div>
                    <div className="text-gray-600">Час виконання</div>
                  </div>
                </div>
              )}

              <Button
                size="sm"
                variant="light"
                className="mt-3"
                onClick={() => setManualSyncResult(null)}
              >
                <DynamicIcon name="x" size={14} />
                Сховати результат
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Sync History Table */}
      <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="history" size={20} className="text-gray-600 mr-2" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Історія синхронізацій</h2>
            <p className="text-sm text-gray-600 mt-1">Детальна історія всіх операцій синхронізації з статистикою</p>
          </div>
        </CardHeader>
        <CardBody className="p-6">
          {/* Statistics Overview */}
          {syncHistoryStats && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Статистика синхронізацій</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="font-medium text-gray-900">{syncHistoryStats.totalSyncs}</div>
                  <div className="text-gray-600">Загалом синхронізацій</div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{syncHistoryStats.manualSyncs}</div>
                  <div className="text-gray-600">Ручних синхронізацій</div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{syncHistoryStats.averageDuration.toFixed(1)}с</div>
                  <div className="text-gray-600">Середній час</div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{syncHistoryStats.successRate}%</div>
                  <div className="text-gray-600">Успішність</div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Тип синхронізації</label>
              <Select
                value={syncHistoryFilter}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  setSyncHistoryFilter(selected || 'all');
                }}
                defaultSelectedKeys={[syncHistoryFilter]}
                className="max-w-xs"
              >
                <SelectItem key="all">Всі типи</SelectItem>
                <SelectItem key="manual">Ручна синхронізація</SelectItem>
                <SelectItem key="automatic">Автоматична</SelectItem>
                <SelectItem key="background">Фонова</SelectItem>
              </Select>
            </div>

            <Dropdown>
              <DropdownTrigger>
                <Button variant="bordered" className="justify-between">
                  {syncLogsFilter.status || 'Всі статуси'}
                  <DynamicIcon name="chevron-down" size={16} />
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                selectedKeys={syncLogsFilter.status ? [syncLogsFilter.status] : []}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  setSyncLogsFilter(prev => ({ ...prev, status: selected || '' }));
                }}
                selectionMode="single"
              >
                <DropdownItem key="">Всі статуси</DropdownItem>
                <DropdownItem key="success">Успішно</DropdownItem>
                <DropdownItem key="error">Помилка</DropdownItem>
                <DropdownItem key="running">Виконується</DropdownItem>
              </DropdownMenu>
            </Dropdown>

            <Button
              onClick={() => setSyncLogsFilter({
                type: '',
                status: '',
                dateFrom: null,
                dateTo: null,
                searchTerm: ''
              })}
              variant="bordered"
              size="sm"
            >
              <DynamicIcon name="x" size={16} />
              Очистити
            </Button>
          </div>

          {/* Table */}
          <Table
            aria-label="Таблиця логів синхронізації"
            sortDescriptor={sortDescriptor}
            onSortChange={setSortDescriptor}
            classNames={{
              wrapper: "min-h-[400px]",
            }}
          >
            <TableHeader columns={syncLogColumns}>
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
              items={filteredSyncLogs}
              emptyContent="Логи синхронізації не знайдено"
              isLoading={syncLogsLoading}
              loadingContent={
                <div className="flex items-center justify-center p-8">
                  <DynamicIcon name="loader-2" className="animate-spin mr-2" size={16} />
                  <span>Завантаження логів...</span>
                </div>
              }
            >
              {(item: SyncLog) => (
                <TableRow key={item.id}>
                  {(columnKey) => (
                    <TableCell>{renderSyncLogCell(item, columnKey)}</TableCell>
                  )}
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Refresh Button */}
          <div className="mt-6 flex justify-end">
            <Button
              onClick={loadSyncLogs}
              variant="bordered"
              size="sm"
              disabled={syncLogsLoading}
            >
              <DynamicIcon name="refresh-cw" size={16} />
              Оновити логи
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Error Details Modal */}
      <Modal isOpen={errorDetailsModal.isOpen} onOpenChange={errorDetailsModal.onOpenChange}>
        <ModalContent>
          <ModalHeader>
            <h2 className="text-lg font-semibold">Деталі помилки синхронізації</h2>
          </ModalHeader>
          <ModalBody>
            {selectedLogForDetails && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Тип синхронізації</label>
                    <p className="text-sm text-gray-900">
                      {selectedLogForDetails.type === 'orders' ? 'Замовлення' :
                       selectedLogForDetails.type === 'products' ? 'Товари' :
                       selectedLogForDetails.type === 'stocks' ? 'Залишки' : selectedLogForDetails.type}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Статус</label>
                    <p className={`text-sm ${
                      selectedLogForDetails.status === 'success' ? 'text-green-600' :
                      selectedLogForDetails.status === 'error' ? 'text-red-600' : 'text-blue-600'
                    }`}>
                      {selectedLogForDetails.status === 'success' ? 'Успішно' :
                       selectedLogForDetails.status === 'error' ? 'Помилка' :
                       selectedLogForDetails.status === 'running' ? 'Виконується' : selectedLogForDetails.status}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Початок</label>
                    <p className="text-sm text-gray-900">{formatDateTime(selectedLogForDetails.startedAt)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Завершення</label>
                    <p className="text-sm text-gray-900">
                      {selectedLogForDetails.finishedAt ? formatDateTime(selectedLogForDetails.finishedAt) : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Тривалість</label>
                    <p className="text-sm text-gray-900">
                      {selectedLogForDetails.duration ? `${Math.round(selectedLogForDetails.duration / 1000)}с` : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Оброблено</label>
                    <p className="text-sm text-gray-900">{selectedLogForDetails.recordsProcessed || 0}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Повідомлення</label>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-sm text-gray-900">{selectedLogForDetails.message}</p>
                  </div>
                </div>

                {selectedLogForDetails.details && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Деталі</label>
                    <div className="bg-gray-50 p-3 rounded-md max-h-40 overflow-y-auto">
                      <pre className="text-xs text-gray-900 whitespace-pre-wrap">
                        {JSON.stringify(selectedLogForDetails.details, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedLogForDetails.errors && selectedLogForDetails.errors.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Помилки</label>
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 max-h-40 overflow-y-auto">
                      <ul className="text-sm text-red-800 space-y-1">
                        {selectedLogForDetails.errors.map((error, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-red-600 mt-1">•</span>
                            <span>{error}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={errorDetailsModal.onClose} color="default" variant="bordered">
              Закрити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default SettingsOrders;
