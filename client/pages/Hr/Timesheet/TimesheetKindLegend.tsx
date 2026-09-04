import { Chip, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  HR_TIMESHEET_KIND_CODES,
  HR_TIMESHEET_KIND_LABELS,
  type HrTimesheetKindCode,
} from '@shared/types/hr';
import { SPEC_COLOR_HUE_NAMES, getSpecColorByHue, specColorToClassNames } from '@shared/utils/specColorPalette';
import { HR_TIMESHEET_KIND_DEFAULT_HUES, hrKindTokens } from '../hrUi';

interface TimesheetKindLegendProps {
  colorSettingsOpen: boolean;
  onToggleColorSettings: () => void;
  hueFor: (code: HrTimesheetKindCode) => string;
  onHueChange: (code: HrTimesheetKindCode, hue: string | null) => void;
}

export function TimesheetKindLegend({
  colorSettingsOpen,
  onToggleColorSettings,
  hueFor,
  onHueChange,
}: TimesheetKindLegendProps) {
  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex flex-wrap items-center gap-2">
        {HR_TIMESHEET_KIND_CODES.map((code) => {
          const hue = hueFor(code);
          const tokens = hrKindTokens(hue);
          return (
            <Chip
              key={code}
              size="sm"
              variant="flat"
              classNames={{
                base: specColorToClassNames(tokens, { border: true }),
                content: 'font-medium',
              }}
            >
              {code} — {HR_TIMESHEET_KIND_LABELS[code]}
            </Chip>
          );
        })}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          onClick={onToggleColorSettings}
        >
          <DynamicIcon name={colorSettingsOpen ? 'chevron-up' : 'palette'} size={14} />
          {colorSettingsOpen ? 'Сховати кольори' : 'Налаштування кольорів'}
        </button>
      </div>
      {colorSettingsOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          {HR_TIMESHEET_KIND_CODES.map((code) => {
            const hue = hueFor(code);
            const tokens = hrKindTokens(hue);
            const isCustom = hue !== HR_TIMESHEET_KIND_DEFAULT_HUES[code];
            return (
              <div key={code} className="flex items-center gap-1">
                <Chip
                  size="sm"
                  variant="flat"
                  classNames={{
                    base: specColorToClassNames(tokens, { border: true }),
                    content: 'font-medium',
                  }}
                >
                  {code}
                </Chip>
                <Select
                  size="sm"
                  aria-label={`Колір для ${code}`}
                  className="w-[7.5rem]"
                  selectedKeys={[hue]}
                  onSelectionChange={(keys) => {
                    const key = Array.from(keys as Set<string>)[0];
                    if (key) onHueChange(code, key);
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
                {isCustom ? (
                  <button
                    type="button"
                    className="rounded-md p-1 text-amber-700 hover:bg-amber-50"
                    aria-label={`Скинути колір ${code}`}
                    onClick={() => onHueChange(code, null)}
                  >
                    <DynamicIcon name="pin-off" size={12} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
