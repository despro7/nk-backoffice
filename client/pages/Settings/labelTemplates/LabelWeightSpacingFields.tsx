import { Tab, Tabs } from '@heroui/react';
import type {
  LabelSpaceWidth,
  LabelWeightSpacing,
  LabelWeightSpacingSlot,
} from '@shared/types/labelWeightSpacing';
import {
  LABEL_SPACE_EM,
  LABEL_SPACE_LABELS,
  LABEL_WEIGHT_SPACING_OPTIONS,
  LABEL_WEIGHT_SPACING_SLOT_LABELS,
  LABEL_WEIGHT_SPACING_SLOTS,
} from '@shared/utils/labelWeightSpacing';
import { formatNetWeightWithSuffix } from '@shared/utils/productLabel';

interface LabelWeightSpacingFieldsProps {
  value: LabelWeightSpacing;
  onChange: (slot: LabelWeightSpacingSlot, width: LabelSpaceWidth) => void;
  /** Значення, від яких успадковує шаблон: показується підказкою біля кожного місця. */
  inherited?: LabelWeightSpacing;
  isDisabled?: boolean;
}

/** Три вибори ширини пробілу в масі нетто + превʼю «380 г ℮» / «380 г ± 8%». */
export function LabelWeightSpacingFields({
  value,
  onChange,
  inherited,
  isDisabled,
}: LabelWeightSpacingFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      {LABEL_WEIGHT_SPACING_SLOTS.map((slot) => (
        <div key={slot} className="flex flex-col gap-1.5">
          <span className="text-xs text-default-500">
            {LABEL_WEIGHT_SPACING_SLOT_LABELS[slot]}
            {inherited ? ` · спільне: ${LABEL_SPACE_LABELS[inherited[slot]].toLowerCase()}` : ''}
          </span>
          <Tabs
            size="sm"
            fullWidth
            color="primary"
            aria-label={LABEL_WEIGHT_SPACING_SLOT_LABELS[slot]}
            selectedKey={value[slot]}
            isDisabled={isDisabled}
            onSelectionChange={(key) => onChange(slot, String(key) as LabelSpaceWidth)}
          >
            {LABEL_WEIGHT_SPACING_OPTIONS[slot].map((width) => (
              <Tab
                key={width}
                title={LABEL_SPACE_LABELS[width]}
                aria-label={`${LABEL_SPACE_LABELS[width]}, ${LABEL_SPACE_EM[width]} em`}
              />
            ))}
          </Tabs>
        </div>
      ))}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg border border-dashed border-default-300 bg-white px-3 py-2">
        <span className="font-['OpenSansCondensed'] text-2xl font-bold leading-tight text-gray-900">
          {formatNetWeightWithSuffix('380г', '', value)}
        </span>
        <span className="font-['OpenSansCondensed'] text-2xl font-bold leading-tight text-gray-900">
          {formatNetWeightWithSuffix('380г', '8%', value)}
        </span>
      </div>
    </div>
  );
}
