import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, CardHeader, Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '../services/ToastService';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';
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
  settlementsKinds: CacheMetadata;
  cashItems: CacheMetadata;
  ledgerAccounts: CacheMetadata;
  tradeChanels: CacheMetadata;
  deliveryMethods: CacheMetadata;
  units: CacheMetadata;
  priceTypes: CacheMetadata;
  currency: CacheMetadata;
  accPolicies: CacheMetadata;
  goods: CacheMetadata;
}

const CACHE_TYPE_ORDER: Array<keyof CacheStatus> = [
  'firms', 'accounts', 'storages', 'paymentForms', 'settlementsKinds', 'cashItems', 'ledgerAccounts', 'tradeChanels', 'deliveryMethods',
  'units', 'priceTypes', 'currency', 'accPolicies', 'goods',
];

export const DilovodCacheManager: React.FC = () => {
  // Стан для оновлення довідника товарів
  const [updatingGoodsCache, setUpdatingGoodsCache] = useState(false);
  // Доступ до контексту довідників (опціонально, провайдер може бути відсутній під час міграції)
  const dirsCtx = (() => {
    try {
      return useDilovodDirectories();
    } catch {
      return null as ReturnType<typeof useDilovodDirectories> | null;
    }
  })();

  const {
    settings: dilovodSettings,
    saveSettings: saveDilovodSettings,
    saving: savingColorMap,
  } = useDilovodSettings({ loadDirectories: false });

  const [accPolicyColorMap, setAccPolicyColorMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setAccPolicyColorMap(dilovodSettings?.accPolicyColorMap || {});
  }, [dilovodSettings?.accPolicyColorMap]);

  const handleAccPolicyColorChange = useCallback(
    async (id: string, hue: string | null) => {
      const next = { ...accPolicyColorMap };
      if (hue) next[id] = hue;
      else delete next[id];

      setAccPolicyColorMap(next);

      if (!dilovodSettings) {
        ToastService.show({
          title: 'Не вдалося зберегти колір',
          description: 'Налаштування Dilovod ще не завантажені',
          color: 'warning',
        });
        return;
      }

      const ok = await saveDilovodSettings({
        accPolicyColorMap: next,
      });

      if (ok) {
        ToastService.show({
          title: hue ? 'Колір закріплено' : 'Закріплення знято',
          description: hue ? `${hue} → ${id}` : id,
          color: 'success',
        });
      } else {
        // rollback
        setAccPolicyColorMap(dilovodSettings.accPolicyColorMap || {});
        ToastService.show({
          title: 'Помилка збереження кольору',
          color: 'danger',
        });
      }
    },
    [accPolicyColorMap, dilovodSettings, saveDilovodSettings]
  );

  // Окрема функція для оновлення довідника товарів
  const handleRefreshGoodsCache = async () => {
    setUpdatingGoodsCache(true);
    try {
      // Свіжий список SKU з catalog_goods (Готова продукція)
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

      let data: any = null;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch {
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
  const [refreshingType, setRefreshingType] = useState<keyof CacheStatus | null>(null);
  const [viewingDirectory, setViewingDirectory] = useState<{
    type: keyof CacheStatus;
    data: any[];
  } | null>(null);

  // Завантажити статус кешу
  const fetchCacheStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dilovod/cache/status', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch cache status');

      const result = await response.json();
      if (!result || !result.success) throw new Error(result?.error || 'Unknown error');

      // result.data should contain metadata about cache status per directory
      setCacheStatus(result.data || null);
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

  const refreshCache = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/dilovod/cache/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      let data: any = null;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch {
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
      // Prefer provider if available
      if (dirsCtx) {
        await dirsCtx.loadDirectories();
        const result = dirsCtx.directories || {} as any;
        const apiKeyMap: Record<keyof CacheStatus, string> = {
          firms: 'firms',
          accounts: 'cashAccounts',
          storages: 'storages',
          paymentForms: 'paymentForms',
          settlementsKinds: 'settlementsKinds',
          cashItems: 'cashItems',
          ledgerAccounts: 'ledgerAccounts',
          tradeChanels: 'tradeChanels',
          deliveryMethods: 'deliveryMethods',
          units: 'units',
          priceTypes: 'priceTypes',
          currency: 'currencies',
          accPolicies: 'accPolicies',
          goods: 'goods'
        };
        const apiKey = apiKeyMap[type];
        const data = result[apiKey] || [];
        console.log(`Loading ${type} from provider key ${apiKey}:`, data);
        setViewingDirectory({ type, data });
        // provider already holds directories state
        return;
      }

      // fallback: direct fetch
      const response = await fetch(`/api/dilovod/directories`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch directory data');

      const result = await response.json();
      if (result.success) {
        const apiKeyMap: Record<keyof CacheStatus, string> = {
          firms: 'firms',
          accounts: 'cashAccounts',
          storages: 'storages',
          paymentForms: 'paymentForms',
          settlementsKinds: 'settlementsKinds',
          cashItems: 'cashItems',
          ledgerAccounts: 'ledgerAccounts',
          tradeChanels: 'tradeChanels',
          deliveryMethods: 'deliveryMethods',
          units: 'units',
          priceTypes: 'priceTypes',
          currency: 'currencies',
          accPolicies: 'accPolicies',
          goods: 'goods'
        };

        const apiKey = apiKeyMap[type];
        const data = result.data[apiKey] || [];

        console.log(`Loading ${type} from API key ${apiKey}:`, data);
        setViewingDirectory({ type, data });

        // Update context if available (provider may be absent during migration)
        if (dirsCtx && dirsCtx.setDirectories) {
          dirsCtx.setDirectories(result.data || null);
        }
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
      case 'settlementsKinds':
        return 'receipt';
      case 'cashItems':
        return 'coins';
      case 'ledgerAccounts':
        return 'book-marked';
      case 'tradeChanels':
        return 'radio';
      case 'deliveryMethods':
        return 'truck';
      case 'units':
        return 'ruler';
      case 'priceTypes':
        return 'tags';
      case 'currency':
        return 'banknote';
      case 'accPolicies':
        return 'book-open';
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
      case 'settlementsKinds':
        return 'Види розрахунків';
      case 'cashItems':
        return 'Статті руху коштів';
      case 'ledgerAccounts':
        return 'План рахунків';
      case 'tradeChanels':
        return 'Канали продажів';
      case 'deliveryMethods':
        return 'Способи доставки';
      case 'units':
        return 'Одиниці виміру';
      case 'priceTypes':
        return 'Типи цін';
      case 'currency':
        return 'Валюти';
      case 'accPolicies':
        return 'Облік (тип номенклатури)';
      case 'goods':
        return 'Товари';
    }
  };

  const handleRefreshDirectory = async (type: keyof CacheStatus) => {
    if (type === 'goods') {
      await handleRefreshGoodsCache();
      return;
    }

    setRefreshingType(type);
    try {
      const response = await fetch(`/api/dilovod/cache/refresh/${type}`, {
        method: 'POST',
        credentials: 'include',
      });

      let data: { success?: boolean; error?: string; message?: string; data?: { count?: number } } | null = null;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error('Некоректна відповідь сервера (не JSON)');
      }

      if (response.ok && data?.success) {
        ToastService.show({
          title: `${getName(type)} оновлено`,
          description: typeof data.data?.count === 'number' ? `Записів: ${data.data.count}` : data.message,
          color: 'success',
        });
        await fetchCacheStatus();
        if (dirsCtx) {
          await dirsCtx.loadDirectories(true);
        }
      } else {
        throw new Error(data?.error || data?.message || 'Unknown error');
      }
    } catch (error) {
      console.error(`Error refreshing ${type} cache:`, error);
      ToastService.show({
        title: `Помилка оновлення: ${getName(type)}`,
        description: error instanceof Error ? error.message : 'Unknown error',
        color: 'danger',
      });
    } finally {
      setRefreshingType(null);
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
      case 'settlementsKinds':
        return [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Назва' },
          { key: 'id__pr', label: 'Представлення' },
          { key: 'code', label: 'Код' }
        ];
      case 'cashItems':
        return [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Назва' },
          { key: 'id__pr', label: 'Представлення' },
          { key: 'code', label: 'Код' }
        ];
      case 'ledgerAccounts':
        return [
          { key: 'id', label: 'ID' },
          { key: 'id__pr', label: 'Представлення' },
          { key: 'name', label: 'Назва' },
          { key: 'parent__pr', label: 'Батьківський' },
          { key: 'code', label: 'Код' }
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
      case 'units':
      case 'priceTypes':
      case 'currency':
      case 'accPolicies':
        return [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Назва' },
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
            isDisabled={loading || refreshing || refreshingType !== null}
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
            isDisabled={loading || updatingGoodsCache || refreshingType !== null}
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {CACHE_TYPE_ORDER.filter((type) => cacheStatus[type]).map((type) => {
                const metadata = cacheStatus[type];
                const isRefreshingThis =
                  refreshingType === type || (type === 'goods' && updatingGoodsCache);
                const busy = loading || refreshing || updatingGoodsCache || refreshingType !== null;
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

                    <div className="mt-3 flex gap-2">
                      {metadata.recordsCount > 0 && (
                        <Button
                          size="sm"
                          variant="bordered"
                          color="primary"
                          className="border-0 border-neutral-300 shadow-sm bg-neutral-100 flex-1"
                          startContent={<DynamicIcon name="eye" className="w-4 h-4" />}
                          onPress={() => viewDirectory(type)}
                          isDisabled={busy}
                        >
                          Переглянути записи
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="bordered"
                        color="primary"
                        className={`border-0 border-neutral-300 shadow-sm bg-neutral-100 ${metadata.recordsCount > 0 ? 'shrink-0' : 'flex-1'}`}
                        startContent={!isRefreshingThis && <DynamicIcon name="refresh-cw" className="w-4 h-4" />}
                        onPress={() => handleRefreshDirectory(type)}
                        isLoading={isRefreshingThis}
                        isDisabled={busy && !isRefreshingThis}
                        aria-label={`Оновити ${getName(type)}`}
                      >
                        Оновити
                      </Button>
                    </div>

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
          colorPicker={
            viewingDirectory.type === 'accPolicies'
              ? {
                  colorMap: accPolicyColorMap,
                  onChange: handleAccPolicyColorChange,
                  saving: savingColorMap,
                  previewTheme: 'light',
                  previewIntensity: 'soft',
                }
              : undefined
          }
        />
      )}
    </Card>
  );
};

export default DilovodCacheManager;
