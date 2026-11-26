import { useState } from 'react';
import { Input, Tab, Tabs } from '@heroui/react';
import type {
  LabelMockNetWeight,
  LabelMockNetWeightMode,
} from '@shared/pdfme/labelNetWeightPreview';
import {
  formatNetWeightToleranceSpec,
  parseNetWeightTolerance,
  type NetWeightToleranceUnit,
} from '@shared/utils/productLabel';

interface LabelMockNetWeightControlProps {
  value: LabelMockNetWeight;
  onChange: (value: LabelMockNetWeight) => void;
  isDisabled?: boolean;
}

/** Зразок маси в макеті: «380 г ℮» або «380 г ± N». Зберігається з mock-даними шаблону. */
export function LabelMockNetWeightControl({ value, onChange, isDisabled }: LabelMockNetWeightControlProps) {
  const parsed = parseNetWeightTolerance(value.tolerance);
  const [amount, setAmount] = useState(() => (parsed ? String(parsed.value).replace('.', ',') : ''));
  const unit: NetWeightToleranceUnit = parsed?.unit ?? 'pct';

  const emitTolerance = (nextAmount: string, nextUnit: NetWeightToleranceUnit) => {
    setAmount(nextAmount);
    const numeric = Number(nextAmount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    onChange({ ...value, tolerance: formatNetWeightToleranceSpec({ value: numeric, unit: nextUnit }) });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        size="sm"
        color="primary"
        aria-label="Зразок маси нетто в макеті"
        selectedKey={value.mode}
        isDisabled={isDisabled}
        onSelectionChange={(key) => onChange({ ...value, mode: String(key) as LabelMockNetWeightMode })}
      >
        <Tab key="estimated" title="℮ Без похибки" />
        <Tab key="tolerance" title="± Похибка" />
      </Tabs>
      {value.mode === 'tolerance' ? (
        <>
          <Input
            size="sm"
            inputMode="decimal"
            aria-label="Похибка для зразка"
            className="w-20"
            startContent={<span className="text-sm text-default-400">±</span>}
            value={amount}
            isDisabled={isDisabled}
            onValueChange={(raw) => emitTolerance(raw.replace(/[^\d.,]/g, ''), unit)}
          />
          <Tabs
            size="sm"
            color="primary"
            aria-label="Одиниця похибки для зразка"
            selectedKey={unit}
            isDisabled={isDisabled}
            onSelectionChange={(key) => emitTolerance(amount, String(key) as NetWeightToleranceUnit)}
          >
            <Tab key="pct" title="%" />
            <Tab key="g" title="г" />
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
