import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Checkbox,
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
  addToast,
  DatePicker,
} from '@heroui/react';
import { I18nProvider } from '@react-aria/i18n';
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';

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

  // State for sync preview
  const [syncPreview, setSyncPreview] = useState<any>(null);
  const [syncPreviewLoading, setSyncPreviewLoading] = useState(false);
  const [syncPreviewModal, setSyncPreviewModal] = useState(false);
  const [syncPreviewCache, setSyncPreviewCache] = useState<Map<string, any>>(new Map());
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Mini terminal for logs
  const [logs, setLogs] = useState<string[]>([]);
  const [logsVisible, setLogsVisible] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

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
  const [manualSyncStartDate, setManualSyncStartDate] = useState<CalendarDate | null>(null);
  const [manualSyncEndDate, setManualSyncEndDate] = useState<CalendarDate | null>(null);
  const [manualSyncRunning, setManualSyncRunning] = useState(false);
  const [manualSyncResult, setManualSyncResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);

  // State for sync configuration
  const [syncConfig, setSyncConfig] = useState({
    batchSize: 100,
    maxConcurrent: 5,
    chunkSize: 1000
  });

  // State for sync progress
  const [syncProgress, setSyncProgress] = useState<{
    active: boolean;
    progress?: {
      stage: 'fetching' | 'processing' | 'saving' | 'completed' | 'error';
      message: string;
      processedOrders: number;
      totalOrders?: number;
      currentBatch: number;
      totalBatches: number;
      progressPercent: number;
      elapsedTime: number;
      errors: string[];
    };
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
      label: 'Тип',
      allowsSorting: true,
    },
    {
      key: 'status',
      label: 'Статус',
      allowsSorting: true,
    },
    {
      key: 'progress',
      label: 'Прогрес',
      allowsSorting: false,
    },
    {
      key: 'stats',
      label: 'Статистика',
      allowsSorting: false,
    },
    {
      key: 'duration',
      label: 'Час',
      allowsSorting: true,
    },
    {
      key: 'actions',
      label: 'Дії',
      allowsSorting: false,
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
            {typeLabels[log.type] || log.type}
          </Chip>
        );

      case 'status':
        const statusConfig = {
          success: { label: 'Успішно', color: 'success' as const },
          error: { label: 'Помилка', color: 'danger' as const },
          running: { label: 'Виконується', color: 'warning' as const },
          partial: { label: 'Частково', color: 'warning' as const },
          failed: { label: 'Невдача', color: 'danger' as const }
        };
        const config = statusConfig[log.status] || { label: log.status, color: 'default' as const };
        return (
          <Chip color={config.color} variant="flat" size="sm">
            {config.label}
          </Chip>
        );

      case 'progress':
        if (log.status === 'running') {
          return (
            <div className="flex items-center gap-2">
              <div className="w-16 bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
              <span className="text-xs text-gray-600">60%</span>
            </div>
          );
        }
        return <span className="text-sm text-gray-500">-</span>;

      case 'stats':
        return (
          <div className="text-xs text-gray-600 space-y-1">
            <div>{log.recordsProcessed || 0} оброблено</div>
            {log.details && typeof log.details === 'object' && (
              <div className="text-gray-500">
                {log.details.newOrders !== undefined && `+${log.details.newOrders}`}
                {log.details.updatedOrders !== undefined && ` ~${log.details.updatedOrders}`}
                {log.details.errors !== undefined && log.details.errors > 0 && ` ❌${log.details.errors}`}
              </div>
            )}
          </div>
        );

      case 'duration':
        if (!log.duration) return <span className="text-sm text-gray-500">-</span>;
        const duration = Math.round(log.duration / 1000);
        return (
          <span className="text-sm text-gray-900">
            {duration < 60 ? `${duration}с` : `${Math.floor(duration / 60)}м ${duration % 60}с`}
          </span>
        );

      case 'actions':
        return (
          <div className="flex items-center gap-1">
            {log.details && (
              <Button
                size="sm"
                variant="light"
                onPress={() => openErrorDetails(log)}
                className="p-1 min-w-0"
              >
                <DynamicIcon name="eye" size={14} />
              </Button>
            )}
            {log.errors && log.errors.length > 0 && (
              <Button
                size="sm"
                variant="light"
                color="danger"
                onPress={() => openErrorDetails(log)}
                className="p-1 min-w-0"
              >
                <DynamicIcon name="alert-triangle" size={14} />
              </Button>
            )}
          </div>
        );

      default:
        return '';
    }
  };

  // Load sync logs and statistics
  const loadSyncLogs = async () => {
    setSyncLogsLoading(true);
    try {
      // Load sync logs
      const logsResponse = await fetch('/api/orders/sync/logs', {
        credentials: 'include'
      });

      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        setSyncLogs(logsData.logs || []);
      }

      // Load sync statistics
      const statsResponse = await fetch('/api/orders/sync/stats', {
        credentials: 'include'
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setSyncHistoryStats(statsData.stats);
      }

    } catch (error) {
      console.error('Error loading sync data:', error);
      addToast({
        title: 'Помилка',
        description: 'Не вдалося завантажити дані синхронізації',
        color: 'danger'
      });
    } finally {
      setSyncLogsLoading(false);
    }
  };

  // Open error details modal
  const openErrorDetails = (log: SyncLog) => {
    setSelectedLogForDetails(log);
    errorDetailsModal.onOpen();
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

  // Functions for managing selected orders
  const toggleOrderSelection = (orderNumber: string) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderNumber)) {
        newSet.delete(orderNumber);
      } else {
        newSet.add(orderNumber);
      }
      return newSet;
    });
  };

  const selectOrdersByType = (action: string) => {
    if (!syncPreview) return;

    const allOrders = [
      ...syncPreview.newOrders,
      ...syncPreview.existingOrders,
      ...syncPreview.skippedOrders
    ];

    const ordersToSelect = allOrders
      .filter(order => order.action === action)
      .map(order => order.orderNumber);

    setSelectedOrders(new Set(ordersToSelect));
  };

  const selectAllOrders = () => {
    if (!syncPreview) return;

    const allOrders = [
      ...syncPreview.newOrders,
      ...syncPreview.existingOrders,
      ...syncPreview.skippedOrders
    ];

    const allOrderNumbers = allOrders.map(order => order.orderNumber);
    const currentSize = selectedOrders.size;
    const totalSize = allOrderNumbers.length;

    if (currentSize === totalSize) {
      // Если все уже выбрано, снимаем выбор
      setSelectedOrders(new Set());
    } else {
      // Выбираем все
      setSelectedOrders(new Set(allOrderNumbers));
    }
  };

  const clearSelection = () => {
    setSelectedOrders(new Set());
  };

  // Mini terminal functions
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-49), logEntry]); // Keep last 50 logs
  };

  const clearLogs = () => {
    setLogs([]);
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Run selective sync for selected orders
  const runSelectiveSync = async () => {
    if (selectedOrders.size === 0) {
      addToast({
        title: 'Помилка',
        description: 'Оберіть хоча б один замовлення для синхронізації',
        color: 'danger'
      });
      return;
    }

    setManualSyncRunning(true);
    setManualSyncResult(null);
    setSyncProgress(null);

    addLog(`🔄 Starting selective sync for ${selectedOrders.size} orders...`);
    addLog(`📅 Period: ${manualSyncStartDate?.toString()} - ${(manualSyncEndDate || today(getLocalTimeZone())).toString()}`);

    try {
      const response = await fetch('/api/orders/sync/selective', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          selectedOrders: Array.from(selectedOrders),
          startDate: manualSyncStartDate?.toString(),
          endDate: (manualSyncEndDate || today(getLocalTimeZone())).toString()
        })
      });

      if (response.ok) {
        const result = await response.json();
        setManualSyncResult(result);
        addLog(`✅ Sync completed: ${result.totalCreated || 0} created, ${result.totalUpdated} updated, ${result.totalSkipped} skipped, ${result.totalErrors} errors`);
        addToast({
          title: 'Синхронізація завершена',
          description: `Створено: ${result.totalCreated || 0}, Оновлено: ${result.totalUpdated}`,
          color: 'success'
        });
      } else {
        throw new Error('Failed to run selective sync');
      }
    } catch (error) {
      console.error('Error running selective sync:', error);
      addLog(`❌ Sync failed: ${error}`);
      addToast({
        title: 'Помилка синхронізації',
        description: 'Не вдалося виконати вибіркову синхронізацію',
        color: 'danger'
      });
    } finally {
      setManualSyncRunning(false);
    }
  };

  // Load sync preview with caching
  const loadSyncPreview = async (startDate: string, endDate?: string) => {
    const cacheKey = `${startDate}_${endDate || 'now'}`;
    const cachedResult = syncPreviewCache.get(cacheKey);

    // Check cache first
    if (cachedResult) {
      console.log('Using cached sync preview for:', cacheKey);
      setSyncPreview(cachedResult);
      // Clear previous selection when loading from cache
      setSelectedOrders(new Set());
      return cachedResult;
    }

    setSyncPreviewLoading(true);
    try {
      console.log('Loading sync preview from server for:', cacheKey);
      const response = await fetch('/api/orders/sync/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ startDate, endDate })
      });

      if (response.ok) {
        const data = await response.json();

        // Cache the result on client side
        if (!data.cached) {
          setSyncPreviewCache(prev => new Map(prev).set(cacheKey, data.preview));
        }
        setSyncPreview(data.preview);
        // Clear previous selection when loading new data
        setSelectedOrders(new Set());

        addToast({
          title: data.cached ? 'Попередній перегляд з кеша' : 'Попередній перегляд завантажено',
          description: data.cached ? 'Дані завантажені з серверного кеша' : 'Кешовано для повторного використання',
          color: 'success'
        });

        return data.preview;
      } else {
        throw new Error('Failed to load sync preview');
      }
    } catch (error) {
      console.error('Error loading sync preview:', error);
      addToast({
        title: 'Помилка',
        description: 'Не вдалося завантажити попередній перегляд синхронізації',
        color: 'danger'
      });
      return null;
    } finally {
      setSyncPreviewLoading(false);
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

  // Отслеживание прогресса синхронизации
  const monitorSyncProgress = async () => {
    let attempts = 0;
    const maxAttempts = 150; // Максимум 5 минут (150 * 2 сек)
    let lastProgress = null;

    const checkProgress = async () => {
      attempts++;

      try {
        const response = await fetch('/api/orders/sync/progress', {
          credentials: 'include'
        });
        const result = await response.json();

        if (response.ok && result.success) {
          if (result.active) {
            // Синхронизация активна, обновляем прогресс
            console.log(`📊 [CLIENT PROGRESS] Active: ${result.progress.stage} - ${result.progress.message} (${result.progress.progressPercent}%)`);
            setSyncProgress({
              active: result.active,
              progress: result.progress
            });
            lastProgress = result.progress;

            // Продолжаем мониторинг
            setTimeout(checkProgress, 2000);
          } else {
            // Синхронизация завершена или неактивна
            if (lastProgress && (lastProgress.stage === 'completed' || lastProgress.stage === 'error')) {
              // Показываем финальный статус еще немного времени
              console.log(`📊 [CLIENT PROGRESS] Completed: ${lastProgress.stage} - ${lastProgress.message} (${lastProgress.progressPercent}%)`);
              setSyncProgress({
                active: false,
                progress: lastProgress
              });

              // Ждем еще 3 секунды, чтобы пользователь увидел финальный статус
              setTimeout(() => {
                console.log(`📊 [CLIENT PROGRESS] Clearing progress and reloading data`);
                setSyncProgress(null);
                loadSyncLogs();
                loadSyncHistory();
              }, 3000);
            } else {
              // Нет активной синхронизации
              console.log(`📊 [CLIENT PROGRESS] No active sync found`);
              setSyncProgress(null);
              loadSyncLogs();
              loadSyncHistory();
            }
          }
        } else {
          console.error('Failed to get sync progress:', result);
          // Продолжаем попытки, если это не последняя попытка
          if (attempts < maxAttempts) {
            setTimeout(checkProgress, 2000);
          } else {
            setSyncProgress(null);
          }
        }
      } catch (error) {
        console.error('Error checking sync progress:', error);
        // Продолжаем попытки при ошибке, если это не последняя попытка
        if (attempts < maxAttempts) {
          setTimeout(checkProgress, 2000);
        } else {
          setSyncProgress(null);
        }
      }
    };

    // Начинаем мониторинг
    checkProgress();
  };

  // Preview sync before running
  const previewManualSync = async () => {
    if (!manualSyncStartDate) {
      addToast({
        title: 'Помилка',
        description: 'Оберіть дату початку синхронізації',
        color: 'danger'
      });
      return;
    }

    // Если конечная дата не указана, используем текущую дату
    const endDate = manualSyncEndDate || today(getLocalTimeZone());
    if (manualSyncStartDate.compare(endDate) > 0) {
      addToast({
        title: 'Помилка',
        description: 'Дата початку не може бути пізнішою за дату кінця',
        color: 'danger'
      });
      return;
    }

    const startDateStr = manualSyncStartDate.toString();
    const endDateStr = endDate.toString();

    const preview = await loadSyncPreview(startDateStr, endDateStr);
    if (preview) {
      setSyncPreviewModal(true);
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
    const endDate = manualSyncEndDate || today(getLocalTimeZone());
    if (manualSyncStartDate.compare(endDate) > 0) {
      addToast({
        title: 'Помилка',
        description: 'Дата початку не може бути пізнішою за дату кінця',
        color: 'danger'
      });
      return;
    }

    setManualSyncRunning(true);
    setManualSyncResult(null);
    setSyncProgress(null);

    try {
      const response = await fetch('/api/orders/sync/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startDate: manualSyncStartDate.toString(),
          endDate: endDate.toString(),
          batchSize: syncConfig.batchSize,
          maxConcurrent: syncConfig.maxConcurrent,
          chunkSize: syncConfig.chunkSize
        })
      });

      const result = await response.json();

      if (response.ok) {
        addToast({
          title: 'Успіх',
          description: 'Синхронізація запущена в фоні',
          color: 'success'
        });

        // Если доступен прогресс, начинаем мониторинг
        if (result.progressAvailable) {
          monitorSyncProgress();
        }

        // Ждем немного и обновляем логи
        setTimeout(() => {
          loadSyncLogs();
        }, 3000);

      } else {
        if (response.status === 409) {
          addToast({
            title: 'Помилка',
            description: 'Синхронізація вже виконується',
            color: 'warning'
          });
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
          </div>
        </CardHeader>
        <CardBody className="p-6">
          <p className="text-sm text-gray-600 mb-2">Статистика та керування кешем розпакування комплектів</p>
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
                onPress={loadCacheStats}
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

      {/* Manual Sync */}
      <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="refresh-cw" size={20} className="text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Ручна синхронізація замовлень</h2>
        </CardHeader>
        <CardBody className="p-6">
          <div className="flex flex-col gap-4 items-end">
            
            {/* Настройки синхронизации */}
            <div className="col-span-full mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Налаштування синхронізації</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Input
                    type="number"
                    label="Розмір батча"
                    value={syncConfig.batchSize.toString()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      setSyncConfig(prev => ({ ...prev, batchSize: isNaN(value) ? 100 : Math.max(10, Math.min(100, value)) }));
                    }}
                    classNames={{
                      label: "text-xs font-medium text-gray-600",
                      input: "text-sm"
                    }}
                    min={10}
                    max={100}
                  />
                  <p className="text-xs text-gray-500 mt-1">Кількість замовлень в одному батчі (макс 100 згідно з API SalesDrive)</p>
                </div>

                <div>
                  <Input
                    type="number"
                    label="Максимальна паралельність"
                    value={syncConfig.maxConcurrent.toString()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      setSyncConfig(prev => ({ ...prev, maxConcurrent: isNaN(value) ? 5 : Math.max(1, Math.min(10, value)) }));
                    }}
                    classNames={{
                      label: "text-xs font-medium text-gray-600",
                      input: "text-sm"
                    }}
                    min={1}
                    max={10}
                  />
                  <p className="text-xs text-gray-500 mt-1">Максимум паралельних запитів</p>
                </div>

                <div>
                  <Input
                    type="number"
                    label="Розмір чанка"
                    value={syncConfig.chunkSize.toString()}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      setSyncConfig(prev => ({ ...prev, chunkSize: isNaN(value) ? 1000 : Math.max(200, Math.min(2000, value)) }));
                    }}
                    classNames={{
                      label: "text-xs font-medium text-gray-600",
                      input: "text-sm"
                    }}
                    min={200}
                    max={2000}
                  />
                  <p className="text-xs text-gray-500 mt-1">Чанки для великих обсягів даних</p>
                </div>
              </div>
            </div>

            <div className="flex items-end gap-4 w-full">
              <I18nProvider locale="uk-UA">
                <DatePicker
                  size="lg"
                  label="Дата початку"
                  labelPlacement='outside'
                  value={manualSyncStartDate}
                  maxValue={today(getLocalTimeZone())}
                  onChange={(date) => setManualSyncStartDate(date)}
                  classNames={{
                    base: "flex-1",
                    label: "text-sm font-medium text-gray-500 mb-0",
                    segment: "rounded"
                  }}
                />
              </I18nProvider>
              
              <I18nProvider locale="uk-UA">
                <DatePicker
                  size="lg"
                  label="Дата кінця"
                  labelPlacement='outside'
                  value={manualSyncEndDate || today(getLocalTimeZone())}
                  onChange={(date) => setManualSyncEndDate(date)}
                  classNames={{
                    base: "flex-1",
                    label: "text-sm font-medium text-gray-500 mb-0",
                  }}
                />
              </I18nProvider>

              <Button
                onPress={previewManualSync}
                variant="bordered"
                color="primary"
                size="lg"
                disabled={manualSyncRunning || syncPreviewLoading || !manualSyncStartDate}
                className="flex-1"
              >
                {syncPreviewLoading ? (
                  <>
                    <DynamicIcon name="loader-2" className="mr-2 animate-spin" size={14} />
                    Аналіз...
                  </>
                ) : (
                  <>
                    <DynamicIcon name="eye" size={16} />
                    Попередній перегляд
                    {syncPreviewCache.size > 0 && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1 rounded">
                        {syncPreviewCache.size}
                      </span>
                    )}
                  </>
                )}
              </Button>

              <Button
                onPress={runManualSync}
                color="success"
                size="lg"
                className="text-white flex-1"
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

              <Button
                onPress={() => {
                  // Тестовый прогресс-бар
                  setSyncProgress({
                    active: true,
                    progress: {
                      stage: 'processing',
                      message: 'Тестовое сообщение прогресса',
                      processedOrders: 50,
                      totalOrders: 100,
                      currentBatch: 1,
                      totalBatches: 2,
                      progressPercent: 50,
                      elapsedTime: 30000,
                      errors: []
                    }
                  });
                }}
                color="warning"
                size="lg"
                variant="bordered"
              >
                <DynamicIcon name="settings" size={16} />
                Тест прогресса
              </Button>
            </div>
          </div>

          {/* Прогресс синхронизации */}
          {syncProgress?.active && syncProgress.progress && syncProgress.progress.message && (
            <div className="mt-6 p-4 rounded-lg border bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <DynamicIcon name="loader-2" size={16} className="text-blue-600 animate-spin" />
                <span className="font-medium text-blue-800">Синхронізація виконується...</span>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-sm text-gray-700 mb-1">
                  <span>{syncProgress.progress.message}</span>
                  <span>{syncProgress.progress.progressPercent}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${syncProgress.progress.progressPercent}%` }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="font-medium text-gray-900">{syncProgress.progress.processedOrders}</div>
                  <div className="text-gray-600">Оброблено</div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{syncProgress.progress.totalOrders || 'N/A'}</div>
                  <div className="text-gray-600">Загалом</div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{syncProgress.progress.currentBatch}/{syncProgress.progress.totalBatches}</div>
                  <div className="text-gray-600">Батч</div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">{Math.floor(syncProgress.progress.elapsedTime / 1000)}с</div>
                  <div className="text-gray-600">Час</div>
                </div>
              </div>

              {syncProgress.progress.errors.length > 0 && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm">
                  <div className="text-red-800 font-medium mb-1">Помилки:</div>
                  <ul className="text-red-700 list-disc list-inside">
                    {syncProgress.progress.errors.slice(0, 3).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

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
                onPress={() => setManualSyncResult(null)}
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
                aria-label="Виберіть тип синхронізації"
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
              onPress={() => setSyncLogsFilter({
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
              onPress={loadSyncLogs}
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

      {/* Sync Settings by Type */}
      <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="sliders" size={20} className="text-gray-600 mr-2" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Налаштування за типами синхронізації</h2>
          </div>
        </CardHeader>
        <CardBody className="p-4">
          <div className="space-y-4">
            {/* Orders */}
            <div className="border rounded-md p-3 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <DynamicIcon name="shopping-cart" size={18} className="text-gray-600" />
                <div className="flex-1">
                  <span className="font-medium">Замовлення</span>
                  <span className="block text-xs text-gray-500">Імпорт/оновлення з SalesDrive</span>
                </div>
                <Switch
                  isSelected={syncSettings.orders.enabled}
                  onValueChange={isSelected => setSyncSettings(prev => ({
                    ...prev, orders: { ...prev.orders, enabled: isSelected }
                  }))}
                  size="sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  label="Інтервал (хв)"
                  value={syncSettings.orders.syncInterval.toString()}
                  onChange={e => setSyncSettings(prev => ({
                    ...prev, orders: { ...prev.orders, syncInterval: parseInt(e.target.value) || 30 }
                  }))}
                  min="5" max="480"
                />
                <Input
                  type="number"
                  label="Пакет (шт)"
                  value={syncSettings.orders.batchSize.toString()}
                  onChange={e => setSyncSettings(prev => ({
                    ...prev, orders: { ...prev.orders, batchSize: parseInt(e.target.value) || 50 }
                  }))}
                  min="10" max="200"
                />
                <Input
                  type="number"
                  label="Повтори"
                  value={syncSettings.orders.retryAttempts.toString()}
                  onChange={e => setSyncSettings(prev => ({
                    ...prev, orders: { ...prev.orders, retryAttempts: parseInt(e.target.value) || 3 }
                  }))}
                  min="0" max="10"
                />
              </div>
            </div>
            {/* Products */}
            <div className="border rounded-md p-3 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <DynamicIcon name="package" size={18} className="text-gray-600" />
                <div className="flex-1">
                  <span className="font-medium">Товари</span>
                  <span className="block text-xs text-gray-500">Оновлення каталогу, цін, комплектацій</span>
                </div>
                <Switch
                  isSelected={syncSettings.products.enabled}
                  onValueChange={isSelected => setSyncSettings(prev => ({
                    ...prev, products: { ...prev.products, enabled: isSelected }
                  }))}
                  size="sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  label="Інтервал (год)"
                  value={syncSettings.products.syncInterval.toString()}
                  onChange={e => setSyncSettings(prev => ({
                    ...prev, products: { ...prev.products, syncInterval: parseInt(e.target.value) || 6 }
                  }))}
                  min="1" max="24"
                />
                <Input
                  type="number"
                  label="Пакет (шт)"
                  value={syncSettings.products.batchSize.toString()}
                  onChange={e => setSyncSettings(prev => ({
                    ...prev, products: { ...prev.products, batchSize: parseInt(e.target.value) || 100 }
                  }))}
                  min="10" max="500"
                />
                <Input
                  type="number"
                  label="Повтори"
                  value={syncSettings.products.retryAttempts.toString()}
                  onChange={e => setSyncSettings(prev => ({
                    ...prev, products: { ...prev.products, retryAttempts: parseInt(e.target.value) || 2 }
                  }))}
                  min="0" max="5"
                />
              </div>
            </div>
            {/* Stocks */}
            <div className="border rounded-md p-3 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <DynamicIcon name="warehouse" size={18} className="text-gray-600" />
                <div className="flex-1">
                  <span className="font-medium">Залишки</span>
                  <span className="block text-xs text-gray-500">Оновлення кількості на складах</span>
                </div>
                <Switch
                  isSelected={syncSettings.stocks.enabled}
                  onValueChange={isSelected => setSyncSettings(prev => ({
                    ...prev, stocks: { ...prev.stocks, enabled: isSelected }
                  }))}
                  className="rounded"
                  size="sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  label="Інтервал (хв)"
                  value={syncSettings.stocks.syncInterval.toString()}
                  onChange={e => setSyncSettings(prev => ({
                    ...prev, stocks: { ...prev.stocks, syncInterval: parseInt(e.target.value) || 15 }
                  }))}
                  min="5" max="120"
                />
                <Input
                  type="number"
                  label="Пакет (шт)"
                  value={syncSettings.stocks.batchSize.toString()}
                  onChange={e => setSyncSettings(prev => ({
                    ...prev, stocks: { ...prev.stocks, batchSize: parseInt(e.target.value) || 200 }
                  }))}
                  min="20" max="1000"
                />
                <Input
                  type="number"
                  label="Повтори"
                  value={syncSettings.stocks.retryAttempts.toString()}
                  onChange={e => setSyncSettings(prev => ({
                    ...prev, stocks: { ...prev.stocks, retryAttempts: parseInt(e.target.value) || 1 }
                  }))}
                  min="0" max="3"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onPress={saveSyncSettings}
              color="primary"
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
                  Зберегти
                </>
              )}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Error Details Modal */}
      <Modal scrollBehavior="inside" isOpen={errorDetailsModal.isOpen} onOpenChange={errorDetailsModal.onOpenChange}>
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
            <Button onPress={errorDetailsModal.onClose} color="default" variant="bordered">
              Закрити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Sync Preview Modal */}
      <Modal scrollBehavior="inside" isDismissable={false} isKeyboardDismissDisabled={true} isOpen={syncPreviewModal} onOpenChange={setSyncPreviewModal} size="5xl">
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Попередній перегляд синхронізації</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Аналіз замовлень за період з {manualSyncStartDate?.toString()} по {(manualSyncEndDate || today(getLocalTimeZone())).toString()}
                </p>
              </div>
              {(syncPreviewCache.has(`${manualSyncStartDate?.toString()}_${(manualSyncEndDate || today(getLocalTimeZone())).toString()}`) ||
                (syncPreview && syncPreview.cached)) && (
                <div className="flex items-center text-blue-600">
                  <DynamicIcon name="database" size={16} />
                  <span className="text-sm ml-1">
                    {syncPreview && syncPreview.cached ? 'З серверного кеша' : 'З клієнтського кеша'}
                  </span>
                </div>
              )}
            </div>
          </ModalHeader>
          <ModalBody>
            {syncPreview && (
              <div className="space-y-6">
                {/* Selection Controls */}
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-700">
                      Вибір замовлень для синхронізації ({selectedOrders.size} вибрано)
                    </h3>
                    <div className="flex gap-2">
                      <Button size="sm" variant="bordered" onPress={selectAllOrders}>
                        Вибрати всі
                      </Button>
                      <Button size="sm" variant="bordered" color="success" onPress={() => selectOrdersByType('create')}>
                        🟢 Нові ({syncPreview.stats.new})
                      </Button>
                      <Button size="sm" variant="bordered" color="warning" onPress={() => selectOrdersByType('update')}>
                        🟡 Оновити ({syncPreview.stats.update})
                      </Button>
                      <Button size="sm" variant="bordered" color="primary" onPress={() => selectOrdersByType('skip')}>
                        🔵 Пропустити ({syncPreview.stats.skip})
                      </Button>
                      <Button size="sm" variant="bordered" color="danger" onPress={clearSelection}>
                        Очистити
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Statistics Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <DynamicIcon name="database" size={20} className="text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">З SalesDrive</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mt-2">{syncPreview.totalFromSalesDrive}</div>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <DynamicIcon name="plus" size={20} className="text-green-600" />
                      <span className="text-sm font-medium text-green-700">Нові</span>
                    </div>
                    <div className="text-2xl font-bold text-green-900 mt-2">{syncPreview.stats.new}</div>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <DynamicIcon name="refresh-cw" size={20} className="text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-700">Оновлення</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-900 mt-2">{syncPreview.stats.update}</div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <DynamicIcon name="skip-forward" size={20} className="text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">Пропуск</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-900 mt-2">{syncPreview.stats.skip}</div>
                  </div>
                </div>

                {/* Orders Table */}
                <div className="border rounded-lg overflow-hidden">
                  <Table aria-label="Таблиця попереднього перегляду синхронізації">
                    <TableHeader>
                      <TableColumn width={50}>
                        <Checkbox
                          isSelected={selectedOrders.size === (syncPreview.newOrders.length + syncPreview.existingOrders.length + syncPreview.skippedOrders.length)}
                          onValueChange={selectAllOrders}
                        />
                      </TableColumn>
                      <TableColumn>№ Замовлення</TableColumn>
                      <TableColumn>Клієнт</TableColumn>
                      <TableColumn>Сума</TableColumn>
                      <TableColumn>Статус</TableColumn>
                      <TableColumn>Дата</TableColumn>
                      <TableColumn>Дія</TableColumn>
                      <TableColumn>Деталі</TableColumn>
                    </TableHeader>
                    <TableBody>
                      {[
                        ...syncPreview.newOrders,
                        ...syncPreview.existingOrders,
                        ...syncPreview.skippedOrders
                      ].map((order: any, index: number) => (
                        <TableRow key={`${order.action}-${index}`}>
                          <TableCell>
                            <Checkbox
                              isSelected={selectedOrders.has(order.orderNumber)}
                              onValueChange={() => toggleOrderSelection(order.orderNumber)}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">{order.orderNumber}</span>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{order.customerName}</TableCell>
                          <TableCell>{order.totalPrice}₴</TableCell>
                          <TableCell>{order.status}</TableCell>
                          <TableCell>{order.orderDate ? new Date(order.orderDate).toLocaleDateString('uk-UA') : 'N/A'}</TableCell>
                          <TableCell>
                            <Chip
                              size="sm"
                              color={
                                order.color === 'green' ? 'success' :
                                order.color === 'yellow' ? 'warning' :
                                order.color === 'blue' ? 'primary' : 'danger'
                              }
                              variant="flat"
                            >
                              {order.action === 'create' ? '🟢 Створити' :
                               order.action === 'update' ? '🟡 Оновити' :
                               order.action === 'skip' ? '🔵 Пропустити' : '🔴 Помилка'}
                            </Chip>
                          </TableCell>
                          <TableCell>
                            {order.changes && order.changes.length > 0 && (
                              <div className="text-xs text-gray-600">
                                {order.changes.join(', ')}
                              </div>
                            )}
                            {order.reason && (
                              <div className="text-xs text-gray-500">
                                {order.reason}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="text-center text-sm text-gray-500">
                  Загалом: {syncPreview.totalFromSalesDrive} замовлень
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              onPress={() => setSyncPreviewCache(new Map())}
              color="warning"
              variant="bordered"
              size="sm"
              className="mr-auto"
            >
              <DynamicIcon name="trash-2" size={14} />
              Очистити кеш ({syncPreviewCache.size})
            </Button>
            <Button onPress={() => setSyncPreviewModal(false)} color="default" variant="bordered">
              Скасувати
            </Button>
            <Button
              onPress={() => {
                setSyncPreviewModal(false);
                runSelectiveSync();
              }}
              color="primary"
              className="text-white mr-2"
              disabled={selectedOrders.size === 0}
            >
              <DynamicIcon name="target" size={16} />
              Синхронізувати вибрані ({selectedOrders.size})
            </Button>
            <Button
              onPress={() => {
                setSyncPreviewModal(false);
                runManualSync();
              }}
              color="success"
              className="text-white"
            >
              <DynamicIcon name="play" size={16} />
              Запустити повну синхронізацію
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </div>
  );
};

export default SettingsOrders;
