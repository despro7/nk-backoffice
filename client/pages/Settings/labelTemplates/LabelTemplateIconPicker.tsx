import { Button, Popover, PopoverContent, PopoverTrigger, Tooltip } from '@heroui/react';
import {
  LABEL_TEMPLATE_ICON_KEYS,
  LABEL_TEMPLATE_ICON_LABELS,
  type LabelTemplateIconKey,
} from '@shared/constants/labelTemplateIcons';
import { LabelTemplateIcon } from './LabelTemplateIcon';

type LabelTemplateIconPickerProps = {
  value: string | null;
  onChange: (iconKey: LabelTemplateIconKey) => void;
  isDisabled?: boolean;
};

export function LabelTemplateIconPicker({ value, onChange, isDisabled }: LabelTemplateIconPickerProps) {
  return (
    <Popover placement="bottom-start">
      <PopoverTrigger>
        <Button
          variant="flat"
          isIconOnly
          className="shrink-0 border border-default-200 bg-default-50"
          aria-label="Іконка шаблону"
          isDisabled={isDisabled}
        >
          <LabelTemplateIcon iconKey={value} size={18} className="text-default-700" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-3">
        <p className="mb-2 text-xs font-medium text-default-600">Іконка шаблону</p>
        <div className="grid grid-cols-4 gap-1">
          {LABEL_TEMPLATE_ICON_KEYS.map((key) => (
            <Tooltip key={key} content={LABEL_TEMPLATE_ICON_LABELS[key]} placement="top" delay={300}>
              <Button
                size="sm"
                variant={value === key ? 'solid' : 'light'}
                color={value === key ? 'primary' : 'default'}
                isIconOnly
                aria-label={LABEL_TEMPLATE_ICON_LABELS[key]}
                onPress={() => onChange(key)}
              >
                <LabelTemplateIcon iconKey={key} size={16} />
              </Button>
            </Tooltip>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
