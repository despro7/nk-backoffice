import React, { useLayoutEffect, useRef, useState } from 'react';
import { Chip, Tab, Tabs } from '@heroui/react';
import { Moon, RotateCcw, Sun, type LucideIcon } from 'lucide-react';
import { chatwootScheduleState } from '@shared/utils/chatwootInboxScheduleNext';
import {
  EmergencyCard,
  InHoursMessagesCard,
  OperatorCallCard,
  OutOfHoursMessagesCard,
  ReclaimCard,
  WorkingHoursCard,
} from '../cards/OperatorCards';
import { SettingsColumns, type SettingsCardProps } from '../cards/SettingsCard';

type OperatorStateTab = 'in_hours' | 'out_of_hours' | 'reclaim';

const TAB_ICONS: Record<'sun' | 'moon' | 'rotate-ccw', LucideIcon> = {
  sun: Sun,
  moon: Moon,
  'rotate-ccw': RotateCcw,
};

/**
 * Спільне (виклик, розклад) зверху; поведінка, що залежить від часу, — у вкладках «Робочі години» /
 * «Поза годинами», щоб тексти й правила двох станів не змішувались.
 */
export function OperatorTab({ page }: SettingsCardProps) {
  const inHoursNow = page.inboxHours ? chatwootScheduleState(page.inboxHours.schedule).inHours : null;
  const [stateTab, setStateTab] = useState<OperatorStateTab>(() => (inHoursNow === false ? 'out_of_hours' : 'in_hours'));
  const tabsRef = useRef<HTMLDivElement>(null);

  // HeroUI cursor вимірює вкладку лише при mount/зміні selectedKey; після зміни ширини title підтягуємо cursor вручну.
  useLayoutEffect(() => {
    const tabList = tabsRef.current;
    if (!tabList) return;

    const syncCursor = () => {
      const cursor = tabList.querySelector<HTMLElement>('[data-slot="cursor"]');
      const selected = tabList.querySelector<HTMLElement>('[role="tab"][data-selected="true"]');
      if (!cursor || !selected) return;
      cursor.style.transition = 'none';
      cursor.style.left = `${selected.offsetLeft}px`;
      cursor.style.top = `${selected.offsetTop}px`;
      cursor.style.width = `${selected.offsetWidth}px`;
      cursor.style.height = `${selected.offsetHeight}px`;
      requestAnimationFrame(() => {
        cursor.style.transition = '';
      });
    };

    syncCursor();
    const ro = new ResizeObserver(() => syncCursor());
    tabList.querySelectorAll('[data-slot="tab"]').forEach((node) => ro.observe(node));

    return () => ro.disconnect();
  }, [stateTab, inHoursNow]);

  const title = (icon: keyof typeof TAB_ICONS, label: string, current: boolean) => {
    const Icon = TAB_ICONS[icon];
    return (
      <div className="flex items-center gap-2">
        <Icon size={16} aria-hidden />
        <span>{label}</span>
        {current && (
          <Chip size="sm" variant="flat" color="success" className="h-5 bg-lime-500/40 text-lime-700">
            зараз
          </Chip>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsColumns left={<OperatorCallCard page={page} />} right={<WorkingHoursCard page={page} />} />

      <Tabs
        ref={tabsRef}
        aria-label="Стан робочих годин"
        variant="bordered"
        selectedKey={stateTab}
        onSelectionChange={(key) => setStateTab(key as OperatorStateTab)}
        classNames={{
          tabList: 'max-w-full overflow-x-auto bg-content1 rounded-lg p-1.5 shadow-none',
          panel: 'px-0 pt-0'
        }}
      >
        <Tab key="in_hours" title={title('sun', 'Робочі години', inHoursNow === true)}>
          <SettingsColumns
            left={<InHoursMessagesCard page={page} />}
            right={
              <p className="text-sm text-default-500 bg-content1/50 rounded-lg p-4 shadow">
                Оператори на звʼязку: бот одразу призначає людину (ключові слова або сам, коли не знайшов відповіді) і
                більше не відповідає в розмові. Повернення розмови боту, якщо оператор мовчить, – вкладка «Reclaim».
              </p>}
          />
        </Tab>
        <Tab key="out_of_hours" title={title('moon', 'Поза годинами', inHoursNow === false)}>
          <SettingsColumns
            left={<OutOfHoursMessagesCard page={page} />}
            right={<EmergencyCard page={page} />}
          />
        </Tab>
        <Tab key="reclaim" title={title('rotate-ccw', 'Reclaim', false)}>
          <SettingsColumns 
            left={<ReclaimCard page={page} />} 
            right={<p className="text-sm text-default-500 bg-content1/50 rounded-lg p-4 shadow">
              Якщо оператор мовчить, бот перехоплює розмову і продовжує розмову за своїм алгоритмом.
            </p>}
          />
        </Tab>
      </Tabs>
    </div>
  );
}
