import { useState, useEffect } from "react";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useApi } from "@/hooks/useApi";
import { formatRelativeDate } from "@/lib/formatUtils";
import OrdersStatsSummary from "@/components/OrdersStatsSummary";

interface OrdersStats {
  total: number;
  new: number;
  confirmed: number;
  readyToShip: number;
  shipped: number;
  sold: number;
  rejected: number;
  returned: number;
  deleted: number;
}

interface StatsResponse {
  success: boolean;
  data: OrdersStats;
  metadata: {
    source: string;
    lastSynced: string | null;
    fetchedAt: string;
    note: string;
  };
}

interface OrdersStatsBlockProps {
  isAdmin: () => boolean;
  lastSynced: string | null;
}

export default function OrdersStatsBlock({ isAdmin, lastSynced }: OrdersStatsBlockProps) {
  const { apiCall } = useApi();
  const [stats, setStats] = useState<OrdersStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = async () => {
    try {
      const response = await apiCall('/api/orders/stats/summary');
      const data: StatsResponse = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setLoading(true);
      const response = await apiCall('/api/orders-sync/sync', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        await fetchStats();
      } else {
        alert(`Помилка синхронізації: ${data.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      alert(`Помилка синхронізації: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Статистика всіх замовлень</h2>
        <div className="flex items-center gap-3">
          {lastSynced && (
            <div className="text-sm text-gray-500">
              Остання синхронізація: <strong>{formatRelativeDate(lastSynced)}</strong>
            </div>
          )}
          {isAdmin() && (
            <button
              onClick={handleManualSync}
              disabled={loading}
              className="px-3 py-1 text-sm bg-neutral-600 text-white rounded hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Синхронізація...' : 'Синхронізувати'}
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center justify-center bg-neutral-50 rounded p-3 border border-neutral-200 min-h-[70px]">
              <div className="animate-pulse w-8 h-6 bg-gray-200 rounded mb-2" />
              <div className="animate-pulse w-16 h-3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <OrdersStatsSummary stats={stats} />
      ) : (
        <div className="text-center text-gray-500">
          Не вдалося завантажити статистику
        </div>
      )}
    </div>
  );
}








import { useState, useEffect } from "react";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useApi } from "@/hooks/useApi";
import { formatRelativeDate } from "@/lib/formatUtils";
import OrdersStatsSummary from "@/components/OrdersStatsSummary";

interface OrdersStats {
  total: number;
  new: number;
  confirmed: number;
  readyToShip: number;
  shipped: number;
  sold: number;
  rejected: number;
  returned: number;
  deleted: number;
}

interface StatsResponse {
  success: boolean;
  data: OrdersStats;
  metadata: {
    source: string;
    lastSynced: string | null;
    fetchedAt: string;
    note: string;
  };
}

interface OrdersStatsBlockProps {
  isAdmin: () => boolean;
  lastSynced: string | null;
}

export default function OrdersStatsBlock({ isAdmin, lastSynced }: OrdersStatsBlockProps) {
  const { apiCall } = useApi();
  const [stats, setStats] = useState<OrdersStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = async () => {
    try {
      const response = await apiCall('/api/orders/stats/summary');
      const data: StatsResponse = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setLoading(true);
      const response = await apiCall('/api/orders-sync/sync', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        await fetchStats();
      } else {
        alert(`Помилка синхронізації: ${data.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      alert(`Помилка синхронізації: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Статистика всіх замовлень</h2>
        <div className="flex items-center gap-3">
          {lastSynced && (
            <div className="text-sm text-gray-500">
              Остання синхронізація: <strong>{formatRelativeDate(lastSynced)}</strong>
            </div>
          )}
          {isAdmin() && (
            <button
              onClick={handleManualSync}
              disabled={loading}
              className="px-3 py-1 text-sm bg-neutral-600 text-white rounded hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Синхронізація...' : 'Синхронізувати'}
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center justify-center bg-neutral-50 rounded p-3 border border-neutral-200 min-h-[70px]">
              <div className="animate-pulse w-8 h-6 bg-gray-200 rounded mb-2" />
              <div className="animate-pulse w-16 h-3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <OrdersStatsSummary stats={stats} />
      ) : (
        <div className="text-center text-gray-500">
          Не вдалося завантажити статистику
        </div>
      )}
    </div>
  );
}
