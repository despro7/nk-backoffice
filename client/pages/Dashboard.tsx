import { useState, useEffect } from "react";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useApi } from "@/hooks/useApi";
import { formatRelativeDate } from "@/lib/formatUtils";
import ProductStatsTable from "@/components/ProductStatsTable";
import ProductStatsChart from "@/components/ProductStatsChart";

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
      const response = await apiCall('/api/orders/sync', { method: 'POST' });
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
              <button
                onClick={handleManualSync}
                disabled={loading}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Синхронізація...' : 'Синхронізувати'}
              </button>
            )}
          </div>
        </div>
        
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="text-center">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2 mx-auto"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto"></div>
                </div>
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Общее количество заказов */}
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stats.total}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Всього замовлень
              </div>
            </div>

            {/* Новые заказы */}
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stats.new}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Нові
              </div>
            </div>

            {/* Подтвержденные заказы */}
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {stats.confirmed}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Підтверджені
              </div>
            </div>

            {/* Готовы к отправке */}
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {stats.readyToShip}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Готові до відправки
              </div>
            </div>

            {/* Отправленные */}
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {stats.shipped}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Відправлені
              </div>
            </div>

            {/* Продажи */}
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats.sold}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Продажі
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500">
            Не вдалося завантажити статистику
          </div>
        )}
      </div>

      {/* Блок для storekeeper и выше */}
      {isStorekeeper() && (
        <>
        <div className="bg-white rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-6">Статистика по замовленим порціям</h2>
          <div className="mb-6">
            <ProductStatsTable />
          </div>
        </div>
        </>
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