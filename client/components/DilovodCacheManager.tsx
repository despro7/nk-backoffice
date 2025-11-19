import React, { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '../services/ToastService';
import { DirectoryModal } from './modals/DirectoryModal';
import type { IconName } from 'lucide-react/dynamic';
import { formatRelativeDate } from '../lib/formatUtils';

interface CacheMetadata {
  lastUpdate: string | null;
  recordsCount: number;
  isValid: boolean;
}

interface CacheStatus {
  firms: CacheMetadata;
  accounts: CacheMetadata;
  storages: CacheMetadata;
  paymentForms: CacheMetadata;
  tradeChanels: CacheMetadata;
  deliveryMethods: CacheMetadata;
  goods: CacheMetadata;
}

interface CacheRefreshResult {
  firms: number;
  accounts: number;
  storages: number;
  paymentForms: number;
  tradeChanels: number;
  deliveryMethods: number;
  goods: number;
}

export const DilovodCacheManager: React.FC = () => {

	// Стан для оновлення довідника товарів
	const [updatingGoodsCache, setUpdatingGoodsCache] = useState(false);

	// Окрема функція для оновлення довідника товарів
	const handleRefreshGoodsCache = async () => {
		setUpdatingGoodsCache(true);
		try {
      // Спочатку отримуємо свіжий список SKU з WordPress (без кешу)
      const skusResp = await fetch('/api/dilovod/cache/fresh-skus', {
        method: 'GET',
        credentials: 'include'
      });
      const skusData = await skusResp.json();
      const skus = skusData?.data || [];

      const response = await fetch('/api/goods-cache/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuList: skus })
      });

			let data = null;
			try {
				const text = await response.text();
				data = text ? JSON.parse(text) : null;
			} catch (jsonError) {
				throw new Error('Некоректна відповідь сервера (не JSON)');
			}

			if (response.ok && data && data.success && data.result) {
				ToastService.show({
					title: 'Довідник товарів успішно оновлено',
					description: `Оновлено товарів: ${data.result.count}`,
					color: 'success'
				});
				await fetchCacheStatus();
			} else {
				throw new Error(data?.error || 'Unknown error');
			}
		} catch (error) {
			console.error('Error refreshing goods cache:', error);
			ToastService.show({
				title: 'Помилка оновлення довідника товарів',
				description: error instanceof Error ? error.message : 'Unknown error',
				color: 'danger'
			});
		} finally {
			setUpdatingGoodsCache(false);
		}
	};

  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewingDirectory, setViewingDirectory] = useState<{
    type: keyof CacheStatus;
    data: any[];
  } | null>(null);

  // Завантажити статус кешу
  const fetchCacheStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dilovod/cache/status', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch cache status');
      }

      const data = await response.json();
      if (data.success) {
        setCacheStatus(data.data);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error fetching cache status:', error);
      ToastService.show({
        title: 'Помилка завантаження статусу кешу',
        description: error instanceof Error ? error.message : 'Unknown error',
        color: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  // Оновити весь кеш довідників
  const refreshCache = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/dilovod/cache/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      let data = null;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch (jsonError) {
        throw new Error('Некоректна відповідь сервера (не JSON)');
      }

      if (response.ok && data && data.success) {
        ToastService.show({
          title: 'Кеш довідників успішно оновлено',
          description: data.message || 'Всі довідники оновлено',
          color: 'success'
        });
        await fetchCacheStatus();
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error refreshing cache:', error);
      ToastService.show({
        title: 'Помилка оновлення кешу',
        description: error instanceof Error ? error.message : 'Unknown error',
        color: 'danger'
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Завантажити статус при монтуванні
  useEffect(() => {
    fetchCacheStatus();
  }, []);

  // Завантажити дані довідника для перегляду
  const viewDirectory = async (type: keyof CacheStatus) => {
    try {
      const response = await fetch(`/api/dilovod/directories`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch directory data');
      }

      const result = await response.json();
      if (result.success) {
        // Маппінг ключів: API повертає cashAccounts, але в CacheStatus використовується accounts
        const apiKeyMap: Record<keyof CacheStatus, string> = {
          firms: 'firms',
          accounts: 'cashAccounts',
          storages: 'storages',
          paymentForms: 'paymentForms',
          tradeChanels: 'tradeChanels',
          deliveryMethods: 'deliveryMethods',
          goods: 'goods'
        };
        
        const apiKey = apiKeyMap[type];
        const data = result.data[apiKey] || [];
        
        console.log(`Loading ${type} from API key ${apiKey}:`, data);
        setViewingDirectory({ type, data });
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error fetching directory data:', error);
      ToastService.show({
        title: 'Помилка завантаження довідника',
        description: error instanceof Error ? error.message : 'Unknown error',
        color: 'danger'
      });
    }
  };

  // Отримати іконку для типу довідника
  const getIcon = (type: keyof CacheStatus): IconName => {
    switch (type) {
      case 'firms':
        return 'building-2';
      case 'accounts':
        return 'wallet';
      case 'storages':
        return 'warehouse';
      case 'paymentForms':
        return 'credit-card';
      case 'tradeChanels':
        return 'radio';
      case 'deliveryMethods':
        return 'truck';
      case 'goods':
        return 'package-2';
    }
  };

  // Отримати назву довідника
  const getName = (type: keyof CacheStatus): string => {
    switch (type) {
      case 'firms':
        return 'Фірми';
      case 'accounts':
        return 'Рахунки';
      case 'storages':
        return 'Склади';
      case 'paymentForms':
        return 'Форми оплати';
      case 'tradeChanels':
        return 'Канали продажів';
      case 'deliveryMethods':
        return 'Способи доставки';
      case 'goods':
        return 'Товари';
    }
  };

  // Отримати колонки для таблиці
  const getColumns = (type: keyof CacheStatus) => {
    switch (type) {
      case 'firms':
        return [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Назва' }
        ];
      case 'accounts':
        return [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Назва' },
          { key: 'owner', label: 'Власник (ID фірми)' }
        ];
      case 'storages':
        return [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Назва' }
        ];
      case 'paymentForms':
        return [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Назва' }
        ];
      case 'tradeChanels':
        return [
          { key: 'id', label: 'ID' },
          { key: 'id__pr', label: 'Назва' },
          { key: 'code', label: 'Код' }
        ];
      case 'deliveryMethods':
        return [
          { key: 'id', label: 'ID' },
          { key: 'id__pr', label: 'Назва' },
          { key: 'code', label: 'Код' }
        ];
      case 'goods':
        return [
          { key: 'productNum', label: 'Артикул (SKU)' },
          { key: 'name', label: 'Назва' },
          { key: 'good_id', label: 'good id' }
        ];
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b border-gray-200 flex items-center gap-2">
        <DynamicIcon name="database" className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-gray-900">Кеш довідників Dilovod</h3>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="bordered"
            color="primary"
            onPress={handleRefreshGoodsCache}
            isLoading={updatingGoodsCache}
            isDisabled={loading || refreshing}
            startContent={!updatingGoodsCache && <DynamicIcon name="package" size={14} />}
          >
            {updatingGoodsCache ? 'Оновлення товарів...' : 'Оновити товари'}
          </Button>
          <Button
            size="sm"
            variant="bordered"
            color="primary"
            onPress={refreshCache}
            isLoading={refreshing}
            isDisabled={loading || updatingGoodsCache}
            startContent={!refreshing && <DynamicIcon name="refresh-cw" size={14} />}
          >
            {refreshing ? 'Оновлення...' : 'Оновити все'}
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <DynamicIcon name="loader-2" className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : cacheStatus ? (
          <div className="space-y-4">
            <p className="text-sm text-default-500">
              Кеш оновлюється автоматично раз на добу. Ви можете оновити вручну за потреби.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(Object.keys(cacheStatus) as Array<keyof CacheStatus>).map((type) => {
                const metadata = cacheStatus[type];
                return (
                  <div
                    key={type}
                    className="border border-default-200 rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
												<DynamicIcon name={getIcon(type)} className="w-4 h-4 text-primary shrink-0" />
												<span className="font-semibold text-sm">{getName(type)}</span>
											</div>
											<Chip size="sm" color={metadata.isValid ? 'success' : 'warning'} variant="flat">
												{metadata.isValid ? 'Актуальний' : 'Застарів'}
											</Chip>
                    </div>
                    
                    <div className="text-sm space-y-1">
                      <div className="flex gap-2 items-center">
                        <span className="text-default-500">Записів:</span>
                        <span className="font-medium">{metadata.recordsCount}</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="text-default-500">Оновлено:</span>
                        <div className="flex items-center gap-2">
													<span className="font-medium">{formatRelativeDate(metadata.lastUpdate)}</span>
												</div>
                      </div>
                    </div>

										{metadata.recordsCount > 0 && (
												<div className="mt-3">
													<Button
														size="sm"
														variant="bordered"
														color="primary"
														className='border-0 border-neutral-300 shadow-sm bg-neutral-100'
														startContent={<DynamicIcon name="eye" className="w-4 h-4" />}
														onPress={() => viewDirectory(type)}
														fullWidth
													>
														Переглянути записи
													</Button>
												</div>
											)}
											
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-default-500">
            Немає даних про кеш
          </div>
        )}
      </CardBody>

      {/* Модалка перегляду довідника */}
      {viewingDirectory && (
        <DirectoryModal
          isOpen={true}
          title={getName(viewingDirectory.type)}
          icon={getIcon(viewingDirectory.type)}
          records={viewingDirectory.data}
          columns={getColumns(viewingDirectory.type)}
          onClose={() => setViewingDirectory(null)}
        />
      )}
    </Card>
  );
};
