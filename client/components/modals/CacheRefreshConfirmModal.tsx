import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
  DateRangePicker,
} from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { I18nProvider } from "@react-aria/i18n";
import { addToast } from "@heroui/react";
import type { DateRange } from "@react-types/datepicker";
import { createStandardDatePresets } from "../../lib/dateReportingUtils";

// ─── Утиліти ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50;
const PAUSE_MS = 500;

function formatEstimatedTime(totalOrders: number): string {
  const batches = Math.ceil(totalOrders / BATCH_SIZE);
  const totalSeconds = Math.ceil((batches * PAUSE_MS) / 1000);
  if (totalSeconds < 60) return `~${totalSeconds} сек`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `~${minutes} хв ${seconds} сек` : `~${minutes} хв`;
}

// ─── Модалка підтвердження "Оновити всі записи" ─────────────────────────────

interface CacheRefreshConfirmModalProps {
  isOpen: boolean;
  totalOrders: number | null;
  isLoadingStats: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CacheRefreshConfirmModal({
  isOpen,
  totalOrders,
  isLoadingStats,
  onConfirm,
  onCancel,
}: CacheRefreshConfirmModalProps) {
  const estimatedTime = totalOrders !== null ? formatEstimatedTime(totalOrders) : null;
  const batches = totalOrders !== null ? Math.ceil(totalOrders / BATCH_SIZE) : null;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="sm">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <DynamicIcon name="database" size={18} className="text-warning" />
          Оновити всі записи кешу
        </ModalHeader>
        <ModalBody>
          {isLoadingStats ? (
            <div className="flex items-center justify-center py-6 gap-3">
              <Spinner size="sm" color="primary" />
              <span className="text-sm text-gray-500">Отримання статистики...</span>
            </div>
          ) : totalOrders !== null ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Буде примусово оновлено кеш для всіх замовлень за останній рік.
              </p>
              <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-1.5">
                    <DynamicIcon name="shopping-cart" size={14} className="text-warning-600" />
                    Замовлень до обробки
                  </span>
                  <span className="font-semibold text-gray-800">
                    {totalOrders.toLocaleString("uk-UA")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-1.5">
                    <DynamicIcon name="layers" size={14} className="text-warning-600" />
                    Пачок ({BATCH_SIZE} замовлень)
                  </span>
                  <span className="font-semibold text-gray-800">{batches}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-1.5">
                    <DynamicIcon name="clock" size={14} className="text-warning-600" />
                    Приблизний час
                  </span>
                  <span className="font-semibold text-warning-700">{estimatedTime}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Сервер продовжить працювати в штатному режимі під час оновлення.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-2">
              Не вдалося отримати статистику. Продовжити оновлення?
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" size="sm" onPress={onCancel}>
            Скасувати
          </Button>
          <Button
            color="warning"
            size="sm"
            isDisabled={isLoadingStats}
            onPress={onConfirm}
          >
            <DynamicIcon name="refresh-cw" size={14} />
            Оновити
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Модалка вибору "За період" ──────────────────────────────────────────────

const PERIOD_PRESETS = [
  { key: "today",     label: "Сьогодні" },
  { key: "yesterday", label: "Вчора" },
  { key: "last7Days", label: "7 днів" },
  { key: "last14Days",label: "14 днів" },
  { key: "last30Days",label: "30 днів" },
  { key: "thisWeek",  label: "Цей тиждень" },
  { key: "thisMonth", label: "Цей місяць" },
  { key: "lastMonth", label: "Минулий місяць" },
] as const;

interface CachePeriodSelectModalProps {
  isOpen: boolean;
  cacheLoading: boolean;
  onConfirm: (range: DateRange) => void;
  onCancel: () => void;
}

export function CachePeriodSelectModal({
  isOpen,
  cacheLoading,
  onConfirm,
  onCancel,
}: CachePeriodSelectModalProps) {
  const datePresets = createStandardDatePresets();
  const [range, setRange] = useState<DateRange | null>(null);
  const [presetKey, setPresetKey] = useState<string | null>(null);

  const handleClose = () => {
    setRange(null);
    setPresetKey(null);
    onCancel();
  };

  const handleConfirm = () => {
    if (!range?.start || !range?.end) {
      addToast({
        title: "Помилка",
        description: "Будь ласка, оберіть період для оновлення кеша.",
        color: "warning",
        timeout: 5000,
      });
      return;
    }
    const saved = range;
    setRange(null);
    setPresetKey(null);
    onConfirm(saved);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <ModalContent>
        <ModalHeader>
          <h3 className="text-lg font-semibold">Обрати період для оновлення кеша</h3>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Оберіть готовий пресет або вкажіть власний діапазон дат
            </p>
            <div className="flex flex-wrap gap-2">
              {PERIOD_PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  size="sm"
                  variant={presetKey === preset.key ? "solid" : "flat"}
                  color={presetKey === preset.key ? "primary" : "default"}
                  onPress={() => {
                    const found = datePresets.find((p) => p.key === preset.key);
                    if (found) {
                      setRange(found.getRange());
                      setPresetKey(preset.key);
                    }
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <I18nProvider locale="uk-UA">
              <DateRangePicker
                label="Або власний діапазон"
                value={range}
                onChange={(val) => {
                  setRange(val);
                  setPresetKey(null);
                }}
                variant="bordered"
                size="sm"
                className="w-full"
              />
            </I18nProvider>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" size="sm" onPress={handleClose}>
            Скасувати
          </Button>
          <Button
            color="primary"
            size="sm"
            isDisabled={cacheLoading || !range?.start || !range?.end}
            isLoading={cacheLoading}
            onPress={handleConfirm}
          >
            {cacheLoading ? "Оновлення..." : "Оновити кеш"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Хук для управління станом обох модалок ──────────────────────────────────

interface UseCacheRefreshModalsOptions {
  apiCall: (url: string, options?: RequestInit) => Promise<Response>;
  /** Викликається при підтвердженні повного оновлення */
  onRefreshAll: () => void;
  /** Викликається при підтвердженні оновлення за обраним діапазоном */
  onRefreshPeriod: (range: DateRange) => void;
}

export function useCacheRefreshModals({
  apiCall,
  onRefreshAll,
  onRefreshPeriod,
}: UseCacheRefreshModalsOptions) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [totalOrders, setTotalOrders] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);

  const openRefreshAll = async () => {
    setTotalOrders(null);
    setIsConfirmOpen(true);
    setIsLoadingStats(true);
    try {
      const response = await apiCall("/api/orders/cache/stats");
      if (response.ok) {
        const data = await response.json();
        if (data.success) setTotalOrders(data.stats.totalOrders ?? null);
      }
    } catch {
      // показуємо модалку навіть без статистики
    } finally {
      setIsLoadingStats(false);
    }
  };

  const openRefreshPeriod = () => setIsPeriodOpen(true);

  const confirmRefreshAll = () => {
    setIsConfirmOpen(false);
    setTotalOrders(null);
    onRefreshAll();
  };

  const cancelRefreshAll = () => {
    setIsConfirmOpen(false);
    setTotalOrders(null);
  };

  const confirmRefreshPeriod = (range: DateRange) => {
    setIsPeriodOpen(false);
    onRefreshPeriod(range);
  };

  const cancelRefreshPeriod = () => setIsPeriodOpen(false);

  return {
    // Хендлери для Dropdown
    openRefreshAll,
    openRefreshPeriod,
    // Пропси для компонентів
    confirmModalProps: {
      isOpen: isConfirmOpen,
      totalOrders,
      isLoadingStats,
      onConfirm: confirmRefreshAll,
      onCancel: cancelRefreshAll,
    } satisfies CacheRefreshConfirmModalProps,
    periodModalProps: {
      isOpen: isPeriodOpen,
      onConfirm: confirmRefreshPeriod,
      onCancel: cancelRefreshPeriod,
    } as Omit<CachePeriodSelectModalProps, "cacheLoading">,
  };
}
