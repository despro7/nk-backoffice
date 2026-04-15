import { Button, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

// ---------------------------------------------------------------------------
// MonthSwitcher — перемикач місяців для фільтрів
// Використовується в MovementHistoryTab та інших місцях де потрібна навігація по місяцях
// ---------------------------------------------------------------------------

interface MonthSwitcherProps {
  /** Поточний вибраний місяць (будь-яка дата у ньому) */
  value: Date;
  /** Викликається при зміні місяця */
  onChange: (newMonth: Date) => void;
  /** Блокувати кнопку "вперед" якщо вибрано поточний або майбутній місяць */
  disableFuture?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const MONTHS_UK = [
  'Січень', 'Лютий', 'Березень', 'Квітень',
  'Травень', 'Червень', 'Липень', 'Серпень',
  'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

export const MonthSwitcher = ({
  value,
  onChange,
  disableFuture = true,
  size = 'sm',
}: MonthSwitcherProps) => {
  const month = value.getMonth();
  const year = value.getFullYear();

  const now = new Date();
  const isCurrentOrFutureMonth =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth());

  const handlePrev = () => {
    const d = new Date(year, month - 1, 1);
    onChange(d);
  };

  const handleNext = () => {
    const d = new Date(year, month + 1, 1);
    onChange(d);
  };

  return (
    <div className="flex items-center gap-0">
      <Button
        isIconOnly
        size={size}
        variant="flat"
        aria-label="Попередній місяць"
        onPress={handlePrev}
        className="rounded-r-none border-r-0"
      >
        <DynamicIcon name="chevron-left" className="w-4 h-4" />
      </Button>
      <Select
        aria-label="Вибраний місяць"
        size={size}
        className="min-w-[150px]"
        selectedKeys={[String(month)]}
        renderValue={() => (
          <span className="font-medium">{MONTHS_UK[month]} {year}</span>
        )}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0];
          if (selected !== undefined) {
            onChange(new Date(year, Number(selected), 1));
          }
        }}
        classNames={{
          trigger: "justify-center rounded-none border-x-0 shadow-none duration-150 bg-default-100 hover:bg-default-200 data-[hover=true]:bg-default-200",
          selectorIcon: "hidden",
          value: "text-center"
        }}
      >
        {MONTHS_UK.map((monthName, index) => {
          // Не рендеримо майбутні місяці
          const isFuture =
            disableFuture && (
              year > now.getFullYear() ||
              (year === now.getFullYear() && index > now.getMonth())
            );
          if (isFuture) return null;
          return (
            <SelectItem classNames={{
              selectedIcon: "hidden",
              base: "duration-50 hover:bg-default-100! data-[hover=true]:bg-default-100!",
              // base: "bg-danger-500",
            }} key={String(index)} textValue={`${monthName} ${year}`}>{monthName} {year}</SelectItem>
          );
        })}
      </Select>
      <Button
        isIconOnly
        size={size}
        variant="flat"
        aria-label="Наступний місяць"
        onPress={handleNext}
        isDisabled={disableFuture && isCurrentOrFutureMonth}
        className="rounded-l-none border-l-0"
      >
        <DynamicIcon name="chevron-right" className="w-4 h-4" />
      </Button>
    </div>
  );
};
