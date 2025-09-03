import React, { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { useApi } from "../hooks/useApi";

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

export function OrdersStats() {
  const { apiCall } = useApi();
  const [stats, setStats] = useState<OrdersStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await apiCall('/api/orders/stats/summary');
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardBody>
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center text-gray-500">
        Не вдалося завантажити статистику
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {/* Общее количество заказов */}
      <Card>
        <CardBody className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {stats.total}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Всього замовлень
          </div>
        </CardBody>
      </Card>

      {/* Новые заказы */}
      <Card>
        <CardBody className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {stats.new}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Нові
          </div>
        </CardBody>
      </Card>

      {/* Подтвержденные заказы */}
      <Card>
        <CardBody className="text-center">
          <div className="text-2xl font-bold text-yellow-600">
            {stats.confirmed}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Підтверджені
          </div>
        </CardBody>
      </Card>

      {/* Готовы к отправке */}
      <Card>
        <CardBody className="text-center">
          <div className="text-2xl font-bold text-orange-600">
            {stats.readyToShip}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Готові до відправки
          </div>
        </CardBody>
      </Card>

      {/* Отправленные */}
      <Card>
        <CardBody className="text-center">
          <div className="text-2xl font-bold text-purple-600">
            {stats.shipped}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Відправлені
          </div>
        </CardBody>
      </Card>

      {/* Продажи */}
      <Card>
        <CardBody className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {stats.sold}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Продажі
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
