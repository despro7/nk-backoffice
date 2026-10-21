import { Button, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface OpenStorefrontProductLinkProps {
  url: string | null | undefined;
  tooltip?: string | null | undefined;
  label?: string | null | undefined;
  size?: 'sm' | 'md';
}

export function OpenStorefrontProductLink({
  url,
  tooltip,
  label = 'Відкрити товар на сайті',
  size = 'sm',
}: OpenStorefrontProductLinkProps) {
  if (!url?.trim()) return null;

  return (
    <Tooltip content={tooltip ?? url} placement="top" delay={400}>
      <Button
        as="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        size={size}
        variant="light"
        isIconOnly={!label}
        aria-label={label}
        className={label ? 'text-default-600' : undefined}
        startContent={label ? <DynamicIcon name="external-link" size={14} /> : undefined}
      >
        {label ? label : <DynamicIcon name="external-link" size={16} />}
      </Button>
    </Tooltip>
  );
}
