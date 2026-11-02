import React, { useMemo, useState } from 'react';
import { Accordion, AccordionItem, Button, Chip, Input, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  CHATWOOT_BOT_INSTRUCTION_GROUPS,
  CHATWOOT_BOT_INSTRUCTION_MAX_LENGTH,
  CHATWOOT_BOT_INSTRUCTIONS,
  type ChatwootBotInstructionGroup,
} from '@shared/constants/chatwootBotInstructions';
import { SettingsCard, type SettingsCardProps } from './SettingsCard';
import { InstructionEditor } from '../components/InstructionEditor';

const GROUP_ORDER = Object.keys(CHATWOOT_BOT_INSTRUCTION_GROUPS) as ChatwootBotInstructionGroup[];

/**
 * Тексти, які бот отримує від коду: правила поверх маски, описи інструментів, підказки в їхніх відповідях.
 * Порожнє / стандартне значення не зберігається — діє текст за замовчуванням з коду.
 */
export function AiInstructionsCard({ page }: SettingsCardProps) {
  const { form, updateField, setActiveTab } = page;
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();

  const byGroup = useMemo(() => {
    const map = new Map<ChatwootBotInstructionGroup, typeof CHATWOOT_BOT_INSTRUCTIONS[number][]>();
    for (const item of CHATWOOT_BOT_INSTRUCTIONS) {
      const text = form?.aiInstructions[item.key] ?? item.defaultText;
      if (needle && ![item.label, item.key, text].some((t) => t.toLowerCase().includes(needle))) continue;
      map.set(item.group, [...(map.get(item.group) ?? []), item]);
    }
    return map;
  }, [form?.aiInstructions, needle]);

  if (!form) return null;
  const overrides = form.aiInstructions;
  const changedTotal = Object.keys(overrides).length;

  /** `null` — скинути. Порожнє поле тримаємо до збереження (щоб можна було переписати з нуля); сервер його відкине. */
  const setText = (key: string, defaultText: string, value: string | null) => {
    const next = { ...overrides };
    if (value == null || value.trim() === defaultText) delete next[key];
    else next[key] = value;
    updateField('aiInstructions', next);
  };

  return (
    <SettingsCard
      icon="scroll-text"
      title="Інструкції для AI"
      headerEnd={
        changedTotal > 0 ? (
          <Button
            size="sm"
            variant="light"
            color="danger"
            startContent={<DynamicIcon name="rotate-ccw" size={14} />}
            onPress={() => updateField('aiInstructions', {})}
          >
            Скинути всі ({changedTotal})
          </Button>
        ) : null
      }
    >
      <p className="text-xs text-default-500">
        Що бот отримує від коду поверх маски: обовʼязкові правила, описи інструментів і підказки, які інструменти
        повертають на кожному кроці. Змінене поле позначене; порожнє після збереження – стандартний текст. Перевірити до збереження –{' '}
        <button type="button" className="text-primary underline" onClick={() => setActiveTab('sandbox')}>
          Пісочниця
        </button>
        . Назви інструментів (request_operator тощо) і значення на кшталт <span className="font-mono">kind: action</span>{' '}
        лишайте як є – код на них розраховує.
      </p>
      <Input
        size="sm"
        isClearable
        aria-label="Пошук інструкції"
        placeholder="Пошук за назвою або текстом…"
        startContent={<DynamicIcon name="search" size={14} className="text-default-400" />}
        value={search}
        onValueChange={setSearch}
        onClear={() => setSearch('')}
      />
      <Accordion
        selectionMode="multiple"
        variant="splitted"
        className="px-0"
        itemClasses={{
          base: 'shadow-none border border-default-200',
          title: 'text-base font-semibold text-default-900',
          subtitle: 'text-xs text-default-500',
          trigger: 'py-3',
        }}
      >
        {GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => {
          const items = byGroup.get(group) ?? [];
          const changed = items.filter((i) => overrides[i.key] != null).length;
          return (
            <AccordionItem
              key={group}
              title={
                <span className="flex items-center gap-2">
                  {CHATWOOT_BOT_INSTRUCTION_GROUPS[group].title}
                  <Chip size="sm" variant="flat" className="h-5">
                    {items.length}
                  </Chip>
                  {changed > 0 && (
                    <Chip size="sm" variant="flat" color="warning" className="h-5">
                      змінено: {changed}
                    </Chip>
                  )}
                </span>
              }
              subtitle={CHATWOOT_BOT_INSTRUCTION_GROUPS[group].description}
            >
              <div className="flex flex-col divide-y divide-default-200 pb-2">
                {items.map((item) => {
                  const isChanged = overrides[item.key] != null;
                  return (
                    <div key={item.key} className="py-4 first:pt-1">
                      <InstructionEditor
                        label={item.label}
                        ariaLabel={item.label}
                        headerExtra={
                          <>
                            <span className="font-mono text-[11px] text-default-400">{item.key}</span>
                            {isChanged && (
                              <>
                                <Chip size="sm" variant="flat" color="warning" className="h-5">
                                  змінено
                                </Chip>
                                <Tooltip content="Повернути стандартний текст" placement="top">
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    className="h-7 w-7 min-w-7"
                                    aria-label={`Скинути «${item.label}»`}
                                    onPress={() => setText(item.key, item.defaultText, null)}
                                  >
                                    <DynamicIcon name="rotate-ccw" size={14} />
                                  </Button>
                                </Tooltip>
                              </>
                            )}
                          </>
                        }
                        minRows={2}
                        maxLength={CHATWOOT_BOT_INSTRUCTION_MAX_LENGTH}
                        value={overrides[item.key] ?? item.defaultText}
                        onChange={(v) => setText(item.key, item.defaultText, v)}
                        highlighted={isChanged}
                      />
                    </div>
                  );
                })}
              </div>
            </AccordionItem>
          );
        })}
      </Accordion>
      {byGroup.size === 0 && <p className="text-sm text-default-400">Нічого не знайдено.</p>}
    </SettingsCard>
  );
}
