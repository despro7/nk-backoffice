import { Select, SelectItem, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

export interface MovementMobStorageOption {
  id: string;
  name: string;
}

interface MovementMobWarehouseSelectorsProps {
  storages: MovementMobStorageOption[];
  sourceId: string;
  destId: string;
  onSourceChange: (id: string) => void;
  onDestChange: (id: string) => void;
  onSwap: () => void;
  readOnly?: boolean;
}

function optionsWithSelected(
  storages: MovementMobStorageOption[],
  selectedId: string,
): MovementMobStorageOption[] {
  if (!selectedId) return storages;
  if (storages.some((storage) => String(storage.id) === String(selectedId))) return storages;
  return [{ id: selectedId, name: selectedId }, ...storages];
}

export default function MovementMobWarehouseSelectors({
  storages,
  sourceId,
  destId,
  onSourceChange,
  onDestChange,
  onSwap,
  readOnly = false,
}: MovementMobWarehouseSelectorsProps) {
  const sourceOptions = optionsWithSelected(storages, sourceId);
  const destOptions = optionsWithSelected(storages, destId);
  const sourceKeys = sourceId ? [String(sourceId)] : [];
  const destKeys = destId ? [String(destId)] : [];

  return (
    <div className="flex items-end gap-2">
      <Select
        label="зі складу"
        labelPlacement="outside"
        selectedKeys={sourceKeys}
        onSelectionChange={(keys) => {
          if (readOnly || keys == null) return;
          const selected = Array.from(keys)[0];
          if (selected != null) {
            onSourceChange(String(selected));
          }
        }}
        isDisabled={readOnly}
        disabledKeys={storages
          .filter((storage) => String(storage.id) === String(destId))
          .map((storage) => String(storage.id))
        }
        size="sm"
        disallowEmptySelection={true}
        classNames={{
          base: 'flex-1 min-w-0',
          label: 'text-default-400! ml-2!',
        }}
        popoverProps={{
          offset: 10,
          classNames: {
            base: 'min-w-64',
            content: 'px-1'
          },
        }}
      >
        {sourceOptions.map((storage) => (
          <SelectItem key={String(storage.id)} textValue={storage.name}>
            {storage.name}
          </SelectItem>
        ))}
      </Select>

      <Button
        isIconOnly
        radius="full"
        size="md"
        color="primary"
        className="-mb-1 shrink-0 bg-blue-500 text-white"
        aria-label="Поміняти склади місцями"
        onPress={onSwap}
        isDisabled={readOnly}
      >
        <DynamicIcon name="arrow-left-right" size={24} />
      </Button>

      <Select
        label="на склад"
        labelPlacement="outside"
        selectedKeys={destKeys}
        onSelectionChange={(keys) => {
          if (readOnly || keys == null) return;
          const selected = Array.from(keys)[0];
          if (selected != null) {
            onDestChange(String(selected));
          }
        }}
        isDisabled={readOnly}
        disabledKeys={storages
          .filter((storage) => String(storage.id) === String(sourceId))
          .map((storage) => String(storage.id))
        }
        size="sm"
        disallowEmptySelection={true}
        classNames={{
          base: 'flex-1 min-w-0',
          label: 'text-default-400! ml-2!',
        }}
        popoverProps={{
          offset: 10,
          crossOffset: -100,
          classNames: {
            base: 'min-w-64',
            content: 'px-1'
          },
        }}
      >
        {destOptions.map((storage) => (
          <SelectItem key={String(storage.id)} textValue={storage.name}>
            {storage.name}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}
