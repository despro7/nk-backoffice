import { Chip, Select, SelectItem } from '@heroui/react';
import { SPEC_COLOR_HUE_NAMES, getSpecColorByHue, specColorToClassNames } from '@shared/utils/specColorPalette';
import { DynamicIcon } from 'lucide-react/dynamic';

interface SpecHueSelectProps {
  hue: string;
  defaultHue?: string;
  ariaLabel: string;
  className?: string;
  onChange: (hue: string) => void;
  onReset?: () => void;
}

/** Селект hue з превʼю кольору (патерн TimesheetKindLegend / pay groups). */
export function SpecHueSelect({
  hue,
  defaultHue,
  ariaLabel,
  className,
  onChange,
  onReset,
}: SpecHueSelectProps) {
  const isCustom = defaultHue != null && hue !== defaultHue;

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <Select
        size="sm"
        aria-label={ariaLabel}
        className="w-[7.5rem]"
        selectedKeys={[hue]}
        onSelectionChange={(keys) => {
          const key = Array.from(keys as Set<string>)[0];
          if (key) onChange(key);
        }}
        renderValue={() => (
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-3 rounded-sm border ${getSpecColorByHue(hue).bg} ${getSpecColorByHue(hue).border}`}
            />
            <span className="text-xs">{hue}</span>
          </div>
        )}
      >
        {SPEC_COLOR_HUE_NAMES.map((name) => {
          const option = getSpecColorByHue(name, 'light', 'soft');
          return (
            <SelectItem key={name} textValue={name}>
              <div className="flex items-center gap-2">
                <Chip
                  size="sm"
                  variant="flat"
                  classNames={{
                    base: specColorToClassNames(option, { border: true }),
                    content: 'text-[10px] font-medium',
                  }}
                >
                  {name}
                </Chip>
              </div>
            </SelectItem>
          );
        })}
      </Select>
      {isCustom && onReset ? (
        <button
          type="button"
          className="rounded-md p-1 text-amber-700 hover:bg-amber-50"
          aria-label="Скинути колір"
          onClick={onReset}
        >
          <DynamicIcon name="pin-off" size={12} />
        </button>
      ) : null}
    </div>
  );
}
