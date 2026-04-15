import { Select, SelectItem } from '@heroui/react';

// ---------------------------------------------------------------------------
// SortSelect — універсальний селект сортування для складських сторінок
//
// Приймає довільний набір опцій у форматі "sortField_direction" (напр. "name_asc").
// Сам розбиває обраний ключ на поле і напрям та викликає відповідні колбеки.
// Використовується в InventoryProgressBar та MovementFilterBar.
// ---------------------------------------------------------------------------

export interface SortOption<T extends string = string> {
  /** Ключ у форматі "<field>_asc" або "<field>_desc" */
  key: `${T}_asc` | `${T}_desc`;
  label: string;
}

export type SortDirection = 'asc' | 'desc';

interface SortSelectProps<T extends string> {
  options: SortOption<T>[];
  sortBy: T;
  sortDirection: SortDirection;
  onSortByChange: (value: T) => void;
  onSortDirectionChange: (value: SortDirection) => void;
  className?: string;
	classNames?: {
		trigger?: string;
		content?: string;
		item?: string;
	};
}

export const SortSelect = <T extends string>({
  options,
  sortBy,
  sortDirection,
  onSortByChange,
  onSortDirectionChange,
  className = 'flex-1 max-w-[200px]',
	classNames = {
		trigger: 'duration-150 rounded-[14px]',
	},
}: SortSelectProps<T>) => {
  const handleChange = (keys: any) => {
    const selected = Array.from(keys)[0]?.toString() ?? options[0]?.key ?? '';
    const lastUnderscore = selected.lastIndexOf('_');
    if (lastUnderscore === -1) return;
    const field = selected.slice(0, lastUnderscore) as T;
    const dir = selected.slice(lastUnderscore + 1) as SortDirection;
    onSortByChange(field);
    onSortDirectionChange(dir);
  };

  return (
    <Select
      label="Сортування"
			labelPlacement="inside"
      size="sm"
      variant="flat"
      color="default"
      selectedKeys={[`${sortBy}_${sortDirection}`]}
      onSelectionChange={handleChange}
      className={className}
      classNames={classNames}
    >
      {options.map(option => (
        <SelectItem key={option.key} textValue={option.label}>
          {option.label}
        </SelectItem>
      ))}
    </Select>
  );
};
