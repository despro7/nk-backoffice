import { Tooltip } from '@heroui/react';
import type { ReactElement } from 'react';

type EditorToolbarTooltipProps = {
  content: string;
  children: ReactElement;
};

/** Tooltip wrapper for icon buttons in rich-text editor toolbars. */
export function EditorToolbarTooltip({ content, children }: EditorToolbarTooltipProps) {
  return (
    <Tooltip content={content} size="sm" delay={300} closeDelay={0}>
      {children}
    </Tooltip>
  );
}
