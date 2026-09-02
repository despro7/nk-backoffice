import type { ReactNode } from 'react';
import { Button, Tab, Tabs } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  CONSTRUCTOR_TAB_LABELS,
  type ConstructorTabKey,
} from './constructorTypes';

interface ReportConstructorPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  tab: ConstructorTabKey;
  onTabChange: (tab: ConstructorTabKey) => void;
  selection: ReactNode;
  grouping: ReactNode;
  columns: ReactNode;
  collapsedChips?: ReactNode;
  headerExtra?: ReactNode;
  title?: string;
}

export default function ReportConstructorPanel({
  isOpen,
  onToggle,
  tab,
  onTabChange,
  selection,
  grouping,
  columns,
  collapsedChips,
  headerExtra,
  title = 'Конструктор звітів',
}: ReportConstructorPanelProps) {
  return (
    <div className="bg-white rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-default-800">{title}</h2>
            {headerExtra}
          </div>
          {!isOpen && collapsedChips ? (
            <div className="mt-2 flex flex-wrap gap-1.5">{collapsedChips}</div>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="flat"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Згорнути конструктор' : 'Розгорнути конструктор'}
          onPress={onToggle}
          startContent={<DynamicIcon name={isOpen ? 'chevron-up' : 'sliders-horizontal'} size={16} />}
        >
          {isOpen ? 'Згорнути' : 'Налаштувати'}
        </Button>
      </div>

      {isOpen ? (
        <Tabs
          size="md"
          color="secondary"
          aria-label="Вкладки конструктора"
          selectedKey={tab}
          onSelectionChange={(key) => onTabChange(key as ConstructorTabKey)}
          classNames={{
            base: 'mt-4',
            panel: 'pt-4',
          }}
        >
          <Tab key="selection" title={CONSTRUCTOR_TAB_LABELS.selection}>
            {selection}
          </Tab>
          <Tab key="grouping" title={CONSTRUCTOR_TAB_LABELS.grouping}>
            {grouping}
          </Tab>
          <Tab key="columns" title={CONSTRUCTOR_TAB_LABELS.columns}>
            {columns}
          </Tab>
        </Tabs>
      ) : null}
    </div>
  );
}
