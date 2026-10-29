import { cn, Switch, useRadio, VisuallyHidden, type RadioProps } from '@heroui/react';

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

const replyModeRadioCardClassNames: RadioProps['classNames'] = {
  base: cn(
    'group relative inline-flex max-w-none w-full min-w-0 flex-1 flex-row items-center',
    'justify-start gap-2 m-0 px-3 py-2 cursor-pointer select-none tap-highlight-transparent',
    'border border-default-200 rounded-medium',
    'hover:bg-default-100 active:opacity-80',
    'data-[selected=true]:border-primary data-[selected=true]:bg-primary-50/40',
  ),
  wrapper: cn(
    'shrink-0',
    'group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
    'group-data-[focus-visible=true]:outline-none',
  ),
  labelWrapper: 'flex flex-col gap-0.5 flex-1 min-w-0 ms-0 ml-0',
  label: 'text-sm font-medium text-foreground',
  description: 'text-xs text-foreground-500',
};

type ReplyModeRadioProps = RadioProps & {
  description?: string;
};

export function ReplyModeRadio({ description, children, classNames, ...props }: ReplyModeRadioProps) {
  const {
    Component,
    getBaseProps,
    getWrapperProps,
    getInputProps,
    getLabelProps,
    getLabelWrapperProps,
    getControlProps,
    getDescriptionProps,
  } = useRadio({
    ...props,
    description,
    classNames: {
      ...replyModeRadioCardClassNames,
      ...classNames,
      base: cn(replyModeRadioCardClassNames?.base, classNames?.base),
      wrapper: cn(replyModeRadioCardClassNames?.wrapper, classNames?.wrapper),
      labelWrapper: cn(replyModeRadioCardClassNames?.labelWrapper, classNames?.labelWrapper),
      label: cn(replyModeRadioCardClassNames?.label, classNames?.label),
      description: cn(replyModeRadioCardClassNames?.description, classNames?.description),
    },
  });

  return (
    <Component {...getBaseProps()}>
      <VisuallyHidden>
        <input {...getInputProps()} />
      </VisuallyHidden>
      <span {...getWrapperProps()}>
        <span {...getControlProps()} />
      </span>
      <div {...getLabelWrapperProps()}>
        {children ? <span {...getLabelProps()}>{children}</span> : null}
        {description ? <span {...getDescriptionProps()}>{description}</span> : null}
      </div>
    </Component>
  );
}
