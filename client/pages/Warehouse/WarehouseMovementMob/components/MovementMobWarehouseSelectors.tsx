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

export default function MovementMobWarehouseSelectors({
  storages,
  sourceId,
  destId,
  onSourceChange,
  onDestChange,
  onSwap,
  readOnly = false,
}: MovementMobWarehouseSelectorsProps) {
  return (
    <div className="flex items-end gap-2">
      <Select
        label="зі складу"
        labelPlacement="outside"
        selectedKeys={sourceId != null ? [String(sourceId)] : []}
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
        {storages.map((storage) => (
          <SelectItem key={storage.id} textValue={storage.name}>
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
        selectedKeys={destId != null ? [String(destId)] : []}
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
        {storages.map((storage) => (
          <SelectItem key={storage.id} textValue={storage.name}>
            {storage.name}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}
