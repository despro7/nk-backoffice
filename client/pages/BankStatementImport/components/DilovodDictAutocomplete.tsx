import { useCallback, useMemo, type Key } from 'react';
import { Autocomplete, AutocompleteItem } from '@heroui/react';
import {
  getDilovodItemLabel,
  type DilovodDictItem,
} from '@shared/utils/directoryUtils';

const LISTBOX_PROPS = {
  itemClasses: {
    base: 'data-[hover=true]:bg-default-200/75 data-[selected=true]:bg-blue-500 data-[selected=true]:text-white data-[selected=true]:[&_.item-description]:text-blue-200!',
  },
} as const;

const filterDilovodItem = (textValue: string, inputValue: string) => {
  const query = inputValue.trim().toLocaleLowerCase('uk');
  if (!query) return true;
  return textValue.toLocaleLowerCase('uk').includes(query);
};

export interface DilovodDictAutocompleteProps {
  dictItems: DilovodDictItem[];
  selectedKey: string;
  onChange: (key: string) => void;
  'aria-label'?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  /** @default 'flat' */
  variant?: 'flat' | 'bordered' | 'faded' | 'underlined';
  isClearable?: boolean;
  /** Показати parent__pr під підписом (план рахунків) */
  showParent?: boolean;
  labelPlacement?: 'inside' | 'outside' | 'outside-left';
  description?: string;
  /** @default 'sm' */
  size?: 'sm' | 'md' | 'lg';
  isDisabled?: boolean;
}

/**
 * HeroUI Autocomplete для довідників Dilovod.
 * Стандартна поведінка ComboBox: фільтрація при наборі, після вибору — підпис обраного елемента.
 */
export function DilovodDictAutocomplete({
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
  labelPlacement,
  description,
  size = 'sm',
  isDisabled = false,
}: DilovodDictAutocompleteProps) {
  const sortedItems = useMemo(
    () =>
      [...dictItems].sort((a, b) =>
        getDilovodItemLabel(a).localeCompare(getDilovodItemLabel(b), 'uk', { sensitivity: 'base' }),
      ),
    [dictItems],
  );

  const handleSelectionChange = useCallback((key: Key | null) => {
    if (key == null || key === '') {
      return;
    }
    onChange(String(key));
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  return (
    <Autocomplete
      className={className}
      size={size}
      variant={variant}
      isDisabled={isDisabled}
      label={label}
      labelPlacement={labelPlacement}
      description={description}
      placeholder={placeholder}
      selectedKey={selectedKey || null}
      items={sortedItems}
      defaultFilter={filterDilovodItem}
      allowsCustomValue={false}
      isClearable={isClearable}
      isVirtualized={false}
      maxListboxHeight={400}
      aria-label={ariaLabel ?? label}
      classNames={{
        popoverContent: 'shadow-lg border-1 border-default-200/60',
        clearButton: 'data-[hover=true]:bg-red-300/25 data-[hover=true]:text-red-600',
      }}
      listboxProps={LISTBOX_PROPS}
      onClear={isClearable ? handleClear : undefined}
      onSelectionChange={handleSelectionChange}
    >
      {(item) => (
        <AutocompleteItem key={String(item.id)} textValue={getDilovodItemLabel(item)}>
          <span>{getDilovodItemLabel(item)}</span>
          {showParent && item.parent__pr ? (
            <span className="block text-xs text-default-400 item-description">{item.parent__pr}</span>
          ) : null}
        </AutocompleteItem>
      )}
    </Autocomplete>
  );
}
