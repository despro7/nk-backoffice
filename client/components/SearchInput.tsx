import { Input } from "@heroui/input";
import { DynamicIcon } from 'lucide-react/dynamic';
import { useEffect } from "react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "Пошук замовлення" }: SearchInputProps) {
  // Этот хук будет запускаться при каждом изменении внешнего значения (например, от NumberPad).
  useEffect(() => {
    // Разрешаем только цифры и ограничиваем длину до 18 символов
    const sanitizedValue = value.replace(/[^0-9]/g, '').slice(0, 18);

    if (sanitizedValue !== value) {
      // Если значение было изменено (например, была добавлена не-цифра или превышена длина),
      // вызываем onChange с отформатированным значением.
      onChange(sanitizedValue);
    }
  }, [value, onChange]);

  // Этот обработчик для прямого ввода в текстовое поле.
  // Он также немедленно форматирует ввод.
  const handleValueChange = (newValue: string) => {
    const sanitizedValue = newValue.replace(/[^0-9]/g, '');
    // Атрибут maxLength на input сам ограничит длину при наборе.
    onChange(sanitizedValue);
  };

  return (
    <Input
      type="tel" // Лучше подходит для ввода цифр на мобильных устройствах
      maxLength={18}
      isClearable
      placeholder={placeholder}
      value={value}
      onValueChange={handleValueChange} // Используем наш обработчик для прямого ввода
      startContent={ <DynamicIcon name="package-search" className="text-gray-400" strokeWidth={1.5} size={24} /> }
      classNames={{
        base: "w-full",
        mainWrapper: "h-full",
        input: "text-base text-gray-700 placeholder:text-gray-400 ml-1",
        inputWrapper: "h-auto min-h-[64px] px-4 py-4 bg-white! border border-gray-200 rounded-lg focus-within:border-gray-400",
      }}
    />
  );
}
