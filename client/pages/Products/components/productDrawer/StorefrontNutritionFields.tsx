import { Button, Input, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ProductNutritionJson } from '@shared/types/storefront';
import { patchProductNutritionWithAutoEnergy } from '@shared/utils/storefrontDescription';

interface StorefrontNutritionFieldsProps {
  value: ProductNutritionJson | null;
  disabled?: boolean;
  onChange: (value: ProductNutritionJson) => void;
}

const EMPTY: ProductNutritionJson = {
  proteins: '',
  fats: '',
  carbs: '',
  energy: '',
  salt: '',
};

const ROWS: Array<{ key: keyof ProductNutritionJson; label: string; unit: string }> = [
  { key: 'proteins', label: 'Білки', unit: 'г' },
  { key: 'fats', label: 'Жири', unit: 'г' },
  { key: 'carbs', label: 'Вуглеводи', unit: 'г' },
  { key: 'energy', label: 'Калорійність', unit: 'ккал' },
  { key: 'salt', label: 'Сіль', unit: 'г' },
];

export function StorefrontNutritionFields({
  value,
  disabled,
  onChange,
}: StorefrontNutritionFieldsProps) {
  const current = value || EMPTY;

  const patch = (key: keyof ProductNutritionJson, nextValue: string) => {
    if (key === 'salt') {
      onChange({ ...current, salt: nextValue });
      return;
    }
    if (key === 'energyManual') return;
    onChange(patchProductNutritionWithAutoEnergy(current, key, nextValue));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <DynamicIcon name="activity" size={14} className="text-default-500 shrink-0" />
          КБЖВ
        </h3>
        <Tooltip content="Скоро...">
          <span>
            <Button
              size="sm"
              variant="flat"
              isDisabled
              startContent={<DynamicIcon name="sparkles" size={14} />}
            >
              На підставі специфікації
            </Button>
          </span>
        </Tooltip>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {ROWS.map((row) => (
          <Input
            key={row.key}
            label={row.label}
            size="sm"
            inputMode="decimal"
            isDisabled={disabled}
            value={String(current[row.key] ?? '')}
            description={
              row.key === 'energy' && current.energyManual ? 'Задано вручну' : undefined
            }
            endContent={<span className="text-xs text-default-400">{row.unit}</span>}
            onValueChange={(v) => patch(row.key, v)}
          />
        ))}
      </div>
    </div>
  );
}
