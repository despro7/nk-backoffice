import { useState, useEffect } from "react";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useApi } from "@/hooks/useApi";
import { formatRelativeDate } from "@/lib/formatUtils";
import WeightStatsTable from "@/components/WeightStatsTable";
import OrdersStatsSummary from "@/components/OrdersStatsSummary";
import { Button } from "@heroui/button";

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

export default function Dashboard() {
  const { isAdmin, isBoss, isShopManager, isAdsManager, isStorekeeper } = useRoleAccess();
  const { apiCall } = useApi();
  const [stats, setStats] = useState<OrdersStats | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await apiCall('/api/orders/stats/summary');
      const data: StatsResponse = await response.json();
      
      if (data.success) {
        setStats(data.data);
        setLastSynced(data.metadata.lastSynced);
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
        console.log('Manual sync completed:', data);
        // Обновляем статистику после синхронизации
        await fetchStats();
      } else {
        console.error('Manual sync failed:', data.error);
        alert(`Помилка синхронізації: ${data.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      console.error('Error during manual sync:', error);
      alert(`Помилка синхронізації: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      
      {/* Статистика по заказам - для всех пользователей */}
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
            <Button
              color="default"
              onPress={handleManualSync}
              disabled={loading}
              className="bg-neutral-600 text-white h-8 px-3 rounded-sm"
              >
              {loading ? 'Синхронізація...' : 'Синхронізувати'}
            </Button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex flex-col justify-center p-6 bg-white rounded-md border border-neutral-200 min-h-[70px]">
                <div className="animate-pulse w-12 h-8 bg-gray-200 rounded mb-2" />
                <div className="animate-pulse w-26 h-4 bg-gray-100 rounded" />
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

      {/* Блок для storekeeper и выше */}
      {isStorekeeper() && (
        <div className="mb-6">
          <WeightStatsTable />
        </div>
      )}

      {/* Блок для ads-manager и выше */}
      {isAdsManager() && (
        <div className="bg-white rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Аналітика продажів</h2>
          <p>Цей блок доступний менеджерам по рекламі та вище</p>
        </div>
      )}

      {/* Блок для shop-manager и выше */}
      {isShopManager() && (
        <div className="bg-white rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Управління магазином</h2>
          <p>Цей блок доступний менеджерам магазину та вище</p>
        </div>
      )}

      {/* Блок для boss и выше */}
      {isBoss() && (
        <div className="bg-white rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Фінансова звітність</h2>
          <p>Цей блок доступний босам та вище</p>
        </div>
      )}

      {/* Блок только для admin */}
      {isAdmin() && (
        <div className="bg-white rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Адміністративні налаштування</h2>
          <p>Цей блок доступний тільки адміністраторам</p>
        </div>
      )}
    </div>
  );
}