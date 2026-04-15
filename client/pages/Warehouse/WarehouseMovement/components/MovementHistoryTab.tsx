import { useState, useEffect } from 'react';
import { Select, SelectItem, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { MonthSwitcher } from '../../../../components/MonthSwitcher';
import { MovementHistoryTable } from '../../shared/MovementHistoryTable';
import type { DatePreset } from '../useMovementHistory';
import type { GoodMovingDocument } from '@shared/types/movement';

// ---------------------------------------------------------------------------
// MovementHistoryTab — вміст вкладки "Історія переміщень"
// ---------------------------------------------------------------------------

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: '7d',    label: '7 днів'   },
  { key: '14d',   label: '14 днів'  },
  { key: '30d',   label: '30 днів'  },
  { key: 'month', label: 'По місяцях' },
];

interface MovementHistoryTabProps {
  documents: GoodMovingDocument[];
  loading: boolean;
  onRefresh: () => void;
  onLoadDetails?: (docId: string) => Promise<void>;
  onRefreshDetails?: (docId: string) => Promise<void>;
  detailsLoading?: Record<string, boolean>;
  onEditMovement?: (doc: GoodMovingDocument) => void;
  datePreset: DatePreset;
  selectedMonth: Date;
  onChangeDatePreset: (preset: DatePreset) => void;
  onChangeMonth: (month: Date) => void;
}

export const MovementHistoryTab = ({
  documents,
  loading,
  onRefresh,
  onLoadDetails,
  onRefreshDetails,
  detailsLoading = {},
  onEditMovement,
  datePreset,
  selectedMonth,
  onChangeDatePreset,
  onChangeMonth,
}: MovementHistoryTabProps) => {
  // Локальний стан для Select — ініціалізується з datePreset prop.
  // Синхронізуємо через useEffect щоб відображення завжди збігалось з хуком.
  const [selectValue, setSelectValue] = useState<DatePreset>(datePreset);

  useEffect(() => {
    setSelectValue(datePreset);
  }, [datePreset]);

  const handlePresetChange = (preset: DatePreset) => {
    setSelectValue(preset);
    onChangeDatePreset(preset);
  };

  return (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
    {/* Заголовок */}
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-semibold text-gray-800 pl-1">Історія переміщень</h2>
      
      {/* Пресети дат */}
      <div className="flex items-center gap-2">
        <Select
          aria-label="Діапазон дат"
          items={DATE_PRESETS}
          selectedKeys={[selectValue]}
          size="sm"
          className="min-w-[140px]"
          disallowEmptySelection={true}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as DatePreset;
            if (selected) handlePresetChange(selected);
          }}
        >
          {(preset) => <SelectItem key={preset.key}>{preset.label}</SelectItem>}
        </Select>

        {/* Перемикач місяців — з'являється лише при пресеті "По місяцях" */}
        {datePreset === 'month' && (
          <MonthSwitcher
            value={selectedMonth}
            onChange={onChangeMonth}
            disableFuture
            size="sm"
          />
        )}

        <Button
          size="sm"
          color="secondary"
          className="flex-shrink-0"
          onPress={onRefresh}
          startContent={<DynamicIcon name="refresh-cw" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
        >
          Оновити
        </Button>
      </div>
    </div>

    {loading ? (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="loader-2" className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
        <p className="text-sm">Завантаження...</p>
      </div>
    ) : documents.length === 0 ? (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="inbox" className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Немає документів переміщень</p>
        <Button size="sm" variant="flat" className="mt-3" onPress={onRefresh}>
          Завантажити
        </Button>
      </div>
    ) : (
      <MovementHistoryTable
        documents={documents}
        onLoadDetails={onLoadDetails}
        onRefreshDetails={onRefreshDetails}
        detailsLoading={detailsLoading}
        onEditMovement={onEditMovement}
      />
    )}
  </div>
  );
};
