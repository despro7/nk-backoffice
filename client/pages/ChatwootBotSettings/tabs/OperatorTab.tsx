import React, { useState } from 'react';
import { Chip, Tab, Tabs } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
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

/**
 * Спільне (виклик, розклад) зверху; поведінка, що залежить від часу, — у вкладках «Робочі години» /
 * «Поза годинами», щоб тексти й правила двох станів не змішувались.
 */
export function OperatorTab({ page }: SettingsCardProps) {
  const inHoursNow = page.inboxHours ? chatwootScheduleState(page.inboxHours.schedule).inHours : null;
  const [stateTab, setStateTab] = useState<OperatorStateTab>(() => (inHoursNow === false ? 'out_of_hours' : 'in_hours'));

  const title = (icon: 'sun' | 'moon' | 'rotate-ccw', label: string, current: boolean) => (
    <div className="flex items-center gap-2">
      <DynamicIcon name={icon} size={16} />
      <span>{label}</span>
      {current && (
        <Chip size="sm" variant="flat" color="success" className="h-5">
          зараз
        </Chip>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <SettingsColumns left={<OperatorCallCard page={page} />} right={<WorkingHoursCard page={page} />} />

      <Tabs
        aria-label="Стан робочих годин"
        variant="underlined"
        selectedKey={stateTab}
        onSelectionChange={(key) => setStateTab(key as OperatorStateTab)}
        classNames={{ tabList: 'gap-6 max-w-full overflow-x-auto', panel: 'px-0 pt-4' }}
      >
        <Tab key="in_hours" title={title('sun', 'Робочі години', inHoursNow === true)}>
          <SettingsColumns
            left={<InHoursMessagesCard page={page} />}
            right={
              <p className="text-sm text-default-500">
                Оператори на звʼязку: бот одразу призначає людину (ключові слова або сам, коли не знайшов відповіді) і
                більше не відповідає в розмові. Повернення розмови боту, якщо оператор мовчить, – вкладка «Reclaim».
              </p>
            }
          />
        </Tab>
        <Tab key="out_of_hours" title={title('moon', 'Поза годинами', inHoursNow === false)}>
          <SettingsColumns left={<OutOfHoursMessagesCard page={page} />} right={<EmergencyCard page={page} />} />
        </Tab>
        <Tab key="reclaim" title={title('rotate-ccw', 'Reclaim', false)}>
          <div className="max-w-3xl">
            <ReclaimCard page={page} />
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}
