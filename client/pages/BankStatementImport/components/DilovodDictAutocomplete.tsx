import { useCallback, useEffect, useMemo, useState, type Key, type ReactNode } from 'react';
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

/** textValue для фільтра: назва + email/code + мітка вимкненого */
function getItemTextValue(item: DilovodDictItem): string {
  const parts = [
    getDilovodItemLabel(item),
    item.parent__pr,
    item.code,
    item.disabled ? 'вимкнений' : '',
  ].filter((part): part is string => Boolean(part && String(part).trim()));
  return parts.join(' ');
}

function itemMatchesQuery(item: DilovodDictItem, query: string): boolean {
  if (!query) return true;
  return getItemTextValue(item).toLocaleLowerCase('uk').includes(query);
}

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
  /** Показати parent__pr під підписом (план рахунків / email) */
  showParent?: boolean;
  labelPlacement?: 'inside' | 'outside' | 'outside-left';
  description?: string;
  /** @default 'sm' */
  size?: 'sm' | 'md' | 'lg';
  isDisabled?: boolean;
  isLoading?: boolean;
  endContent?: ReactNode;
}

/**
 * HeroUI Autocomplete для довідників Dilovod.
 *
 * React Aria: якщо передати контрольований `items`, built-in `defaultFilter` НЕ працює.
 * Тому фільтруємо самі і передаємо вже відфільтрований список.
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
  isLoading = false,
  endContent,
}: DilovodDictAutocompleteProps) {
  const sortedItems = useMemo(
    () =>
      [...dictItems].sort((a, b) =>
        getDilovodItemLabel(a).localeCompare(getDilovodItemLabel(b), 'uk', { sensitivity: 'base' }),
      ),
    [dictItems],
  );

  const [inputValue, setInputValue] = useState(() => {
    if (!selectedKey) return '';
    const selected = sortedItems.find((item) => String(item.id) === selectedKey);
    return selected ? getDilovodItemLabel(selected) : '';
  });

  // Синхронізація підпису лише коли змінюється selectedKey / список (не під час набору)
  useEffect(() => {
    if (!selectedKey) return;
    const selected = sortedItems.find((item) => String(item.id) === selectedKey);
    if (selected) {
      setInputValue(getDilovodItemLabel(selected));
    }
  }, [selectedKey, sortedItems]);

  const filteredItems = useMemo(() => {
    const query = inputValue.trim().toLocaleLowerCase('uk');
    if (!query) return sortedItems;
    // Якщо вже обрано і input = підпис — показуємо весь список (відкриття по focus/chevron)
    if (selectedKey) {
      const selected = sortedItems.find((item) => String(item.id) === selectedKey);
      if (selected && getDilovodItemLabel(selected) === inputValue) {
        return sortedItems;
      }
    }
    return sortedItems.filter((item) => itemMatchesQuery(item, query));
  }, [sortedItems, inputValue, selectedKey]);

  const handleSelectionChange = useCallback((key: Key | null) => {
    if (key == null || key === '') {
      return;
    }
    const id = String(key);
    const selected = sortedItems.find((item) => String(item.id) === id);
    if (selected) {
      setInputValue(getDilovodItemLabel(selected));
    }
    onChange(id);
  }, [onChange, sortedItems]);

  const handleClear = useCallback(() => {
    setInputValue('');
    onChange('');
  }, [onChange]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    // Інакше контрольований selectedKey повертає підпис обраного і «ламає» набір
    if (!selectedKey) return;
    const selected = sortedItems.find((item) => String(item.id) === selectedKey);
    if (selected && getDilovodItemLabel(selected) !== value) {
      onChange('');
    }
  }, [onChange, selectedKey, sortedItems]);

  return (
    <Autocomplete
      className={className}
      size={size}
      variant={variant}
      isDisabled={isDisabled}
      isLoading={isLoading}
      label={label}
      labelPlacement={labelPlacement}
      description={description}
      placeholder={placeholder}
      selectedKey={selectedKey || null}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      items={filteredItems}
      // items контрольовані → Aria ігнорує defaultFilter; фільтр у filteredItems
      defaultFilter={() => true}
      menuTrigger="focus"
      allowsCustomValue={false}
      allowsEmptyCollection
      isClearable={isClearable}
      isVirtualized={false}
      maxListboxHeight={400}
      aria-label={ariaLabel ?? label}
      endContent={endContent}
      classNames={{
        popoverContent: 'shadow-lg border-1 border-default-200/60 z-[70]',
        clearButton: 'data-[hover=true]:bg-red-300/25 data-[hover=true]:text-red-600',
      }}
      listboxProps={LISTBOX_PROPS}
      popoverProps={{
        placement: 'bottom-start',
        shouldBlockScroll: false,
      }}
      onClear={isClearable ? handleClear : undefined}
      onSelectionChange={handleSelectionChange}
    >
      {(item) => (
        <AutocompleteItem
          key={String(item.id)}
          textValue={getItemTextValue(item)}
          className={item.disabled ? 'opacity-50' : undefined}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">{getDilovodItemLabel(item)}</span>
            {item.disabled ? (
              <span className="shrink-0 rounded px-1.5 py-1 text-[10px] inline-block font-medium uppercase leading-none tracking-wide bg-danger-100 text-danger-600">
                вимкнений
              </span>
            ) : null}
          </div>
          {showParent && item.parent__pr ? (
            <span className="block text-xs text-default-400 item-description">{item.parent__pr}</span>
          ) : null}
        </AutocompleteItem>
      )}
    </Autocomplete>
  );
}
