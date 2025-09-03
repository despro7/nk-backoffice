import { useState, useEffect } from 'react';
import { Card, CardBody } from '@heroui/card';
import { useApi } from '../hooks/useApi';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatRelativeDate } from '../lib/formatUtils';

interface SyncStatus {
  lastSync: string | null;
  totalOrders: number;
  ordersByStatus: Record<string, number>;
  syncStatus: string;
}

export function LastSyncInfo() {
  const [syncInfo, setSyncInfo] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { apiCall } = useApi();

  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const fetchSyncStatus = async () => {
    try {
      setLoading(true);
      const response = await apiCall('/api/orders/sync/status');
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
      <Card className="border-gray-200">
        <CardBody className="p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <DynamicIcon name="loader-2" size={16} className="animate-spin" />
            <span className="text-sm">Завантаження...</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-none bg-neutral-100 w-full">
      <CardBody className="p-4">
        <div className="space-y-3">
          {/* Заголовок */}
          <div className="flex items-center gap-2">
            <DynamicIcon name="refresh-cw" size={16} className="text-blue-500" />
            <h3 className="text-sm font-medium text-gray-700">Остання синхронізація: <span className="text-neutral-500/80">{formatRelativeDate(syncInfo?.lastSync)}</span></h3>
          </div>

          {/* Статус синхронизации */}
          {/* <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className={`text-sm font-medium ${getStatusColor()}`}>
              {syncInfo?.syncStatus === 'success' ? 'Успішно' : 'Потребує уваги'}
            </span>
          </div> */}

        </div>
      </CardBody>
    </Card>
  );
}
