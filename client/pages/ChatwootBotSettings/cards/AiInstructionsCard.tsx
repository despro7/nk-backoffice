import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Accordion, AccordionItem, Button, Chip, Input, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CHATWOOT_BOT_INSTRUCTION_GROUPS,
  CHATWOOT_BOT_INSTRUCTION_MAX_LENGTH,
  CHATWOOT_BOT_INSTRUCTIONS,
  type ChatwootBotInstructionGroup,
} from '@shared/constants/chatwootBotInstructions';
import { SettingsCard, type SettingsCardProps } from './SettingsCard';
import { InstructionEditor, InstructionPreview } from '../components/InstructionEditor';

const GROUP_ORDER = Object.keys(CHATWOOT_BOT_INSTRUCTION_GROUPS) as ChatwootBotInstructionGroup[];

/** Нові перевизначення: `null` або стандартний текст — прибрати ключ. Порожнє поле тримаємо до збереження (сервер його відкине). */
export function withInstructionText(
  overrides: Record<string, string>,
  key: string,
  defaultText: string,
  value: string | null,
): Record<string, string> {
  const next = { ...overrides };
  if (value == null || value.trim() === defaultText) delete next[key];
  else next[key] = value;
  return next;
}

/**
 * Тексти, які бот отримує від коду: правила поверх маски, описи інструментів, підказки в їхніх відповідях.
 * Порожнє / стандартне значення не зберігається — діє текст за замовчуванням з коду.
 */
export function AiInstructionsCard({ page }: SettingsCardProps) {
  const { form, updateField, setActiveTab } = page;
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();

  // «Редагувати в налаштуваннях» з журналу діалогів: одразу знайти інструкцію за ключем.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const key = (location.state as { instructionSearch?: string } | null)?.instructionSearch;
    if (!key) return;
    setSearch(key);
    navigate(`${location.pathname}${location.hash}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.hash, navigate]);

  const overridesRef = useRef(form?.aiInstructions);
  overridesRef.current = form?.aiInstructions;

  /**
   * Збіги рахуємо лише при зміні запиту: інструкція, яку редагують, лишається у видачі,
   * навіть коли її новий текст уже не містить запиту.
   */
  const matchedKeys = useMemo(() => {
    if (!needle) return null;
    const overrides = overridesRef.current ?? {};
    return new Set(
      CHATWOOT_BOT_INSTRUCTIONS.filter((item) =>
        [item.label, item.key, overrides[item.key] ?? item.defaultText].some((t) => t.toLowerCase().includes(needle)),
      ).map((item) => item.key),
    );
  }, [needle]);

  const byGroup = useMemo(() => {
    const map = new Map<ChatwootBotInstructionGroup, typeof CHATWOOT_BOT_INSTRUCTIONS[number][]>();
    for (const item of CHATWOOT_BOT_INSTRUCTIONS) {
      if (matchedKeys && !matchedKeys.has(item.key)) continue;
      map.set(item.group, [...(map.get(item.group) ?? []), item]);
    }
    return map;
  }, [matchedKeys]);

  // Під час пошуку розкриті групи зі збігами; після очищення — ті, що були розкриті до пошуку.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const beforeSearchRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (matchedKeys) {
      setExpanded((prev) => {
        beforeSearchRef.current ??= prev;
        return new Set(byGroup.keys());
      });
    } else if (beforeSearchRef.current) {
      setExpanded(beforeSearchRef.current);
      beforeSearchRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedKeys]);

  if (!form) return null;
  const overrides = form.aiInstructions;
  const changedTotal = Object.keys(overrides).length;

  /** `null` — скинути. */
  const setText = (key: string, defaultText: string, value: string | null) =>
    updateField('aiInstructions', withInstructionText(overrides, key, defaultText, value));

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
            className="-my-0.5"
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
        selectedKeys={expanded}
        onSelectionChange={(keys) => setExpanded(new Set(keys === 'all' ? GROUP_ORDER : (keys as Set<string>)))}
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
              <div className="flex flex-col divide-y divide-default-200">
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
                        context={<InstructionPreview text={item.usage} />}
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
