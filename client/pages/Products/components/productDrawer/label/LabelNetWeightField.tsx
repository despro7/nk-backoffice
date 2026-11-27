import { useState } from 'react';
import { Input, Tab, Tabs } from '@heroui/react';
import {
  formatNetWeightToleranceLabel,
  formatNetWeightToleranceSpec,
  formatNetWeightWithSuffix,
  parseNetWeightTolerance,
  type NetWeightToleranceUnit,
} from '@shared/utils/productLabel';
import type { LabelWeightSpacing } from '@shared/types/labelWeightSpacing';

type WeightMode = 'estimated' | 'tolerance';

interface LabelNetWeightFieldProps {
  label: string;
  /** Маса нетто для наліпки, напр. «385г». */
  value: string;
  /** Похибка з чернетки: «5%» / «20г» або порожньо (тоді на наліпці знак ℮). */
  tolerance: string;
  isReadOnly?: boolean;
  /** Порційна наліпка: показати вибір «℮ / ± похибка» (на коробці не друкується). */
  withSuffix?: boolean;
  /** Пробіли з налаштувань шаблону для підказки «На наліпці». */
  weightSpacing?: LabelWeightSpacing;
  onValueChange: (value: string) => void;
  onToleranceChange: (spec: string) => void;
}

const INPUT_CLASS_NAMES = {
  label: 'text-xs text-foreground-400! font-normal',
  input: 'text-sm text-default-700',
};

function stateFromSpec(spec: string, prevMode?: WeightMode) {
  const parsed = parseNetWeightTolerance(spec);
  return {
    source: spec,
    mode: (parsed ? 'tolerance' : (prevMode ?? 'estimated')) as WeightMode,
    amount: parsed ? String(parsed.value).replace('.', ',') : '',
    unit: (parsed?.unit ?? 'pct') as NetWeightToleranceUnit,
  };
}

export function LabelNetWeightField({
  label,
  value,
  tolerance,
  isReadOnly,
  withSuffix = true,
  weightSpacing,
  onValueChange,
  onToleranceChange,
}: LabelNetWeightFieldProps) {
  const [state, setState] = useState(() => stateFromSpec(tolerance));

  // Похибку змінили ззовні (інша версія, синхронізація з картки): перечитати режим і значення.
  if (state.source !== tolerance)
    setState(stateFromSpec(tolerance, tolerance ? undefined : state.mode));

  const emit = (amount: string, unit: NetWeightToleranceUnit) => {
    const numeric = Number(amount.replace(',', '.'));
    const spec =
      Number.isFinite(numeric) && numeric > 0
        ? formatNetWeightToleranceSpec({ value: numeric, unit })
        : '';
    setState({ source: spec, mode: 'tolerance', amount, unit });
    if (spec !== tolerance) onToleranceChange(spec);
  };

  const handleModeChange = (next: WeightMode) => {
    if (next === state.mode) return;
    if (next === 'estimated') {
      // Значення й одиницю лишаємо в полі: при поверненні на «±» вони відновляться.
      setState({ ...state, source: '', mode: next });
      if (tolerance) onToleranceChange('');
      return;
    }
    emit(state.amount, state.unit);
  };

  const preview =
    state.mode === 'tolerance' && formatNetWeightToleranceLabel(tolerance)
      ? formatNetWeightWithSuffix(value, tolerance, weightSpacing)
      : '';

  return (
    <div className="flex flex-col gap-2 md:col-span-2">
      <Input
        size="sm"
        label={label}
        labelPlacement="outside"
        classNames={INPUT_CLASS_NAMES}
        value={value}
        isReadOnly={isReadOnly}
        onValueChange={onValueChange}
      />
      {withSuffix ? (
        <Tabs
          size="md"
          fullWidth
          color="primary"
          aria-label="Знак ℮ або похибка маси"
          selectedKey={state.mode}
          isDisabled={isReadOnly}
          onSelectionChange={(key) => handleModeChange(String(key) as WeightMode)}
        >
          <Tab key="estimated" title="℮ Без похибки" />
          <Tab key="tolerance" title="± Похибка" />
        </Tabs>
      ) : null}
      {withSuffix && state.mode === 'tolerance' ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Input
              size="sm"
              inputMode="decimal"
              aria-label={`Похибка: ${label}`}
              placeholder="5"
              startContent={<span className="text-sm text-default-400">±</span>}
              classNames={INPUT_CLASS_NAMES}
              value={state.amount}
              isReadOnly={isReadOnly}
              onValueChange={(raw) => emit(raw.replace(/[^\d.,]/g, ''), state.unit)}
            />
            <Tabs
              size="md"
              color="primary"
              aria-label="Одиниця похибки"
              selectedKey={state.unit}
              isDisabled={isReadOnly}
              onSelectionChange={(key) => emit(state.amount, String(key) as NetWeightToleranceUnit)}
            >
              <Tab key="pct" title="%" />
              <Tab key="g" title="г" />
            </Tabs>
          </div>
          {preview ? (
            <p className="text-xs text-default-500">
              На наліпці: {preview}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
