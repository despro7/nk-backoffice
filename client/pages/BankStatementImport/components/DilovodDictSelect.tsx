import { useMemo } from 'react';
import { Select, SelectItem } from '@heroui/react';
import {
  findDilovodItemLabel,
  getDilovodItemLabel,
  type DilovodDictItem,
} from '@shared/utils/directoryUtils';

export interface DilovodDictSelectProps {
  dictItems: DilovodDictItem[];
  selectedKey: string;
  onChange: (key: string) => void;
  'aria-label'?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  variant?: 'flat' | 'bordered' | 'faded' | 'underlined';
  isClearable?: boolean;
  showParent?: boolean;
}

/**
 * HeroUI Select для коротких довідників Dilovod (статті руху тощо).
 * Відкривається лише по кліку на тригер, не по фокусу сусідніх полів.
 */
export function DilovodDictSelect({
  dictItems,
  selectedKey,
  onChange,
  'aria-label': ariaLabel,
  label,
  placeholder,
  className,
  variant = 'flat',
  isClearable = false,
  showParent = false,
}: DilovodDictSelectProps) {
  const items = useMemo(() => {
    const sorted = [...dictItems].sort((a, b) =>
      getDilovodItemLabel(a).localeCompare(getDilovodItemLabel(b), 'uk', { sensitivity: 'base' }),
    );
    if (selectedKey && !sorted.some((item) => String(item.id) === selectedKey)) {
      return [{ id: selectedKey, name: selectedKey }, ...sorted];
    }
    return sorted;
  }, [dictItems, selectedKey]);

  return (
    <Select
      className={className}
      size="sm"
      variant={variant}
      label={label}
      placeholder={placeholder || findDilovodItemLabel(selectedKey, dictItems) || undefined}
      aria-label={ariaLabel ?? label}
      selectedKeys={selectedKey ? [selectedKey] : []}
      isClearable={isClearable}
      items={items}
      onSelectionChange={(keys) => {
        if (keys === 'all') return;
        const key = Array.from(keys)[0];
        onChange(key == null ? '' : String(key));
      }}
      classNames={{
        trigger: 'h-8 min-h-8',
        popoverContent: 'min-w-[240px]',
      }}
      popoverProps={{
        shouldCloseOnInteractOutside: () => true,
      }}
    >
      {(item) => (
        <SelectItem key={String(item.id)} textValue={getDilovodItemLabel(item)}>
          {showParent ? (
            <>
              <span>{getDilovodItemLabel(item)}</span>
              {item.parent__pr ? (
                <span className="block text-xs text-default-400">{item.parent__pr}</span>
              ) : null}
            </>
          ) : (
            getDilovodItemLabel(item)
          )}
        </SelectItem>
      )}
    </Select>
  );
}
