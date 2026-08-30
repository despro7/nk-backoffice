import { Button, ButtonGroup, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface MovementMobAddMoreButtonProps {
  onAdd: () => void;
  onManualBarcode: () => void;
  fullWidth?: boolean;
  label?: string;
}

export default function MovementMobAddMoreButton({
  onAdd,
  onManualBarcode,
  fullWidth = true,
  label = 'Додати ще',
}: MovementMobAddMoreButtonProps) {
  return (
    <ButtonGroup
      variant="flat"
      className={fullWidth ? 'w-full min-w-0 flex-1 rounded-lg shadow-button-primary' : undefined}
    >
      <Button
        fullWidth={fullWidth}
        size="lg"
        className="gap-2 bg-gradient-to-b from-neutral-600 to-neutral-700 text-white h-12 font-medium min-w-0"
        startContent={<DynamicIcon name="package-plus" size={18} strokeWidth={1.5} className="shrink-0" />}
        onPress={onAdd}
      >
        {label}
      </Button>
      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Button
            isIconOnly
            size="lg"
            aria-label="Додаткові дії"
            className="bg-gradient-to-b from-neutral-600 to-neutral-700 text-white h-12 min-w-11"
          >
            <DynamicIcon name="chevron-down" size={18} strokeWidth={2} />
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Додати товар"
          onAction={(key) => {
            if (key === 'manual') onManualBarcode();
          }}
        >
          <DropdownItem
            key="manual"
            startContent={<DynamicIcon name="keyboard" size={16} strokeWidth={1.75} />}
          >
            Ввести ШК вручну
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </ButtonGroup>
  );
}
