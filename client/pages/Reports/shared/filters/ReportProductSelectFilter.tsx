import { Autocomplete, AutocompleteItem } from "@heroui/react";
import { useMemo } from "react";
import { DynamicIcon } from "lucide-react/dynamic";

type ReportProductOption = {
  sku: string;
  name: string;
};

interface ReportProductSelectFilterProps {
  ariaLabel: string;
  placeholder: string;
  selectedKey: string | null;
  onChange: (key: string | null) => void;
  products: ReportProductOption[];
  className?: string;
  triggerClassName?: string;
  baseClassName?: string;
  size?: "sm" | "md" | "lg";
  iconSize?: number;
}

export default function ReportProductSelectFilter({
  ariaLabel,
  placeholder,
  selectedKey,
  onChange,
  products,
  className,
  triggerClassName = "h-10",
  baseClassName,
  size = "md",
  iconSize = 19,
}: ReportProductSelectFilterProps) {
  const sortedProducts = useMemo(
    () => [...products].sort((left, right) => {
      const nameComparison = left.name.localeCompare(right.name, "uk", {
        sensitivity: "base",
        numeric: true,
      });

      if (nameComparison !== 0) {
        return nameComparison;
      }

      return left.sku.localeCompare(right.sku, "uk", {
        sensitivity: "base",
        numeric: true,
      });
    }),
    [products],
  );

  const options = useMemo(
    () => [{ sku: "", name: placeholder }, ...sortedProducts],
    [placeholder, sortedProducts],
  );

  return (
    <div className={className}>
      <Autocomplete
        aria-label={ariaLabel}
        placeholder={placeholder}
        defaultItems={options}
        selectedKey={selectedKey ?? null}
        onSelectionChange={(key) => {
          if (key === null || key === "") {
            onChange(null);
            return;
          }

          onChange(String(key));
        }}
        allowsCustomValue={false}
        isClearable
        size={size}
        startContent={<DynamicIcon name="package" size={iconSize} className="text-gray-400 shrink-0" />}
        inputProps={{
          classNames: {
            inputWrapper: triggerClassName,
            innerWrapper: "gap-2",
          },
        }}
        classNames={{
          base: baseClassName,
        }}
      >
        {(item) => (
          <AutocompleteItem
            key={item.sku}
            textValue={item.sku ? `${item.name} (${item.sku})` : item.name}
          >
            {item.sku ? `${item.name} (${item.sku})` : item.name}
          </AutocompleteItem>
        )}
      </Autocomplete>
    </div>
  );
}