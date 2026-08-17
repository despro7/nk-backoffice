import { Autocomplete, AutocompleteItem, Button } from '@heroui/react';
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
      <Autocomplete
        label="Зі складу"
        labelPlacement="outside"
        selectedKey={sourceId || null}
        onSelectionChange={(key) => {
          if (readOnly || key == null) return;
          onSourceChange(String(key));
        }}
        isDisabled={readOnly}
        size="sm"
        className="flex-1 min-w-0"
        inputProps={{
          classNames: {
            inputWrapper: 'bg-white h-10',
          },
        }}
      >
        {storages.map((storage) => (
          <AutocompleteItem key={storage.id} textValue={storage.name}>
            {storage.name}
          </AutocompleteItem>
        ))}
      </Autocomplete>

      <Button
        isIconOnly
        radius="full"
        color="primary"
        size="sm"
        className="mb-0.5 shrink-0"
        aria-label="Поміняти склади місцями"
        onPress={onSwap}
        isDisabled={readOnly}
      >
        <DynamicIcon name="arrow-left-right" size={16} />
      </Button>

      <Autocomplete
        label="На склад"
        labelPlacement="outside"
        selectedKey={destId || null}
        onSelectionChange={(key) => {
          if (readOnly || key == null) return;
          onDestChange(String(key));
        }}
        isDisabled={readOnly}
        size="sm"
        className="flex-1 min-w-0"
        inputProps={{
          classNames: {
            inputWrapper: 'bg-white h-10',
          },
        }}
      >
        {storages.map((storage) => (
          <AutocompleteItem key={storage.id} textValue={storage.name}>
            {storage.name}
          </AutocompleteItem>
        ))}
      </Autocomplete>
    </div>
  );
}
