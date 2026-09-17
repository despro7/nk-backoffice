import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  type SortDescriptor,
} from '@heroui/react';
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
  users: CacheMetadata;
  goods: CacheMetadata;
}

const CACHE_TYPE_ORDER: Array<keyof CacheStatus> = [
  'firms', 'accounts', 'storages', 'paymentForms', 'settlementsKinds', 'cashItems', 'ledgerAccounts', 'tradeChanels', 'deliveryMethods',
  'units', 'priceTypes', 'currency', 'accPolicies', 'users', 'goods',
];

type CacheSortColumn = 'name' | 'status' | 'recordsCount' | 'lastUpdate';

type CacheTableRow = {
  type: keyof CacheStatus;
  metadata: CacheMetadata;
};

const DEFAULT_CACHE_SORT: SortDescriptor = {
  column: 'name',
  direction: 'ascending',
};

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
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>(DEFAULT_CACHE_SORT);

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
          users: 'users',
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
          users: 'users',
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
      case 'users':
        return 'users';
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
      case 'users':
        return 'Користувачі';
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

  const sortedCacheRows = useMemo((): CacheTableRow[] => {
    if (!cacheStatus) return [];

    const rows: CacheTableRow[] = CACHE_TYPE_ORDER
      .filter((type) => cacheStatus[type])
      .map((type) => ({ type, metadata: cacheStatus[type] }));

    const column = String(sortDescriptor.column ?? 'name') as CacheSortColumn;
    const dir = sortDescriptor.direction === 'descending' ? -1 : 1;

    return [...rows].sort((left, right) => {
      let cmp = 0;

      switch (column) {
        case 'name':
          cmp = getName(left.type).localeCompare(getName(right.type), 'uk');
          break;
        case 'status':
          cmp = Number(left.metadata.isValid) - Number(right.metadata.isValid);
          break;
        case 'recordsCount':
          cmp = left.metadata.recordsCount - right.metadata.recordsCount;
          break;
        case 'lastUpdate': {
          const leftTime = left.metadata.lastUpdate ? new Date(left.metadata.lastUpdate).getTime() : 0;
          const rightTime = right.metadata.lastUpdate ? new Date(right.metadata.lastUpdate).getTime() : 0;
          if (leftTime === 0 && rightTime === 0) cmp = 0;
          else if (leftTime === 0) cmp = 1;
          else if (rightTime === 0) cmp = -1;
          else cmp = leftTime - rightTime;
          break;
        }
        default:
          cmp = CACHE_TYPE_ORDER.indexOf(left.type) - CACHE_TYPE_ORDER.indexOf(right.type);
      }

      if (cmp !== 0) return cmp * dir;
      return CACHE_TYPE_ORDER.indexOf(left.type) - CACHE_TYPE_ORDER.indexOf(right.type);
    });
  }, [cacheStatus, sortDescriptor]);

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
      case 'users':
        return [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Імʼя' },
          { key: 'code', label: 'Email' }
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
      <CardBody className="p-6">
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <DynamicIcon name="loader-2" className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : cacheStatus ? (
          <div className="space-y-4">
            <p className="text-sm text-default-500">
              Кеш оновлюється автоматично раз на добу. Ви можете оновити вручну за потреби.
            </p>

            <Table
              aria-label="Кеш довідників Dilovod"
              removeWrapper
              sortDescriptor={sortDescriptor}
              onSortChange={setSortDescriptor}
              classNames={{
                th: 'first:rounded-l-md last:rounded-e-md',
              }}
            >
              <TableHeader>
                <TableColumn key="name" allowsSorting>Довідник</TableColumn>
                <TableColumn key="status" allowsSorting width={128}>Статус</TableColumn>
                <TableColumn key="recordsCount" allowsSorting width={96} align="end">Записів</TableColumn>
                <TableColumn key="lastUpdate" allowsSorting width={160}>Оновлено</TableColumn>
                <TableColumn key="actions" width={208} align="end">Дії</TableColumn>
              </TableHeader>
              <TableBody emptyContent="Немає довідників у кеші">
                {sortedCacheRows.map(({ type, metadata }) => {
                  const isRefreshingThis =
                    refreshingType === type || (type === 'goods' && updatingGoodsCache);
                  const busy = loading || refreshing || updatingGoodsCache || refreshingType !== null;

                  return (
                    <TableRow
                      key={type}
                      className="hover:bg-gray-100/60 transition-colors duration-50"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DynamicIcon name={getIcon(type)} className="w-4 h-4 text-primary shrink-0" />
                          <span className="font-medium text-sm">{getName(type)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip size="sm" color={metadata.isValid ? 'success' : 'warning'} variant="flat">
                          {metadata.isValid ? 'Актуальний' : 'Застарів'}
                        </Chip>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {metadata.recordsCount}
                      </TableCell>
                      <TableCell className="text-default-500 whitespace-nowrap">
                        {formatRelativeDate(metadata.lastUpdate)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {metadata.recordsCount > 0 && (
                            <Button
                              size="sm"
                              variant="bordered"
                              color="primary"
                              className="border-0 border-neutral-300 shadow-sm bg-neutral-100"
                              startContent={<DynamicIcon name="eye" className="w-4 h-4" />}
                              onPress={() => viewDirectory(type)}
                              isDisabled={busy}
                            >
                              Переглянути
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="bordered"
                            color="primary"
                            className="border-0 border-neutral-300 shadow-sm bg-neutral-100"
                            startContent={!isRefreshingThis && <DynamicIcon name="refresh-cw" className="w-4 h-4" />}
                            onPress={() => handleRefreshDirectory(type)}
                            isLoading={isRefreshingThis}
                            isDisabled={busy && !isRefreshingThis}
                            aria-label={`Оновити ${getName(type)}`}
                          >
                            Оновити
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
