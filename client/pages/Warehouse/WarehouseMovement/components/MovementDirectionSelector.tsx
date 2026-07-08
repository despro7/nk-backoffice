import { Card, Select, SelectItem } from '@heroui/react';
import { useDebug } from '@/contexts/DebugContext';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// MovementDirectionSelector — вибір напрямку переміщення між складами
//
// Два селекти: «Зі складу» (storage) та «На склад» (storageTo).
// Обраний у одному селекті склад стає недоступним у іншому (взаємне виключення),
// щоб уникнути переміщення складу «сам у себе».
// ---------------------------------------------------------------------------

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
  isDisabled?: boolean;
}

export default function MovementDirectionSelector({
  storages,
  storage,
  storageTo,
  onStorageChange,
  onStorageToChange,
  isDisabled = false,
}: Props) {
  const { isDebugMode } = useDebug();
  const [isHovered, setIsHovered] = useState(false);

  // Обмін напрямком: склад-донор стає складом-реципієнтом і навпаки
  const handleSwap = () => {
    if (isDisabled) return;
    onStorageChange(storageTo);
    onStorageToChange(storage);
  };

  const storageSelectedKey =
    storage && storages.some((s) => String(s.id) === String(storage)) ? String(storage) : '';
  const storageToSelectedKey =
    storageTo && storages.some((s) => String(s.id) === String(storageTo)) ? String(storageTo) : '';

  const renderLabel = (s: MovementDirectionStorage) => (
    <>
      {s.name || s.id}
      {isDebugMode && (
        <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-xs ml-2">{String(s.id)}</span>
      )}
    </>
  );

  return (
    <Card className="rounded-xl bg-white mb-6 p-4">
      <h2 className="font-semibold mb-2 text-lg">Напрямок переміщення</h2>
      <div className="flex gap-4 items-end">
        <Select
          label="Зі складу"
          labelPlacement="outside"
          value={storage}
          isDisabled={isDisabled}
          disallowEmptySelection={true}
          onChange={(e: any) => onStorageChange(e.target.value || '')}
          selectedKeys={storageSelectedKey ? [storageSelectedKey] : []}
          renderValue={() => {
            const sel = storages.find((s) => String(s.id) === String(storage));
            return sel ? renderLabel(sel) : '';
          }}
          classNames={{ base: 'w-full', label: 'text-xs font-medium text-gray-500!', trigger: 'w-full border border-gray-200 bg-white' }}
        >
          {(storages.map((s) => (
            <SelectItem
              key={String(s.id)}
              textValue={s.name || String(s.id)}
              isDisabled={String(s.id) === String(storageTo)}
            >
              {renderLabel(s)}
            </SelectItem>
          )) ) as any}
        </Select>

        <button
          type="button"
          aria-label="Поміняти напрямок переміщення"
          title="Поміняти склади місцями"
          disabled={isDisabled}
          onClick={handleSwap}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-primary bg-primary/5 hover:bg-primary/10 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <DynamicIcon name={isHovered ? 'repeat' : 'arrow-right'} size={20} />
        </button>

        <Select
          label="На склад"
          labelPlacement="outside"
          value={storageTo}
          isDisabled={isDisabled}
          disallowEmptySelection={true}
          onChange={(e: any) => onStorageToChange(e.target.value || '')}
          selectedKeys={storageToSelectedKey ? [storageToSelectedKey] : []}
          renderValue={() => {
            const sel = storages.find((s) => String(s.id) === String(storageTo));
            return sel ? renderLabel(sel) : '';
          }}
          classNames={{ base: 'w-full', label: 'text-xs font-medium text-gray-500!', trigger: 'w-full border border-gray-200 bg-white' }}
        >
          {(storages.map((s) => (
            <SelectItem
              key={String(s.id)}
              textValue={s.name || String(s.id)}
              isDisabled={String(s.id) === String(storage)}
            >
              {renderLabel(s)}
            </SelectItem>
          )) ) as any}
        </Select>
      </div>
    </Card>
  );
}
