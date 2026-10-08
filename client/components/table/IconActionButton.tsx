import { Button, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface IconActionButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  color?: 'default' | 'primary' | 'danger' | 'success' | 'warning';
  isDisabled?: boolean;
  isLoading?: boolean;
}

export function IconActionButton({
  icon,
  label,
  onPress,
  color = 'default',
  isDisabled = false,
  isLoading = false,
}: IconActionButtonProps) {
  return (
    <Tooltip content={label} delay={400} closeDelay={0}>
      <Button
        isIconOnly
        size="sm"
        variant="light"
        color={color}
        aria-label={label}
        className="min-w-8 w-8 h-8"
        isDisabled={isDisabled || isLoading}
        onPress={onPress}
      >
        <DynamicIcon
          name={(isLoading ? 'loader-circle' : icon) as never}
          size={16}
          className={isLoading ? 'animate-spin' : undefined}
        />
      </Button>
    </Tooltip>
  );
}
