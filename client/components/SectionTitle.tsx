import type { ComponentProps, ReactNode } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface SectionTitleProps {
  icon: ComponentProps<typeof DynamicIcon>['name'];
  children: ReactNode;
  /** sub: підзаголовок усередині секції */
  level?: 'section' | 'sub';
  /** compact: менший заголовок секції для щільних сторінок */
  size?: 'default' | 'compact';
  className?: string;
}

/** Заголовок секції з іконкою */
export function SectionTitle({ icon, children, level = 'section', size = 'default', className = '' }: SectionTitleProps) {
  const isSub = level === 'sub';
  const Tag = isSub ? 'h3' : 'h2';
  const sectionStyle = size === 'compact' ? { text: 'text-base', icon: 18 } : { text: 'text-lg', icon: 20 };
  const style = isSub ? { text: 'text-sm', icon: 16 } : sectionStyle;

  return (
    <Tag
      className={`flex items-center gap-2 font-semibold text-default-900 ${style.text} ${className}`}
    >
      <DynamicIcon name={icon} size={style.icon} className="shrink-0 text-default-400" />
      {children}
    </Tag>
  );
}
