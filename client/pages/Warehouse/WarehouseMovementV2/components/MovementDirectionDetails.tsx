import { Card, Select, SelectItem, Tooltip } from '@heroui/react';
import { DateTimePicker } from '@/components/DateTimePicker';
import { useDebug } from '@/contexts/debug-context';
import { StockBadge, type StockBadgeVariant } from '@/components/StockBadge';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState } from 'react';
import { resolveShortStorageBadge } from '../../WarehouseMovementMob/WarehouseMovementMobUtils';

export interface MovementDirectionStorage {
  id: string;
  name?: string;
  code?: string;
}

interface Props {
  storages: MovementDirectionStorage[];
  storage: string;
  storageTo: string;
  onStorageChange: (v: string) => void;
  onStorageToChange: (v: string) => void;
  movementDateTime: Date;
  onMovementDateTimeChange: (date: Date) => void;
  isDisabled?: boolean;
  showSectionTitle?: boolean;
  compactSpacing?: boolean;
}

export default function MovementDirectionDetails({
  storages,
  storage,
  storageTo,
  onStorageChange,
  onStorageToChange,
  movementDateTime,
  onMovementDateTimeChange,
  isDisabled = false,
  showSectionTitle = true,
  compactSpacing = false,
}: Props) {
  const { isDebugMode } = useDebug();
  const [isHovered, setIsHovered] = useState(false);

  const handleSwap = () => {
    if (isDisabled) return;
    onStorageChange(storageTo);
    onStorageToChange(storage);
  };

  const storageSelectedKey =
    storage && storages.some((s) => String(s.id) === String(storage)) ? String(storage) : '';
  const storageToSelectedKey =
    storageTo && storages.some((s) => String(s.id) === String(storageTo)) ? String(storageTo) : '';

  const stockBadgeVariant = (storageId: string): StockBadgeVariant | null => {
    const badge = resolveShortStorageBadge(storageId, undefined);
    if (badge === 'ГП') return 'gp';
    if (badge === 'МС') return 'ms';
    return null;
  };

  const renderLabel = (s: MovementDirectionStorage) => {
    const variant = stockBadgeVariant(String(s.id));
    return (
      <span className="flex items-center gap-1.5">
        <span>{s.name || s.id}</span>
        {variant ? <StockBadge variant={variant} size="10px" className="leading-tight ml-0.5 shrink-0" /> : null}
        {isDebugMode && (
          <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-xs">{String(s.id)}</span>
        )}
      </span>
    );
  };

  return (
    <>
      {showSectionTitle ? (
        <div className="text-base font-semibold text-gray-700 mt-1 mb-2">Параметри переміщення</div>
      ) : null}
      <Card className={`bg-white mb-6 ${compactSpacing ? 'p-2 rounded-lg overflow-visible' : 'p-4 rounded-xl'} ${showSectionTitle ? '' : 'mt-0'}`} shadow="sm">
        <div className="flex flex-wrap md:flex-nowrap gap-4 items-end">
          <Select
            label="Зі складу"
            labelPlacement="outside"
            value={storage}
            isDisabled={isDisabled}
            disallowEmptySelection
            onChange={(e) => onStorageChange(e.target.value || '')}
            selectedKeys={storageSelectedKey ? [storageSelectedKey] : []}
            renderValue={() => {
              const sel = storages.find((s) => String(s.id) === String(storage));
              return sel ? renderLabel(sel) : '';
            }}
            classNames={{ base: 'w-full min-w-[140px]', label: 'text-xs font-medium text-gray-500!', trigger: 'w-full border border-gray-200 bg-white' }}
          >
            {(storages.map((s) => (
              <SelectItem
                key={String(s.id)}
                textValue={s.name || String(s.id)}
                isDisabled={String(s.id) === String(storageTo)}
              >
                {renderLabel(s)}
              </SelectItem>
            )) ) as unknown as React.ReactElement[]}
          </Select>

          <button
            type="button"
            aria-label="Поміняти напрямок переміщення"
            title="Поміняти склади місцями"
            disabled={isDisabled}
            onClick={handleSwap}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="shrink-0 flex items-center justify-center w-9 h-9 mb-0.5 rounded-lg text-gray-400 hover:text-primary bg-primary/5 hover:bg-primary/10 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <DynamicIcon name={isHovered ? 'repeat' : 'arrow-right'} size={20} />
          </button>

          <Select
            label="На склад"
            labelPlacement="outside"
            value={storageTo}
            isDisabled={isDisabled}
            disallowEmptySelection
            onChange={(e) => onStorageToChange(e.target.value || '')}
            selectedKeys={storageToSelectedKey ? [storageToSelectedKey] : []}
            renderValue={() => {
              const sel = storages.find((s) => String(s.id) === String(storageTo));
              return sel ? renderLabel(sel) : '';
            }}
            classNames={{ base: 'w-full min-w-[140px]', label: 'text-xs font-medium text-gray-500!', trigger: 'w-full border border-gray-200 bg-white' }}
          >
            {(storages.map((s) => (
              <SelectItem
                key={String(s.id)}
                textValue={s.name || String(s.id)}
                isDisabled={String(s.id) === String(storage)}
              >
                {renderLabel(s)}
              </SelectItem>
            )) ) as unknown as React.ReactElement[]}
          </Select>

          <DateTimePicker
            value={movementDateTime}
            onChange={(value) => {
              if (value) onMovementDateTimeChange(value);
            }}
            labelPlacement="outside"
            label={(
              <span className="flex gap-1 items-center">
                Дата і час переміщення
                <Tooltip
                  content="Обрана дата впливає на залишки партій та документ переміщення в Діловоді"
                  color="primary"
                  className="max-w-80"
                >
                  <DynamicIcon name="info" size={14} className="text-red-500" />
                </Tooltip>
              </span>
            )}
            size="md"
            labelStyle="text-xs font-medium text-gray-500"
            inputStyle="border border-gray-200 bg-white hover:bg-gray-100 focus-within:bg-gray-100"
            isDisabled={isDisabled}
          />
        </div>
      </Card>
    </>
  );
}
