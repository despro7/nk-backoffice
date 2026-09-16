import {
  NUTRITION_FIELD_ROWS,
  isNutritionTextPlaceholder,
  parseNutritionValues,
  patchNutritionWithAutoEnergy,
} from '@shared/utils/productLabelNutrition';
import { PORTION_LABEL_LAYOUT } from '@shared/utils/productLabelPortionLayout';

function nutritionInputWidthCh(value: string): number {
  const display = value.trim() || '__';
  return Math.max(1, display.length);
}

interface NutritionValueFieldsProps {
  nutritionText: string;
  energyManual?: boolean;
  disabled?: boolean;
  onChange: (patch: { nutritionText: string; nutritionEnergyManual?: boolean }) => void;
}

export function NutritionValueFields({
  nutritionText,
  energyManual = false,
  disabled,
  onChange,
}: NutritionValueFieldsProps) {
  const values = parseNutritionValues(nutritionText);
  const muted = isNutritionTextPlaceholder(nutritionText);
  const lineGap = PORTION_LABEL_LAYOUT.nutritionLineGap;

  const handleChange = (key: typeof NUTRITION_FIELD_ROWS[number]['key'], nextValue: string) => {
    const result = patchNutritionWithAutoEnergy(nutritionText, key, nextValue, energyManual);
    onChange({
      nutritionText: result.text,
      nutritionEnergyManual: result.energyManual,
    });
  };

  return (
    <div className="flex flex-col" style={{ gap: lineGap }}>
      {NUTRITION_FIELD_ROWS.map((row) => (
        <p key={row.key} className="text-[6.7px] leading-[7px] tracking-[0.05px]">
          <span className={muted ? 'text-black/35' : ''}>{row.label} </span>
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={values[row.key]}
            placeholder="__"
            aria-label={row.label}
            title={row.key === 'energy' && energyManual ? 'Задано вручну' : undefined}
            onChange={(e) => handleChange(row.key, e.target.value)}
            style={{ width: `${nutritionInputWidthCh(values[row.key])}ch` }}
            className={[
              'inline min-w-[1ch] border-0 bg-transparent p-0 font-bold leading-[7px] outline-none',
              'rounded-[1px] ring-0 transition-shadow',
              disabled
                ? 'cursor-default'
                : 'hover:ring-1 hover:ring-primary/30 focus:ring-2 focus:ring-primary/50',
              muted && !values[row.key] ? 'text-black/35' : 'text-black',
              row.key === 'energy' && energyManual ? 'underline decoration-dotted decoration-black/25 underline-offset-[2px]' : '',
            ].join(' ')}
          />
          <span className={muted ? 'text-black/35' : ''}>
            {row.key === 'energy' ? ' ккал' : 'г'}
          </span>
        </p>
      ))}
    </div>
  );
}
