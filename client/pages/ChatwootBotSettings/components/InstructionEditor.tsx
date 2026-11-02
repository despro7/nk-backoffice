import React, { useRef } from 'react';
import { Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Textarea } from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { CHATWOOT_BOT_LLM_TOOLS } from '@shared/constants/chatwootBotLlmTools';

/** Людські назви й іконки інструментів бота для міток у тексті інструкцій. */
export const BOT_TOOL_META: Record<string, { label: string; icon: IconName }> = {
  get_storefront_catalog: { label: 'Каталог страв', icon: 'utensils' },
  search_knowledge_base: { label: 'База знань', icon: 'book-open' },
  get_storefront_site_pages: { label: 'Сторінки сайту', icon: 'globe' },
  verify_customer: { label: 'Перевірити клієнта', icon: 'shield-check' },
  get_verified_order: { label: 'Статус замовлення', icon: 'package' },
  request_order_cancellation: { label: 'Скасування замовлення', icon: 'circle-x' },
  request_operator: { label: 'Передати оператору', icon: 'headset' },
};

const TOOL_NAMES = CHATWOOT_BOT_LLM_TOOLS.map((t) => t.name);
const TOOL_PATTERN = new RegExp(`\\b(${TOOL_NAMES.join('|')})\\b`, 'g');

/** Текст з назвами інструментів як мітками (людська назва + іконка, технічна — у підказці). */
export function InstructionPreview({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOOL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const meta = BOT_TOOL_META[match[1]];
    nodes.push(
      <Chip
        key={`${index}-${match[1]}`}
        size="sm"
        variant="flat"
        color="primary"
        title={match[1]}
        className="h-5 mx-0.5 align-middle"
        startContent={<DynamicIcon name={meta?.icon ?? 'wrench'} size={12} />}
      >
        {meta?.label ?? match[1]}
      </Chip>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <p className="text-sm text-default-700 whitespace-pre-wrap leading-7">{nodes}</p>;
}

/**
 * Поле інструкції для бота: кнопка «Інструмент» вставляє назву інструмента в позицію курсора,
 * під полем — як це прочитає людина (інструменти мітками). Модель отримує текст як є.
 */
export function InstructionEditor({
  value,
  onChange,
  label,
  ariaLabel,
  minRows = 3,
  maxRows = 14,
  maxLength,
  description,
  highlighted,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
  minRows?: number;
  maxRows?: number;
  maxLength?: number;
  description?: string;
  highlighted?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const hasTools = TOOL_NAMES.some((name) => value.includes(name));

  const insertTool = (name: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const next = `${before}${pad}${name} ${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      const caret = before.length + pad.length + name.length + 1;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        {label ? <span className="text-sm font-medium flex-1">{label}</span> : <span className="flex-1" />}
        <Dropdown>
          <DropdownTrigger>
            <Button size="sm" variant="light" startContent={<DynamicIcon name="wrench" size={14} />}>
              Інструмент
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Вставити інструмент" onAction={(key) => insertTool(String(key))}>
            {TOOL_NAMES.map((name) => (
              <DropdownItem
                key={name}
                description={name}
                startContent={<DynamicIcon name={BOT_TOOL_META[name]?.icon ?? 'wrench'} size={14} />}
              >
                {BOT_TOOL_META[name]?.label ?? name}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      </div>
      <Textarea
        ref={ref}
        aria-label={ariaLabel ?? label}
        minRows={minRows}
        maxRows={maxRows}
        maxLength={maxLength}
        value={value}
        onValueChange={onChange}
        description={description}
        placeholder={placeholder}
        classNames={{ inputWrapper: highlighted ? 'ring-1 ring-warning-300' : undefined }}
      />
      {hasTools && (
        <div className="rounded-md bg-default-50 px-3 py-1">
          <InstructionPreview text={value} />
        </div>
      )}
    </div>
  );
}
