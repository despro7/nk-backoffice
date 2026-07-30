import { Button, ButtonGroup, Input, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface CatalogToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCount: number;
  refreshing?: boolean;
  onRefresh: () => void;
  onCreateGood: () => void;
  onCreateFolder: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onOpenTrash: () => void;
  busy?: boolean;
}

export function CatalogToolbar({
  searchQuery,
  onSearchChange,
  selectedCount,
  refreshing,
  onRefresh,
  onCreateGood,
  onCreateFolder,
  onDuplicate,
  onArchive,
  onTrash,
  onOpenTrash,
  busy,
}: CatalogToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Пошук у каталозі"
        placeholder="Пошук за назвою або SKU…"
        value={searchQuery}
        onValueChange={onSearchChange}
        startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
        isClearable
        className="max-w-sm"
        size="sm"
      />

      <ButtonGroup size="sm" variant="flat">
        <Button
          startContent={<DynamicIcon name="plus" size={14} />}
          onPress={onCreateGood}
          isDisabled={busy}
        >
          Товар
        </Button>
        <Button
          startContent={<DynamicIcon name="folder-plus" size={14} />}
          onPress={onCreateFolder}
          isDisabled={busy}
        >
          Папка
        </Button>
      </ButtonGroup>

      <Button
        size="sm"
        variant="flat"
        startContent={<DynamicIcon name="refresh-cw" size={14} className={refreshing ? 'animate-spin' : ''} />}
        onPress={onRefresh}
        isDisabled={busy || refreshing}
      >
        Refresh Dilovod
      </Button>

      <Tooltip content="Смітник Dilovod">
        <Button
          size="sm"
          variant="flat"
          isIconOnly
          aria-label="Смітник"
          onPress={onOpenTrash}
        >
          <DynamicIcon name="trash-2" size={16} />
        </Button>
      </Tooltip>

      {hasSelection && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-default-500">Обрано: {selectedCount}</span>
          <Button
            size="sm"
            variant="flat"
            startContent={<DynamicIcon name="copy" size={14} />}
            onPress={onDuplicate}
            isDisabled={busy || selectedCount !== 1}
          >
            Дублювати
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="warning"
            startContent={<DynamicIcon name="archive" size={14} />}
            onPress={onArchive}
            isDisabled={busy}
          >
            В архів
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            startContent={<DynamicIcon name="trash" size={14} />}
            onPress={onTrash}
            isDisabled={busy}
          >
            У смітник
          </Button>
        </div>
      )}
    </div>
  );
}
