import { useState, useEffect, useRef } from 'react';
import { Card, CardBody } from '@heroui/card';
import { useApi } from '../hooks/useApi';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatRelativeDate } from '../lib/formatUtils';
import { Button } from '@heroui/button';
import { Progress } from './ui/progress';

interface SyncStatus {
  lastSync: string | null;
  totalOrders: number;
  ordersByStatus: Record<string, number>;
  syncStatus: string;
}

interface SyncProgress {
  stage: 'fetching' | 'processing' | 'saving' | 'completed' | 'error';
  message: string;
  processedOrders: number;
  totalOrders: number;
  progressPercent: number;
  elapsedTime: number;
  errors: string[];
}

export function LastSyncInfo() {
  const [syncInfo, setSyncInfo] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncSessionId, setSyncSessionId] = useState<string | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { apiCall } = useApi();

  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const fetchSyncStatus = async () => {
    try {
      setLoading(true);
      const response = await apiCall('/api/orders-sync/sync/status');
      if (response.ok) {
        const data = await response.json();
        setSyncInfo(data.data);
      }
    } catch (error) {
      console.error('Error fetching sync status:', error);
    } finally {
      setLoading(false);
    }
  };

  const startSync = async () => {
    try {
      setSyncing(true);
      setSyncProgress(null);
      
      // Запускаємо синхронізацію за останні 7 днів
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();
      
      const response = await apiCall('/api/orders-sync/sync/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          syncMode: 'smart'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSyncSessionId(data.sessionId);
        startProgressPolling(data.sessionId);
      } else {
        throw new Error('Failed to start sync');
      }
    } catch (error) {
      console.error('Error starting sync:', error);
      setSyncing(false);
      setSyncProgress({
        stage: 'error',
        message: 'Помилка запуску синхронізації',
        processedOrders: 0,
        totalOrders: 0,
        progressPercent: 0,
        elapsedTime: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  };

  const startProgressPolling = (sessionId: string) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = setInterval(async () => {
      try {
        const response = await apiCall(`/api/orders-sync/sync/progress?sessionId=${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          
          if (data.active) {
            setSyncProgress(data.progress);
          } else if (data.completed) {
            // Синхронізація завершена
            setSyncing(false);
            setSyncProgress(null);
            setSyncSessionId(null);
            
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            
            // Оновлюємо статус після завершення
            await fetchSyncStatus();
          } else {
            // Немає активного прогресу
            setSyncing(false);
            setSyncProgress(null);
            setSyncSessionId(null);
            
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error('Error polling sync progress:', error);
      }
    }, 1000); // Опитуємо кожну секунду
  };

  // Очищуємо інтервал при розмонтуванні компонента
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);



  const getStatusIcon = () => {
    if (!syncInfo) return <DynamicIcon name="clock" size={16} className="text-gray-400" />;
    
    if (syncInfo.syncStatus === 'success') {
      return <DynamicIcon name="check-circle" size={16} className="text-green-500" />;
    }
    
    return <DynamicIcon name="alert-circle" size={16} className="text-yellow-500" />;
  };

  const getStatusColor = () => {
    if (!syncInfo) return 'text-gray-500';
    
    if (syncInfo.syncStatus === 'success') {
      return 'text-green-600';
    }
    
    return 'text-yellow-600';
  };

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center gap-2 text-neutral-400">
        <DynamicIcon name="loader-2" size={16} className="animate-spin" />
        <span className="text-sm">Завантаження...</span>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center gap-2 text-neutral-400">
      <div className="flex items-center gap-2">
        <DynamicIcon name="refresh-cw" size={16} />
        <span className="text-sm">Остання синхронізація: {formatRelativeDate(syncInfo?.lastSync)}</span>
      </div>
      
      {/* Прогрес синхронізації */}
      {syncProgress && (
        <div className="w-full max-w-xs space-y-2">
          <div className="flex items-center gap-2">
            <DynamicIcon 
              name={syncProgress.stage === 'error' ? 'alert-circle' : 'loader-2'} 
              size={16} 
              className={syncProgress.stage === 'error' ? 'text-red-500' : 'text-blue-500 animate-spin'} 
            />
            <span className="text-sm text-neutral-600">{syncProgress.message}</span>
          </div>
          
          {syncProgress.totalOrders > 0 && (
            <div className="space-y-1">
              <Progress 
                value={syncProgress.progressPercent}
                className={`w-full ${syncProgress.stage === 'error' ? 'bg-red-100' : 'bg-blue-100'}`}
              />
              <div className="text-xs text-neutral-500 text-center">
                {syncProgress.processedOrders}/{syncProgress.totalOrders} замовлень ({syncProgress.progressPercent}%)
              </div>
            </div>
          )}
          
          {syncProgress.errors.length > 0 && (
            <div className="text-xs text-red-500">
              Помилки: {syncProgress.errors.join(', ')}
            </div>
          )}
        </div>
      )}
      
      {/* Кнопка синхронізації */}
      <Button 
        color="secondary" 
        variant="flat" 
        size="sm" 
        className="text-neutral-500" 
        onPress={startSync}
        isDisabled={syncing}
        isLoading={syncing}
      >
        {syncing ? 'Синхронізація...' : 'Синхронізувати зараз'}
      </Button>
    </div>
  );
}
