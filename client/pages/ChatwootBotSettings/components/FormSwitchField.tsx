import { Switch } from '@heroui/react';

export function FormSwitchField({
  isSelected,
  onValueChange,
  isDisabled,
  title,
  description,
}: {
  isSelected: boolean;
  onValueChange: (v: boolean) => void;
  isDisabled?: boolean;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch
        size="sm"
        classNames={{ base: 'mt-0.5' }}
        isSelected={isSelected}
        isDisabled={isDisabled}
        onValueChange={onValueChange}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="text-xs text-default-500">{description}</p> : null}
      </div>
    </div>
  );
}
