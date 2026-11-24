import { useEffect, useState } from 'react';
import { Button, Card, CardBody, CardHeader, NumberInput } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import {
  INVENTORY_HISTORY_CACHE_DEFAULTS,
  INVENTORY_HISTORY_CACHE_LIMITS,
  normalizeInventoryHistoryCacheSettings,
  type InventoryHistoryCacheSettings as Settings,
} from '@shared/types/inventoryHistoryCache';

const API = '/api/settings/inventory-history-cache';

/** TTL кешу денних рухів, з яких будується історія товару в інвентаризації. */
export const InventoryHistoryCacheSettings = () => {
  const [settings, setSettings] = useState<Settings>(INVENTORY_HISTORY_CACHE_DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(API, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.success) setSettings(normalizeInventoryHistoryCacheSettings(json.data));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(API, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSettings(normalizeInventoryHistoryCacheSettings(json.data));
      ToastService.show({ title: 'Налаштування кешу збережено', color: 'success' });
    } catch (error) {
      ToastService.show({
        title: 'Не вдалося зберегти налаштування кешу',
        description: error instanceof Error ? error.message : undefined,
        color: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    try {
      const res = await fetch(`${API}/clear`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ToastService.show({ title: 'Кеш історії очищено', color: 'success' });
    } catch (error) {
      ToastService.show({
        title: 'Не вдалося очистити кеш',
        description: error instanceof Error ? error.message : undefined,
        color: 'danger',
      });
    } finally {
      setIsClearing(false);
    }
  };

  const setField = (key: keyof Settings) => (value: number) => {
    if (!Number.isFinite(value)) return;
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Card>
      <CardHeader className="border-b px-5">
        <div>
          <h3 className="font-semibold text-default-900">Кеш історії товару в інвентаризації</h3>
          <p className="text-xs text-default-500 mt-1">
            Рухи за день (відвантаження, комплектації, переміщення, повернення, списання) рахуються один раз
            і використовуються для всіх товарів. 0 – не кешувати.
          </p>
        </div>
      </CardHeader>
      <CardBody className="p-5 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <NumberInput
              value={settings.recentDayTtlMinutes}
              onValueChange={setField('recentDayTtlMinutes')}
              minValue={INVENTORY_HISTORY_CACHE_LIMITS.recentDayTtlMinutes.min}
              maxValue={INVENTORY_HISTORY_CACHE_LIMITS.recentDayTtlMinutes.max}
              step={1}
              labelPlacement="outside"
              label="Сьогодні й вчора (хв)"
              className="w-full"
            />
            <p className="text-xs text-default-500">Документи цих днів ще проводяться, тому строк короткий</p>
          </div>
          <div className="space-y-2">
            <NumberInput
              value={settings.pastDayTtlMinutes}
              onValueChange={setField('pastDayTtlMinutes')}
              minValue={INVENTORY_HISTORY_CACHE_LIMITS.pastDayTtlMinutes.min}
              maxValue={INVENTORY_HISTORY_CACHE_LIMITS.pastDayTtlMinutes.max}
              step={1}
              labelPlacement="outside"
              label="Старіші дні (хв)"
              className="w-full"
            />
            <p className="text-xs text-default-500">Минулі дні змінюються рідко, тому строк довший</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            color="primary"
            onPress={handleSave}
            isDisabled={isSaving}
            startContent={<DynamicIcon name={isSaving ? 'loader-2' : 'save'} className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />}
          >
            Зберегти
          </Button>
          <Button
            variant="flat"
            color="primary"
            data-btn-tone="primary-blue-flat"
            onPress={handleClear}
            isDisabled={isClearing}
            startContent={<DynamicIcon name={isClearing ? 'loader-2' : 'eraser'} className={`w-4 h-4 ${isClearing ? 'animate-spin' : ''}`} />}
          >
            Очистити кеш зараз
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default InventoryHistoryCacheSettings;
