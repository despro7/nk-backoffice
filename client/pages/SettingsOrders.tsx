import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DynamicIcon } from 'lucide-react/dynamic';
import { SyncHistory } from '../components/SyncHistory';
import { formatDateTime, formatRelativeDate, formatDuration } from '../lib/formatUtils';
import { useDilovodSettings } from '../hooks/useDilovodSettings';
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
  Radio,
  RadioGroup,
  addToast,
  DatePicker,
  Progress,
  Tooltip,
  getKeyValue,
  Spinner,
} from '@heroui/react';
import { I18nProvider } from '@react-aria/i18n';
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import { SyncHistoryRecord } from '../types/sync';

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
  const [_syncHistory, _setSyncHistory] = useState<SyncHistoryRecord[]>([]);
  const [_syncHistoryLoading, _setSyncHistoryLoading] = useState(false);
  const [syncHistoryFilter, setSyncHistoryFilter] = useState('all');
  const [syncHistoryStats, setSyncHistoryStats] = useState<any>(null);
  const [selectedHistory, setSelectedHistory] = useState<SyncHistoryRecord | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // State for sync preview
  const [syncPreview, setSyncPreview] = useState<any>(null);
  const [syncPreviewLoading, setSyncPreviewLoading] = useState(false);
  const [syncPreviewModal, setSyncPreviewModal] = useState(false);
  const [syncPreviewCache, setSyncPreviewCache] = useState<Map<string, any>>(new Map());
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Mini terminal for logs
  const [logs, setLogs] = useState<string[]>([]);
  const [_logsVisible, _setLogsVisible] = useState(false);
  const logsEndRef = useRef<any>(null);

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

  // Dilovod orders auto-sync settings
  const { settings: dilovodSettings, saving: dilovodSaving, saveSettings: saveDilovodSettings } = useDilovodSettings({ loadDirectories: false });
  const [ordersInterval, setOrdersInterval] = useState<string>('hourly');
  const [ordersHour, setOrdersHour] = useState<number>(5);
  const [ordersMinute, setOrdersMinute] = useState<number>(5);
  const [ordersBatchSize, setOrdersBatchSize] = useState<number>(50);
  const [ordersRetryAttempts, setOrdersRetryAttempts] = useState<number>(3);

  // Sync local state when dilovod settings are loaded
  useEffect(() => {
    if (dilovodSettings) {
      setOrdersInterval(dilovodSettings.ordersInterval ?? 'hourly');
      setOrdersHour(dilovodSettings.ordersHour ?? 5);
      setOrdersMinute(dilovodSettings.ordersMinute ?? 5);
      setOrdersBatchSize(dilovodSettings.ordersBatchSize ?? 50);
      setOrdersRetryAttempts(dilovodSettings.ordersRetryAttempts ?? 3);
    }
  }, [dilovodSettings]);

  const saveOrdersAutoSyncSettings = async () => {
    const ok = await saveDilovodSettings({
      ordersInterval: ordersInterval as any,
      ordersHour,
      ordersMinute,
      ordersBatchSize,
      ordersRetryAttempts,
    });
    if (ok) {
      addToast({ title: 'Успіх', description: 'Налаштування автосинхронізації замовлень збережено', color: 'success' });
    } else {
      addToast({ title: 'Помилка', description: 'Не вдалося зберегти налаштування', color: 'danger' });
    }
  };

  // State for manual sync
  const [manualSyncStartDate, setManualSyncStartDate] = useState<CalendarDate | null>(null);
  const [manualSyncEndDate, setManualSyncEndDate] = useState<CalendarDate | null>(null);
  const [manualSyncRunning, setManualSyncRunning] = useState(false);
  const [manualSyncMode, setManualSyncMode] = useState<'smart' | 'force'>('smart'); // Режим синхронизации
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

  // State for SalesDrive API testing
  const [apiTestParams, setApiTestParams] = useState({
    orderId: ''
  });
  const [apiTestResult, setApiTestResult] = useState<string>('');
  const [apiTestLoading, setApiTestLoading] = useState(false);
  const [apiTestLogs, setApiTestLogs] = useState<string[]>([]);
  const [apiTestUrl, setApiTestUrl] = useState<string>('');

  // State for quantity calculation testing
  const [quantityTestItems, setQuantityTestItems] = useState('[{"sku":"07028","quantity":1}]');
  const [quantityTestResult, setQuantityTestResult] = useState<string | null>(null);
  const [quantityTestLoading, setQuantityTestLoading] = useState(false);

  const testActualQuantity = async () => {
    setQuantityTestLoading(true);
    setQuantityTestResult(null);
    try {
      const res = await fetch('/api/orders/calculate-actual-quantity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: JSON.parse(quantityTestItems)
        }),
      });
      const data = await res.json();
      setQuantityTestResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setQuantityTestResult('Помилка: ' + e.message);
    }
    setQuantityTestLoading(false);
  };

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

  // State for current operation session ID
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // State for error details modal
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<SyncLog | null>(null);
  const errorDetailsModal = useDisclosure();

  // State for cache validation
  const [cacheValidationStartDate, setCacheValidationStartDate] = useState<CalendarDate | null>(today(getLocalTimeZone()).subtract({ days: 5 }));
  const [cacheValidationEndDate, setCacheValidationEndDate] = useState<CalendarDate | null>(null);
  const [cacheValidationRunning, setCacheValidationRunning] = useState(false);
  const [cacheValidationForce, setCacheValidationForce] = useState(false);
  const [cacheValidationMode, setCacheValidationMode] = useState<'period' | 'full'>('period');
  const [cacheValidationResult, setCacheValidationResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);

  // Table sorting
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: 'startedAt',
    direction: 'descending'
  });

  // Check if user is admin
  if (!user || !['admin'].includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-full">
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
      const logsResponse = await fetch('/api/orders-sync/sync/logs', {
        credentials: 'include'
      });

      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        setSyncLogs(logsData.logs || []);
      }

      // Load sync statistics
      const statsResponse = await fetch('/api/orders-sync/sync/stats', {
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
    _setSyncHistoryLoading(true);
    try {
      const queryParams = syncHistoryFilter !== 'all' ? `?type=${syncHistoryFilter}` : '';
      const response = await fetch(`/api/orders-sync/sync/history${queryParams}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        _setSyncHistory(data.data.history || []);
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
      _setSyncHistoryLoading(false);
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

  const _clearLogs = () => {
    setLogs([]);
  };

  // Test SalesDrive API endpoint
  const testSalesDriveAPI = async () => {
    setApiTestLoading(true);
    setApiTestLogs([]);

    try {
      // Если orderId не указан, попробуем получить последний заказ из БД
      let orderIdToTest = apiTestParams.orderId;

      if (!orderIdToTest) {
        setApiTestLogs(prev => [...prev, `🔄 [INFO] OrderId не указан, получаем последний заказ из БД...`]);

        try {
          // Получаем последний заказ из БД
          const lastOrderResponse = await fetch('/api/orders?limit=1&sort=orderDate:desc', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          });

          if (lastOrderResponse.ok) {
            const lastOrderData = await lastOrderResponse.json();
            if (lastOrderData.data && lastOrderData.data.length > 0) {
              orderIdToTest = lastOrderData.data[0].externalId || lastOrderData.data[0].id?.toString();
              setApiTestLogs(prev => [...prev, `✅ [INFO] Используем последний заказ: ${orderIdToTest}`]);
            }
          }
        } catch (error) {
          setApiTestLogs(prev => [...prev, `⚠️ [WARNING] Не удалось получить последний заказ: ${error instanceof Error ? error.message : 'Unknown error'}`]);
        }
      }

      if (!orderIdToTest) {
        setApiTestLogs(prev => [...prev, `❌ [ERROR] Не указан orderId и не удалось получить последний заказ`]);
        setApiTestResult('Error: Не указан orderId');
        return;
      }

      // Build query parameters
      const params = new (window as any).URLSearchParams();
      params.append('orderId', orderIdToTest);

      const fullUrl = `/api/orders-sync/test-salesdrive?${params.toString()}`;
      setApiTestUrl(fullUrl);

      setApiTestLogs(prev => [...prev, `🔍 [REQUEST] ${fullUrl}`]);
      setApiTestLogs(prev => [...prev, `📋 [PARAMS] orderId: ${orderIdToTest}`]);

      // Make request to our backend endpoint
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      setApiTestLogs(prev => [...prev, `📡 [RESPONSE] Status: ${response.status}`]);

      if (!response.ok) {
        const errorText = await response.text();
        setApiTestLogs(prev => [...prev, `❌ [ERROR] ${errorText}`]);
        setApiTestResult(`Error: ${response.status} - ${response.statusText}`);
        return;
      }

      const data = await response.json();

      setApiTestLogs(prev => [...prev, `✅ [SUCCESS] Response received`]);
      setApiTestLogs(prev => [...prev, `📊 [DATA] Method: ${data.method}`]);
      setApiTestLogs(prev => [...prev, `📊 [DATA] Found: ${data.meta?.found ? 'Yes' : 'No'}`]);

      if (data.success && data.data) {
        setApiTestLogs(prev => [...prev, `📦 [ORDER] ID: ${data.data.orderNumber || data.data.id}`]);
        setApiTestLogs(prev => [...prev, `📦 [ORDER] Status: ${data.data.statusText || data.data.status}`]);
        setApiTestLogs(prev => [...prev, `📦 [ORDER] Customer: ${data.data.customerName || 'N/A'}`]);
      }

      setApiTestResult(JSON.stringify(data, null, 2));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setApiTestLogs(prev => [...prev, `❌ [ERROR] ${errorMessage}`]);
      setApiTestResult(`Error: ${errorMessage}`);
    } finally {
      setApiTestLoading(false);
    }
  };

  // Reset API test parameters to defaults
  const resetApiTestParams = () => {
    setApiTestParams({
      orderId: ''
    });
    setApiTestResult('');
    setApiTestLogs([]);
    setApiTestUrl('');
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Run selective sync for selected orders
  const runSelectiveSync = async () => {
    console.log('🔄 [CLIENT] Selective sync button clicked!');

    if (selectedOrders.size === 0) {
      console.log('❌ [CLIENT] No orders selected');
      addToast({
        title: 'Помилка',
        description: 'Оберіть хоча б один замовлення для синхронізації',
        color: 'danger'
      });
      return;
    }

    console.log('✅ [CLIENT] Starting selective sync with:', {
      selectedOrdersCount: selectedOrders.size,
      startDate: manualSyncStartDate?.toString(),
      endDate: manualSyncEndDate?.toString()
    });

    setManualSyncRunning(true);
    setManualSyncResult(null);
    setSyncProgress(null);

    addLog(`🔄 Starting selective sync for ${selectedOrders.size} orders...`);
    addLog(`📅 Period: ${manualSyncStartDate?.toString()} - ${(manualSyncEndDate || today(getLocalTimeZone())).toString()}`);

    try {
      console.log('🌐 [CLIENT] Making request to /api/orders-sync/sync/selective');

      const response = await fetch('/api/orders-sync/sync/selective', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          selectedOrders: Array.from(selectedOrders),
          startDate: manualSyncStartDate?.toString(),
          endDate: (manualSyncEndDate || today(getLocalTimeZone())).toString(),
          syncMode: manualSyncMode
        })
      });

      console.log('📡 [CLIENT] Selective sync response status:', response.status);

      const result = await response.json();

      console.log('✅ [CLIENT] Selective sync server response:', result);

      if (response.ok && result.sessionId) {
        console.log('🎯 [CLIENT] Starting selective sync progress monitoring for sessionId:', result.sessionId);
        monitorSyncProgress(result.sessionId);

        addToast({
          title: 'Успіх',
          description: 'Вибіркова синхронізація запущена, слідкуйте за прогресом',
          color: 'success'
        });
      } else {
        throw new Error(result.error || 'Failed to start selective sync');
      }
    } catch (error) {
      console.error('Error starting selective sync:', error);
      addLog(`❌ Sync failed: ${error}`);
      addToast({
        title: 'Помилка синхронізації',
        description: error instanceof Error ? error.message : 'Не вдалося запустити вибіркову синхронізацію',
        color: 'danger'
      });
      setManualSyncRunning(false);
      setCurrentSessionId(null);
    }
  };

  // Мониторинг прогресса предварительного анализа
  const monitorPreviewProgress = async (sessionId: string) => {
    console.log('📊 [CLIENT] Starting preview progress monitoring for sessionId:', sessionId);

    let attempts = 0;
    const maxAttempts = 300; // Максимум 10 минут (300 * 2 сек)
    let lastProgress = null;

    const checkProgress = async () => {
      attempts++;

      try {
        console.log(`📊 [CLIENT] Checking progress attempt ${attempts}/${maxAttempts} for sessionId:`, sessionId);

        const response = await fetch(`/api/orders-sync/sync/preview/progress?sessionId=${encodeURIComponent(sessionId)}`, {
          credentials: 'include'
        });

        console.log('📊 [CLIENT] Progress response status:', response.status);

        const result = await response.json();

        console.log('📊 [CLIENT] Progress response:', result);

        if (response.ok && result.success) {
          if (result.active) {
            // Анализ активен, обновляем прогресс
            console.log(`📊 [CLIENT PREVIEW PROGRESS] Active: ${result.progress.stage} - ${result.progress.message} (${result.progress.progressPercent}%)`);
            setSyncProgress({
              active: true,
              progress: result.progress
            });
            lastProgress = result.progress;

            // Продолжаем мониторинг
            setTimeout(checkProgress, 2000);
          } else if (result.completed && result.result) {
            // Анализ завершен успешно, получили результат
            console.log(`📊 [CLIENT PREVIEW PROGRESS] Analysis completed with result!`);

            // Показываем финальный статус
            setSyncProgress({
              active: false,
              progress: {
                stage: 'completed',
                message: 'Анализ завершён успешно',
                processedOrders: result.result.totalFromSalesDrive || 0,
                totalOrders: result.result.totalFromSalesDrive || 0,
                currentBatch: 1,
                totalBatches: 1,
                progressPercent: 100,
                elapsedTime: 0,
                errors: []
              }
            });

            // Сохраняем результат и открываем модальное окно
            setSyncPreview(result.result);
            setSyncPreviewModal(true);

            // Ждем 2 секунды, чтобы пользователь увидел финальный статус
            setTimeout(() => {
              console.log(`📊 [CLIENT PREVIEW PROGRESS] Clearing progress`);
              setSyncProgress(null);
            }, 2000);

            return; // Прерываем цикл мониторинга
          } else {
            // Анализ завершен без результата или с ошибкой
            if (lastProgress && (lastProgress.stage === 'completed' || lastProgress.stage === 'error')) {
              // Показываем финальный статус еще немного времени
              console.log(`📊 [CLIENT PREVIEW PROGRESS] Completed: ${lastProgress.stage} - ${lastProgress.message} (${lastProgress.progressPercent}%)`);
              setSyncProgress({
                active: false,
                progress: lastProgress
              });

              // Ждем еще 2 секунды, чтобы пользователь увидел финальный статус
              setTimeout(() => {
                console.log(`📊 [CLIENT PREVIEW PROGRESS] Clearing progress`);
                setSyncProgress(null);
              }, 2000);
            } else {
              // Нет активного анализа
              console.log(`📊 [CLIENT PREVIEW PROGRESS] No active preview analysis found`);
              setSyncProgress(null);
            }
          }
        } else {
          console.error('Failed to get preview progress:', result);
          // Продолжаем попытки, если это не последняя попытка
          if (attempts < maxAttempts) {
            setTimeout(checkProgress, 2000);
          } else {
            setSyncProgress(null);
          }
        }
      } catch (error) {
        console.error('Error checking preview progress:', error);
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

  // Load sync preview with caching
  const loadSyncPreview = async (startDate: string, endDate?: string) => {
    console.log('🔄 [CLIENT] loadSyncPreview called with:', { startDate, endDate });

    const cacheKey = `${startDate}_${endDate || 'now'}`;
    const cachedResult = syncPreviewCache.get(cacheKey);

    // Check cache first
    if (cachedResult) {
      console.log('💾 [CLIENT] Using cached sync preview for:', cacheKey);
      setSyncPreview(cachedResult);
      // Clear previous selection when loading from cache
      setSelectedOrders(new Set());
      return cachedResult;
    }

    setSyncPreviewLoading(true);
    try {
      console.log('🌐 [CLIENT] Making request to /api/orders-sync/sync/preview with:', { startDate, endDate });

      const response = await fetch('/api/orders-sync/sync/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ startDate, endDate })
      });

      console.log('📡 [CLIENT] Response status:', response.status);
      console.log('📡 [CLIENT] Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const data = await response.json();

        console.log('✅ [CLIENT] Server response data:', data);

        // Начинаем мониторинг прогресса, если есть sessionId
        if (data.sessionId) {
          console.log('🎯 [CLIENT] Starting progress monitoring for sessionId:', data.sessionId);
          setCurrentSessionId(data.sessionId);
          monitorPreviewProgress(data.sessionId);

          // Для кешированных результатов сразу открываем модальное окно
          if (data.cached && data.preview) {
            setSyncPreview(data.preview);
            setSyncPreviewModal(true);
            return data.preview;
          }

          // Для новых результатов ждем завершения анализа через мониторинг
          return null; // Возвращаем null, результат получим через мониторинг
        } else {
          console.log('⚠️ [CLIENT] No sessionId in response');
          throw new Error('No sessionId received from server');
        }
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
      setCurrentSessionId(null);
    }
  };

  // Load sync settings
  const loadSyncSettings = async () => {
    setSettingsLoading(true);
    try {
      const response = await fetch('/api/orders-sync/sync/settings', {
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
      const response = await fetch('/api/orders-sync/sync/settings', {
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


  // Preview sync before running
  const previewManualSync = async () => {
    console.log('🔍 [CLIENT] Preview button clicked!');

    if (!manualSyncStartDate) {
      console.log('❌ [CLIENT] No manualSyncStartDate selected');
      addToast({
        title: 'Помилка',
        description: 'Оберіть дату початку синхронізації',
        color: 'danger'
      });
      return;
    }

    console.log('✅ [CLIENT] Starting preview with dates:', {
      startDate: manualSyncStartDate.toString(),
      endDate: manualSyncEndDate?.toString()
    });

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

    // Запускаем анализ, результат получим через мониторинг прогресса
    await loadSyncPreview(startDateStr, endDateStr);
  };

  // Мониторинг прогресса полной синхронизации
  const monitorSyncProgress = async (sessionId: string) => {
    console.log('📊 [CLIENT] Starting sync progress monitoring for sessionId:', sessionId);

    let attempts = 0;
    const maxAttempts = 600; // Максимум 20 минут (600 * 2 сек)
    let lastProgress = null;

    const checkProgress = async () => {
      attempts++;

      try {
        console.log(`📊 [CLIENT] Checking sync progress attempt ${attempts}/${maxAttempts} for sessionId:`, sessionId);

        const response = await fetch(`/api/orders-sync/sync/progress?sessionId=${encodeURIComponent(sessionId)}`, {
          credentials: 'include'
        });

        console.log('📊 [CLIENT] Sync progress response status:', response.status);

        const result = await response.json();

        console.log('📊 [CLIENT] Sync progress response:', result);

        if (response.ok && result.success) {
          if (result.active) {
            // Синхронизация активна, обновляем прогресс
            console.log(`📊 [CLIENT SYNC PROGRESS] Active: ${result.progress.stage} - ${result.progress.message} (${result.progress.progressPercent}%)`);
            setSyncProgress({
              active: true,
              progress: result.progress
            });
            lastProgress = result.progress;

            // Продолжаем мониторинг
            setTimeout(checkProgress, 2000);
          } else if (result.completed && result.result) {
            // Синхронизация завершена успешно, получили результат
            console.log(`📊 [CLIENT SYNC PROGRESS] Sync completed with result!`);

            // Показываем финальный статус
            setSyncProgress({
              active: false,
              progress: {
                stage: 'completed',
                message: 'Синхронизация завершена успешно',
                processedOrders: result.result.synced || 0,
                totalOrders: (result.result.synced || 0) + (result.result.errors || 0),
                currentBatch: 1,
                totalBatches: 1,
                progressPercent: 100,
                elapsedTime: 0,
                errors: []
              }
            });

            // Сохраняем результат
            setManualSyncResult({
              success: result.result.success,
              message: `Синхронизировано: ${result.result.synced}, Ошибок: ${result.result.errors}`,
              data: result.result
            });

            // Ждем 3 секунды, чтобы пользователь увидел финальный статус
            setTimeout(() => {
              console.log(`📊 [CLIENT SYNC PROGRESS] Clearing progress`);
              setSyncProgress(null);
              setManualSyncRunning(false);
      setCurrentSessionId(null);
              setCurrentSessionId(null);
            }, 3000);

            return; // Прерываем цикл мониторинга
          } else {
            // Синхронизация завершилась без результата
            if (lastProgress && (lastProgress.stage === 'completed' || lastProgress.stage === 'error')) {
              // Показываем финальный статус еще немного времени
              console.log(`📊 [CLIENT SYNC PROGRESS] Completed: ${lastProgress.stage} - ${lastProgress.message} (${lastProgress.progressPercent}%)`);
              setSyncProgress({
                active: false,
                progress: lastProgress
              });

              // Ждем еще 2 секунды, чтобы пользователь увидел финальный статус
              setTimeout(() => {
                console.log(`📊 [CLIENT SYNC PROGRESS] Clearing progress`);
                setSyncProgress(null);
                setManualSyncRunning(false);
      setCurrentSessionId(null);
              }, 2000);
            } else {
              // Нет активной синхронизации
              console.log(`📊 [CLIENT SYNC PROGRESS] No active sync found`);
              setSyncProgress(null);
              setManualSyncRunning(false);
      setCurrentSessionId(null);
              setCurrentSessionId(null);
            }
          }
        } else {
          console.error('Failed to get sync progress:', result);
          // Продолжаем попытки, если это не последняя попытка
          if (attempts < maxAttempts) {
            setTimeout(checkProgress, 2000);
          } else {
            setSyncProgress(null);
            setManualSyncRunning(false);
      setCurrentSessionId(null);
          }
        }
      } catch (error) {
        console.error('Error checking sync progress:', error);
        // Продолжаем попытки при ошибке, если это не последняя попытка
        if (attempts < maxAttempts) {
          setTimeout(checkProgress, 2000);
        } else {
          setSyncProgress(null);
          setManualSyncRunning(false);
      setCurrentSessionId(null);
        }
      }
    };

    // Начинаем мониторинг
    checkProgress();
  };

  // Manual sync
  const runManualSync = async () => {
    console.log('🔄 [CLIENT] Manual sync button clicked!');

    if (!manualSyncStartDate) {
      console.log('❌ [CLIENT] No manualSyncStartDate selected');
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

    console.log('✅ [CLIENT] Starting manual sync with dates:', {
      startDate: manualSyncStartDate.toString(),
      endDate: endDate.toString()
    });

    setManualSyncRunning(true);
    setManualSyncResult(null);
    setSyncProgress(null);

    try {
      console.log('🌐 [CLIENT] Making request to /api/orders-sync/sync/manual');

      // Отправляем POST-запрос на ручной запуск синхронизации заказов
      // Передаем выбранные даты, параметры батча и режим синхронизации
      const response = await fetch('/api/orders-sync/sync/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startDate: manualSyncStartDate.toString(),
          endDate: endDate.toString(),
          batchSize: syncConfig.batchSize,
          maxConcurrent: syncConfig.maxConcurrent,
          chunkSize: syncConfig.chunkSize,
          syncMode: manualSyncMode
        })
      });

      console.log('📡 [CLIENT] Manual sync response status:', response.status);

      const result = await response.json();

      console.log('✅ [CLIENT] Manual sync server response:', result);

      if (response.ok && result.sessionId) {
        console.log('🎯 [CLIENT] Starting sync progress monitoring for sessionId:', result.sessionId);
        setCurrentSessionId(result.sessionId);
        monitorSyncProgress(result.sessionId);

        addToast({
          title: 'Успіх',
          description: 'Синхронізація запущена, слідкуйте за прогресом',
          color: 'success'
        });
      } else {
        throw new Error(result.error || 'Failed to start manual sync');
      }
    } catch (error) {
      console.error('Error starting manual sync:', error);
      addToast({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося запустити синхронізацію',
        color: 'danger'
      });
      setManualSyncRunning(false);
      setCurrentSessionId(null);
    }
  };

  // Stop operation
  const stopOperation = async (sessionId: string, operationType: 'preview' | 'sync') => {
    console.log(`🛑 [CLIENT] Stopping ${operationType} operation with sessionId: ${sessionId}`);

    try {
      const response = await fetch(`/api/orders-sync/cancel/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log(`✅ [CLIENT] Successfully requested cancellation for ${operationType} operation`);

        addToast({
          title: 'Успіх',
          description: `Запит на зупинку ${operationType === 'preview' ? 'попереднього перегляду' : 'синхронізації'} відправлено`,
          color: 'success'
        });

        // Stop local monitoring
        if (operationType === 'sync') {
          setManualSyncRunning(false);
      setCurrentSessionId(null);
        } else if (operationType === 'preview') {
          setSyncPreviewLoading(false);
      setCurrentSessionId(null);
        }

        // Clear session ID
        setCurrentSessionId(null);

      } else {
        throw new Error(result.error || 'Failed to cancel operation');
      }
    } catch (error) {
      console.error('❌ [CLIENT] Error stopping operation:', error);
      addToast({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося зупинити операцію',
        color: 'danger'
      });
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

  // Validate and update cache
  const validateCache = async () => {
    console.log('🔍 [CLIENT] Cache validation started...');

    if (cacheValidationMode === 'period' && !cacheValidationStartDate) {
      addToast({
        title: 'Помилка',
        description: 'Оберіть дату початку валідації',
        color: 'danger'
      });
      return;
    }

    setCacheValidationRunning(true);
    setCacheValidationResult(null);

    addLog('🔍 Starting cache validation...');

    try {
      const params = new (window as any).URLSearchParams({
        startDate: cacheValidationStartDate?.toString() || '',
        force: cacheValidationForce.toString(),
        mode: cacheValidationMode
      });

      if (cacheValidationEndDate) {
        params.append('endDate', cacheValidationEndDate.toString());
      }

      const response = await fetch(`/api/orders/cache/validate?${params}`, {
        method: 'POST',
        credentials: 'include'
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('✅ [CLIENT] Cache validation completed:', result);

        setCacheValidationResult({
          success: true,
          message: 'Валідація кеша завершена успішно',
          data: result.data
        });

        addToast({
          title: 'Успіх',
          description: `Кеш провалідовано: ${result.data.summary.updated} оновлено, ${result.data.summary.deleted} видалено`,
          color: 'success'
        });

        addLog(`✅ Cache validation completed: ${result.data.summary.processed} processed, ${result.data.summary.updated} updated, ${result.data.summary.deleted} deleted`);

        // Refresh cache stats
        loadCacheStats();

      } else {
        throw new Error(result.error || 'Cache validation failed');
      }

    } catch (error) {
      console.error('❌ [CLIENT] Cache validation error:', error);
      addLog(`❌ Cache validation failed: ${error}`);

      setCacheValidationResult({
        success: false,
        message: error instanceof Error ? error.message : 'Помилка валідації кеша'
      });

      addToast({
        title: 'Помилка валідації',
        description: error instanceof Error ? error.message : 'Не вдалося провалідувати кеш',
        color: 'danger'
      });
    } finally {
      setCacheValidationRunning(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadSyncLogs();
    loadSyncHistory();
    loadCacheStats();
    loadSyncSettings();
  }, []);

  // MODAL HANDLERS
  const openDetailsModal = (item: SyncHistoryRecord) => {
    setSelectedHistory(item);
    setIsDetailsModalOpen(true);
  };

  // Table columns for sync history
  const syncHistoryColumns = [
    { key: 'id', label: 'ID', allowsSorting: true },
    { key: 'createdAt', label: 'Дата', allowsSorting: true },
    { key: 'syncType', label: 'Тип', allowsSorting: true },
    { key: 'status', label: 'Статус', allowsSorting: true },
    { key: 'progress', label: 'Прогрес', allowsSorting: false },
    { key: 'stats', label: 'Статистика', allowsSorting: false },
    { key: 'duration', label: 'Час', allowsSorting: true },
    { key: 'actions', label: 'Дії', allowsSorting: false },
  ];

  // Filtered and sorted sync history
  const filteredSyncHistory = useMemo(() => {
    let filtered = [..._syncHistory];

    // Sort
    if (sortDescriptor?.column) {
      filtered.sort((a, b) => {
        let first: any = a[sortDescriptor.column as keyof SyncHistoryRecord];
        let second: any = b[sortDescriptor.column as keyof SyncHistoryRecord];

        if (first === null || first === undefined) first = '';
        if (second === null || second === undefined) second = '';

        let cmp = 0;
        if (first < second) cmp = -1;
        else if (first > second) cmp = 1;

        return sortDescriptor.direction === 'descending' ? -cmp : cmp;
      });
    }

    return filtered;
  }, [_syncHistory, sortDescriptor]);

  // Render sync history cells
  const renderSyncHistoryCell = (item: SyncHistoryRecord, columnKey: React.Key) => {
    switch (columnKey) {
      case 'id':
        return <span className="font-mono text-sm text-gray-700">#{item.id}</span>;
      case 'createdAt':
        return (
          <div className="text-sm text-gray-900 flex flex-col">
            <span>{formatDateTime(item.createdAt)}</span>
            <span className="text-xs text-gray-500">{formatRelativeDate(item.createdAt)}</span>
          </div>
        );
      case 'syncType':
        const typeLabels: { [key: string]: string } = {
          manual: 'Manual',
          automatic: 'Auto',
          background: 'Background'
        };
        const typeColors: { [key: string]: 'primary' | 'secondary' | 'default' } = {
          manual: 'primary',
          automatic: 'secondary',
          background: 'default'
        };
        return (
          <Chip
            color={typeColors[item.syncType] || 'default'}
            variant="flat"
            size="sm"
          >
            {typeLabels[item.syncType] || item.syncType}
          </Chip>
        );
      case 'status':
        const statusConfig = {
          success: { label: 'Успішно', color: 'success', icon: 'check-circle' },
          partial: { label: 'Частково', color: 'warning', icon: 'alert-triangle' },
          failed: { label: 'Помилка', color: 'danger', icon: 'x-circle' }
        };
        const config = statusConfig[item.status as keyof typeof statusConfig] || { label: item.status, color: 'default', icon: 'help-circle' };
        return (
          <Chip color={config.color as any} variant="dot" size="sm">
            {config.label}
          </Chip>
        );
      case 'progress':
        let progressValue = 0;
        let progressColor: "success" | "warning" | "danger" = "success";
        if (item.status === 'success') {
          progressValue = 100;
          progressColor = 'success';
        } else if (item.status === 'failed') {
          progressValue = 100;
          progressColor = 'danger';
        } else if (item.status === 'partial') {
          progressValue = item.totalOrders > 0 ? Math.round(((item.newOrders + item.updatedOrders) / item.totalOrders) * 100) : 0;
          progressColor = 'warning';
        }
        return (
          <div className="w-32">
            <Progress
              aria-label="progress"
              value={progressValue}
              color={progressColor}
              size="sm"
              showValueLabel={item.status !== 'failed'}
            />
             {item.status === 'failed' && <span className="text-xs text-danger-500">Помилка виконання</span>}
          </div>
        );
      case 'stats':
        return (
          <div className="flex items-center gap-2 text-xs">
            <Tooltip content="Нові">
              <div className="flex items-center gap-1 text-green-600">
                <DynamicIcon name="plus-circle" size={12} />
                <span>{item.newOrders}</span>
              </div>
            </Tooltip>
            <Tooltip content="Оновлені">
              <div className="flex items-center gap-1 text-blue-600">
                <DynamicIcon name="refresh-cw" size={12} />
                <span>{item.updatedOrders}</span>
              </div>
            </Tooltip>
             <Tooltip content="Пропущені">
              <div className="flex items-center gap-1 text-gray-500">
                <DynamicIcon name="skip-forward" size={12} />
                <span>{item.skippedOrders}</span>
              </div>
            </Tooltip>
             <Tooltip content="Помилки">
              <div className="flex items-center gap-1 text-red-600">
                <DynamicIcon name="x-octagon" size={12} />
                <span>{item.errors}</span>
              </div>
            </Tooltip>
          </div>
        );
      case 'duration':
        return (
          <span className="text-sm text-gray-700">{formatDuration(item.duration)}</span>
        );
      case 'actions':
        return (
          <div className="relative flex items-center gap-2">
            <Tooltip content="Переглянути деталі">
              <Button isIconOnly size="sm" variant="light" onPress={() => openDetailsModal(item)}>
                <DynamicIcon name="eye" className="text-lg text-default-400" />
              </Button>
            </Tooltip>
          </div>
        );
      default:
        return <span>{getKeyValue(item, columnKey as string)}</span>;
    }
  };

  return (
    <div className="space-y-6">
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
                isSelected={!!syncSettings.cacheLoggingEnabled}
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
                <div className="text-3xl font-bold text-gray-900">{Math.round(cacheStats.averageCacheTime)}h</div>
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

      {/* Auto Orders Sync Settings */}
      <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="timer" size={20} className="text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Автоматична синхронізація замовлень</h2>
        </CardHeader>
        <CardBody className="p-6 space-y-4">
          <div className="grid md:grid-cols-4 grid-cols-2 gap-4">
            <Select
              color={ordersInterval === 'none sync' ? 'danger' : 'default'}
              label="Інтервал синхронізації"
              placeholder="Оберіть інтервал"
              selectedKeys={[ordersInterval]}
              onSelectionChange={(keys) => setOrdersInterval(Array.from(keys)[0] as string)}
            >
              <SelectItem key="none sync">Не синхронізувати</SelectItem>
              <SelectItem key="hourly">Щогодини</SelectItem>
              <SelectItem key="every two hours">Кожні 2 години</SelectItem>
              <SelectItem key="twicedaily">Двічі на день</SelectItem>
              <SelectItem key="daily">Щодня</SelectItem>
              <SelectItem key="every two days">Кожні 2 дні</SelectItem>
            </Select>

            {['twicedaily', 'daily', 'every two days'].includes(ordersInterval) && (
              <Select
                label={ordersInterval === 'twicedaily' ? 'Час запуску (перший)' : 'Час запуску'}
                description={ordersInterval === 'twicedaily'
                  ? `Другий запуск о ${String(((ordersHour) + 12) % 24).padStart(2, '0')}:${String(ordersMinute).padStart(2, '0')}`
                  : undefined}
                selectedKeys={[ordersHour.toString()]}
                onSelectionChange={(keys) => setOrdersHour(Number(Array.from(keys)[0]))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i.toString()} textValue={`${String(i).padStart(2, '0')}:00`}>
                    {String(i).padStart(2, '0')}:00
                  </SelectItem>
                ))}
              </Select>
            )}

            {['hourly', 'every two hours'].includes(ordersInterval) && (
              <Select
                label="Хвилина запуску"
                description={ordersInterval === 'every two hours' ? 'Щогодини з парних годин' : undefined}
                selectedKeys={[ordersMinute.toString()]}
                onSelectionChange={(keys) => setOrdersMinute(Number(Array.from(keys)[0]))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={(i * 5).toString()} textValue={`:${String(i * 5).padStart(2, '0')}`}>
                    :{String(i * 5).padStart(2, '0')}
                  </SelectItem>
                ))}
              </Select>
            )}

            {ordersInterval !== 'none sync' && (
              <>
              <Input
                type="number"
                label="Розмір пакета (batchSize)"
                description="Кількість замовлень в одному запиті до SalesDrive API (макс. 100)"
                value={String(ordersBatchSize)}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setOrdersBatchSize(isNaN(v) ? 50 : Math.max(10, Math.min(100, v)));
                }}
                min={10}
                max={100}
              />
              <Input
                type="number"
                label="Повторних спроб (retryAttempts)"
                description="Кількість повторів при помилці синхронізації"
                value={String(ordersRetryAttempts)}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setOrdersRetryAttempts(isNaN(v) ? 3 : Math.max(0, Math.min(10, v)));
                }}
                min={0}
                max={10}
              />
              </>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              color="primary"
              onPress={saveOrdersAutoSyncSettings}
              isLoading={dilovodSaving}
              startContent={!dilovodSaving && <DynamicIcon name="save" size={16} />}
            >
              {dilovodSaving ? 'Збереження...' : 'Зберегти'}
            </Button>
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
                  maxValue={today(getLocalTimeZone())}
                  onChange={(date) => setManualSyncEndDate(date)}
                  classNames={{
                    base: "flex-1",
                    label: "text-sm font-medium text-gray-500 mb-0",
                  }}
                />
              </I18nProvider>
            </div>

            <div className="flex items-center gap-4 w-full">
              <RadioGroup
                label="Режим синхронізації"
                orientation="horizontal"
                value={manualSyncMode}
                onValueChange={(value) => setManualSyncMode(value as 'smart' | 'force')}
                classNames={{
                  base: "flex-1",
                  label: "text-sm font-medium text-gray-500 mb-0"
                }}
              >
                <Radio value="smart" description="Тільки замовлення з змінами">
                  Smart-синхронізація
                </Radio>
                <Radio value="force" description="Всі замовлення">
                  Повна синхронізація
                </Radio>
              </RadioGroup>

              <Button
                onPress={syncPreviewLoading ? () => stopOperation(currentSessionId, 'preview') : previewManualSync}
                variant="bordered"
                color={syncPreviewLoading ? "danger" : "primary"}
                size="lg"
                disabled={manualSyncRunning || !manualSyncStartDate}
                className="flex-1"
              >
                {syncPreviewLoading ? (
                  <>
                    <DynamicIcon name="x" size={16} className="mr-2" />
                    Зупинити аналіз
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
                onPress={manualSyncRunning ? () => stopOperation(currentSessionId, 'sync') : runManualSync}
                color={manualSyncRunning ? "danger" : "success"}
                size="lg"
                className="text-white flex-1"
                disabled={!manualSyncStartDate}
              >
                {manualSyncRunning ? (
                  <>
                    <DynamicIcon name="x" size={16} className="mr-2" />
                    Зупинити синхронізацію
                  </>
                ) : (
                  <>
                    <DynamicIcon name="play" size={16} />
                    Запустити {manualSyncMode === 'smart' ? 'smart' : 'повну'} синхронізацію
                  </>
                )}
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

      {/* Cache Validation */}
      <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="check-circle" size={20} className="text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Валідація кеша замовлень</h2>
        </CardHeader>
        <CardBody className="p-6">
          <div className="flex flex-col gap-4 items-end">

            {/* Настройки валидации */}
            <div className="w-full mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <Switch
                    isSelected={cacheValidationForce}
                    onValueChange={setCacheValidationForce}
                    size="sm"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Примусова валідація</div>
                    <div className="text-xs text-gray-600">Оновити всі записи кешу в обраному періоді</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <RadioGroup
                    label="Режим валідації"
                    orientation="horizontal"
                    value={cacheValidationMode}
                    onValueChange={(value) => {
                      const newMode = value as 'period' | 'full';
                      setCacheValidationMode(newMode);
                      // Очищаем результат при смене режима
                      setCacheValidationResult(null);
                    }}
                    classNames={{
                      base: "flex-1",
                      label: "text-sm font-medium text-gray-500 mb-0"
                    }}
                  >
                    <Radio value="period" description="Тільки за період">
                      За період
                    </Radio>
                    <Radio value="full" description="Всі кешовані замовлення">
                      Повна
                    </Radio>
                  </RadioGroup>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 mb-1">Пакетна обробка</div>
                    <div className="text-xs text-gray-600">50 замовлень за пакет</div>
                    <div className="text-xs text-gray-500">з паузою 500мс між пакетами</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-end gap-4 w-full">
              <I18nProvider locale="uk-UA">
                <DatePicker
                  size="lg"
                  label={`Дата початку ${cacheValidationMode === 'period' ? '' : '(не обов\'язково)'}`}
                  labelPlacement='outside'
                  value={cacheValidationStartDate}
                  maxValue={today(getLocalTimeZone())}
                  onChange={setCacheValidationStartDate}
                  isDisabled={cacheValidationMode === 'full'}
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
                  label="Дата кінця (необов'язково)"
                  labelPlacement='outside'
                  value={cacheValidationEndDate}
                  maxValue={today(getLocalTimeZone())}
                  onChange={setCacheValidationEndDate}
                  isDisabled={cacheValidationMode === 'full'}
                  classNames={{
                    base: "flex-1",
                    label: "text-sm font-medium text-gray-500 mb-0",
                  }}
                />
              </I18nProvider>

              <Button
                onPress={validateCache}
                color="warning"
                size="lg"
                className="text-white flex-1"
                disabled={cacheValidationRunning || (cacheValidationMode === 'period' && !cacheValidationStartDate)}
              >
                {cacheValidationRunning ? (
                  <>
                    <DynamicIcon name="loader-2" className="mr-2 animate-spin" size={14} />
                    Валідація...
                  </>
                ) : (
                  <>
                    <DynamicIcon name="check-circle" size={16} />
                    Провалідувати кеш ({cacheValidationMode === 'full' ? 'повна' : 'за період'})
                  </>
                )}
              </Button>
            </div>

            {/* Результаты валидации */}
            {cacheValidationResult && (
              <div className={`mt-6 p-4 rounded-lg border w-full ${cacheValidationResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <DynamicIcon
                    name={cacheValidationResult.success ? "check-circle" : "x-circle"}
                    size={16}
                    className={cacheValidationResult.success ? "text-green-600" : "text-red-600"}
                  />
                  <span className={`font-medium ${cacheValidationResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {cacheValidationResult.success ? 'Валідація завершена успішно' : 'Помилка валідації'}
                  </span>
                </div>

                {cacheValidationResult.success && cacheValidationResult.data && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-3 rounded-lg mb-4">
                      <div className="text-sm text-blue-800">
                        <strong>Режим валідації:</strong> {cacheValidationMode === 'full' ? 'Повна валідація (всі замовлення)' : 'Валідація за період'}
                        {cacheValidationMode === 'period' && (
                          <div className="mt-1 text-xs">
                            Період: {cacheValidationStartDate?.toString()} - {(cacheValidationEndDate || today(getLocalTimeZone())).toString()}
                            <br />
                            <span className="text-gray-500">
                              Шукаємо замовлення, оновлені в цьому періоді
                            </span>
                          </div>
                        )}

                        {cacheValidationResult?.data?.summary?.batchesProcessed && (
                          <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                            <div className="text-blue-800 font-medium">
                              📦 Пакетна обробка завершена
                            </div>
                            <div className="text-blue-600 mt-1">
                              {cacheValidationResult.data.summary.batchesProcessed} пакетів × {cacheValidationResult.data.summary.batchSize} замовлень
                              <br />
                              Час обробки: ~{cacheValidationResult.data.summary.estimatedProcessingTime}с
                            </div>
                          </div>
                        )}
                      </div>
                    </div>


                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="font-medium text-gray-900">{cacheValidationResult.data.summary.processed}</div>
                        <div className="text-gray-600">Оброблено</div>
                      </div>
                      <div>
                        <div className="font-medium text-green-900">{cacheValidationResult.data.summary.updated}</div>
                        <div className="text-gray-600">Оновлено</div>
                      </div>
                      <div>
                        <div className="font-medium text-blue-900">{cacheValidationResult.data.summary.cacheHitRate}%</div>
                        <div className="text-gray-600">Хітрейт кеша</div>
                      </div>
                      <div>
                        <div className="font-medium text-orange-900">{cacheValidationResult.data.summary.errors}</div>
                        <div className="text-gray-600">Помилок</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="font-medium text-blue-900">{cacheValidationResult.data.stats.cacheHits}</div>
                        <div className="text-gray-600">Попадань у кеш</div>
                      </div>
                      <div>
                        <div className="font-medium text-yellow-900">{cacheValidationResult.data.stats.cacheStale}</div>
                        <div className="text-gray-600">Застарілих</div>
                      </div>
                      <div>
                        <div className="font-medium text-green-900">{cacheValidationResult.data.stats.itemsUnchanged}</div>
                        <div className="text-gray-600">Товарів не змінились</div>
                        <div className="text-xs text-gray-500 mt-1">
                          незважаючи на дату
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-red-900">{cacheValidationResult.data.stats.cacheMisses}</div>
                        <div className="text-gray-600">Пропущених</div>
                      </div>
                      <div>
                        <div className="font-medium text-purple-900">{cacheValidationResult.data.stats.totalActual}</div>
                        <div className="text-gray-600">Знайдено замовлень</div>
                        <div className="text-xs text-gray-500 mt-1">
                          в базі даних
                        </div>
                      </div>
                    </div>

                    {cacheValidationResult.data.finalCacheStats && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <h4 className="text-sm font-medium text-blue-800 mb-2">Стан кеша після валідації:</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="font-medium text-blue-900">{cacheValidationResult.data.finalCacheStats.totalOrders}</div>
                            <div className="text-gray-600">Загалом замовлень</div>
                          </div>
                          <div>
                            <div className="font-medium text-blue-900">{cacheValidationResult.data.finalCacheStats.cachedOrders}</div>
                            <div className="text-gray-600">Кешовано</div>
                          </div>
                          <div>
                            <div className="font-medium text-blue-900">{Math.round(cacheValidationResult.data.finalCacheStats.averageCacheTime)}h</div>
                            <div className="text-gray-600">Середній час життя</div>
                          </div>
                          <div>
                            <div className="font-medium text-blue-900">{Math.round(cacheValidationResult.data.finalCacheStats.totalCacheSize / 1024)}KB</div>
                            <div className="text-gray-600">Розмір кеша</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  size="sm"
                  variant="light"
                  className="mt-3"
                  onPress={() => setCacheValidationResult(null)}
                >
                  <DynamicIcon name="x" size={14} />
                  Сховати результат
                </Button>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
      
      {/* SalesDrive Order List Test */}
      <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="shopping-cart" size={20} className="text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Тест отримання замовлення з SalesDrive</h2>
        </CardHeader>
        <CardBody className="p-6">
          {/* API Parameters Section */}
          <div className="space-y-6 mt-4">
            <div className="flex gap-4">
              <Input
                aria-label="Номер замовлення (orderId)"
                placeholder="Номер замовлення"
                value={apiTestParams.orderId}
                onChange={(e) => setApiTestParams(prev => ({ ...prev, orderId: e.target.value }))}
                size="lg"
                className='max-w-sm'
                description="Залиште поле пустим для автоматичного отримання останнього замовлення з БД"
              />

              {/* Action Buttons */}
              <div className="flex gap-4">
                <Button
                  color="primary"
                  size="lg"
                  onPress={testSalesDriveAPI}
                  isLoading={apiTestLoading}
                  startContent={!apiTestLoading && <DynamicIcon name="play" size={16} />}
                >
                  {apiTestLoading ? 'Тестування...' : 'Отримати JSON'}
                </Button>

                <Button
                  color="secondary"
                  size="lg"
                  variant="bordered"
                  onPress={resetApiTestParams}
                  startContent={<DynamicIcon name="rotate-ccw" size={16} />}
                >
                  Очистить
                </Button>
              </div>
            </div>

            {/* Response */}
            {apiTestResult && (
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-900">Ответ API: <span className="text-gray-500 ml-auto font-mono">URL запроса: {apiTestUrl}</span></h3>

                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 font-mono text-sm overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <pre className="whitespace-pre-wrap break-all">
                      {apiTestResult}
                    </pre>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="bordered"
                    onPress={() => navigator.clipboard.writeText(apiTestResult)}
                    startContent={<DynamicIcon name="copy" size={14} />}
                  >
                    Скопіювати JSON
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-4 mt-4">
              <label className="block text-sm font-medium text-gray-700">Тестовий items (JSON для calculateActualQuantity)</label>
              <textarea
                className="w-full border rounded p-2 font-mono text-xs"
                rows={4}
                value={quantityTestItems}
                onChange={e => setQuantityTestItems(e.target.value)}
                placeholder='[{"sku":"07028","quantity":1}]'
              />
              <Button
                color="primary"
                onPress={testActualQuantity}
                isLoading={quantityTestLoading}
              >
                {quantityTestLoading ? "Обчислення..." : "Перевірити actualQuantity"}
              </Button>
              {quantityTestResult && (
                <pre className="bg-gray-100 border rounded p-2 mt-2 text-xs">{quantityTestResult}</pre>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Sync History Table */}
      <SyncHistory />

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
              Запустити {manualSyncMode === 'smart' ? 'умну' : 'повну'} синхронізацію
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </div>
  );
};

export default SettingsOrders;
