import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, AutocompleteItem } from '@heroui/react';
import {
  findDilovodItemLabel,
  getDilovodItemLabel,
  type DilovodDictItem,
} from '@shared/utils/directoryUtils';

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
}

/**
 * HeroUI Autocomplete для довідників Dilovod:
 * - `defaultItems` + key після завантаження — внутрішня фільтрація працює
 * - сортування за алфавітом (uk)
 * - menuTrigger="manual" — список лише по кнопці-тригеру (або стрілках)
 * - при відкритті очищаємо inputValue для пошуку
 * - прокрутка до обраної опції
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
}: DilovodDictAutocompleteProps) {
  const sortedItems = useMemo(
    () =>
      [...dictItems].sort((a, b) =>
        getDilovodItemLabel(a).localeCompare(getDilovodItemLabel(b), 'uk', { sensitivity: 'base' }),
      ),
    [dictItems],
  );
  const selectedLabel = findDilovodItemLabel(selectedKey, dictItems);
  const [inputValue, setInputValue] = useState(selectedLabel);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) setInputValue(selectedLabel);
  }, [selectedKey, selectedLabel, isOpen]);

  // Очищення inputValue скидає focusedKey у react-stately — прокручуємо до обраної опції вручну
  useEffect(() => {
    if (!isOpen || !selectedKey || inputValue !== '') return;
    let cancelled = false;
    let t1 = 0;
    const scrollToSelected = (): boolean => {
      if (cancelled) return false;
      const option = document.querySelector<HTMLElement>(
        `[data-slot="list"] [data-key="${CSS.escape(String(selectedKey))}"]`,
      );
      if (!option) return false;
      option.scrollIntoView({ block: 'nearest' });
      return true;
    };
    const t0 = window.setTimeout(() => {
      if (scrollToSelected()) return;
      t1 = window.setTimeout(scrollToSelected, 50);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [isOpen, selectedKey, inputValue]);

  return (
    <Autocomplete
      key={sortedItems.length > 0 ? 'ready' : 'loading'}
      className={className}
      size="sm"
      variant={variant}
      label={label}
      placeholder={placeholder}
      selectedKey={selectedKey || null}
      inputValue={inputValue}
      onInputChange={setInputValue}
      defaultItems={sortedItems}
      allowsCustomValue={false}
      isClearable={isClearable}
      isVirtualized={false}
      aria-label={ariaLabel ?? label}
      classNames={{
        base: '[&>]:bg-blue-500! border-default-200/80',
        popoverContent: 'min-w-[240px] max-w-content!',
        selectorButton: 'rounded-r-sm! rounded-l-none',
        clearButton: 'rounded-none',
      }}
      menuTrigger="manual"
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setInputValue('');
        } else {
          setInputValue(selectedLabel);
        }
      }}
      onClear={isClearable ? () => onChange('') : undefined}
      onSelectionChange={(key) => {
        if (key == null || key === '') {
          // null під час набору — не скидаємо; clear лише через isClearable / onClear
          return;
        }
        onChange(String(key));
      }}
    >
      {(item) => (
        <AutocompleteItem key={String(item.id)} textValue={getDilovodItemLabel(item)}>
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
        </AutocompleteItem>
      )}
    </Autocomplete>
  );
}
