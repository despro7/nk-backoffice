import React from 'react';
import { Tabs } from '@heroui/react';

interface Props {
  selectedKey: any;
  onSelectionChange: (key: any) => void;
  children: React.ReactNode;
  className?: string;
  [key: string]: any;
}

export default function PageTabs({ selectedKey, onSelectionChange, children, className, classNames, variant = 'solid', color = 'default', ...rest }: Props) {
  return (
    <Tabs
      selectedKey={selectedKey}
      onSelectionChange={onSelectionChange}
      variant={variant}
      color={color}
      size="lg"
      className={className}
      classNames={
        color === 'default' && !classNames
          ? {
              tabList: "gap-2 p-[6px] bg-gray-100 rounded-lg",
              cursor: "bg-secondary text-white shadow-sm rounded-md",
              tab: "px-3 py-1.5 text-sm font-normal data-[hover-unselected=true]:opacity-100 text-neutral-500",
              tabContent: "group-data-[selected=true]:text-white text-neutral-400",
            }
          : classNames ?? undefined
      }
 
      {...rest}
    >
      {children}
    </Tabs>
  );
}
