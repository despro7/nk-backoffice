import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import {
  BookOpen,
  CircleX,
  Globe,
  Headset,
  Package,
  ShieldCheck,
  Utensils,
  Wrench,
  createElement as createLucideElement,
  type IconNode,
} from 'lucide';
import { CHATWOOT_BOT_LLM_TOOLS } from '@shared/constants/chatwootBotLlmTools';

type ToolMeta = {
  label: string;
  icon: IconName;
  /** Та сама іконка для міток у contentEditable (там немає React). */
  iconNode: IconNode;
  chip: string;
  /** Коротко, що робить інструмент (поповер мітки). */
  summary: string;
};

/** Людські назви, іконки, кольори й короткі описи інструментів бота для міток у тексті інструкцій. */
export const BOT_TOOL_META: Record<string, ToolMeta> = {
  get_storefront_catalog: {
    label: 'Каталог страв',
    icon: 'utensils',
    iconNode: Utensils,
    chip: 'bg-orange-200/60 text-orange-700',
    summary: 'Страви вітрини: категорія, склад, КБЖВ, ціна, наявність. Шукає за назвою, категорією, складом.',
  },
  search_knowledge_base: {
    label: 'База знань',
    icon: 'book-open',
    iconNode: BookOpen,
    chip: 'bg-sky-200/60 text-sky-700',
    summary: 'Статті бази знань магазину: доставка, оплата, знижки, умови. Бот відповідає лише за їхніми фактами.',
  },
  get_storefront_site_pages: {
    label: 'Сторінки сайту',
    icon: 'globe',
    iconNode: Globe,
    chip: 'bg-teal-200/60 text-teal-700',
    summary: 'Текст публічних сторінок сайту (доставка, акції, FAQ), якщо в базі знань немає відповіді.',
  },
  verify_customer: {
    label: 'Перевірити клієнта',
    icon: 'shield-check',
    iconNode: ShieldCheck,
    chip: 'bg-emerald-200/60 text-emerald-700',
    summary: 'Перевірка клієнта: телефон + номер або дата замовлення. Після неї доступні склад і ТТН.',
  },
  get_verified_order: {
    label: 'Статус замовлення',
    icon: 'package',
    iconNode: Package,
    chip: 'bg-violet-200/60 text-violet-700',
    summary: 'Статус замовлення: повні дані після перевірки, лише за телефоном – короткий статус останнього.',
  },
  request_order_cancellation: {
    label: 'Скасування замовлення',
    icon: 'circle-x',
    iconNode: CircleX,
    chip: 'bg-rose-200/60 text-rose-700',
    summary: 'Скасування: телефон + прізвище й імʼя, вибір замовлення, причина; автоскасування або передача оператору.',
  },
  request_operator: {
    label: 'Передати оператору',
    icon: 'headset',
    iconNode: Headset,
    chip: 'bg-amber-200/60 text-amber-800',
    summary: 'Передача розмови людині (kind: no_answer / action / human); текст клієнту – з налаштувань «Оператор».',
  },
};

const FALLBACK_CHIP = 'bg-default-100 text-default-700';
const TOOL_NAMES = CHATWOOT_BOT_LLM_TOOLS.map((t) => t.name);
const TOOL_PATTERN = new RegExp(`\\b(${TOOL_NAMES.join('|')})\\b`, 'g');

/**
 * Мітка інструмента в тексті — як HeroUI Chip (sm, flat) з іконкою: `h-5 mx-0.5 align-middle`, лише колір свій.
 * У contentEditable React немає, тому DOM-версія повторює ці класи вручну.
 */
const CHIP_BASE =
  'relative inline-flex max-w-fit min-w-min items-center box-border whitespace-nowrap rounded-full h-5 px-1 mx-0.5 ' +
  'align-middle text-tiny cursor-pointer select-none';
const CHIP_CONTENT = 'flex-1 px-1 font-normal';

/** Поповер мітки: що робить інструмент. */
function ToolInfo({ name }: { name: string }) {
  const meta = BOT_TOOL_META[name];
  return (
    <div className="flex max-w-xs flex-col gap-1 p-1">
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex size-6 items-center justify-center rounded-full', meta?.chip ?? FALLBACK_CHIP)}>
          <DynamicIcon name={meta?.icon ?? 'wrench'} size={13} />
        </span>
        <span className="text-sm font-semibold">{meta?.label ?? name}</span>
      </div>
      <span className="font-mono text-[11px] text-default-400">{name}</span>
      {meta?.summary ? <p className="text-xs text-default-600">{meta.summary}</p> : null}
    </div>
  );
}

/** Мітка інструмента (кольорова, з іконкою); клік — поповер з описом і, за потреби, приміткою. */
export function BotToolChip({ name, note }: { name: string; note?: React.ReactNode }) {
  const meta = BOT_TOOL_META[name];
  return (
    <Popover placement="top" showArrow>
      <PopoverTrigger>
        <Button
          size="sm"
          disableRipple
          className={cn(
            'h-5 min-w-0 gap-1 rounded-full px-1.5 mx-0.5 align-middle text-tiny font-normal font-sans data-[hover=true]:opacity-80',
            meta?.chip ?? FALLBACK_CHIP,
          )}
          startContent={<DynamicIcon name={meta?.icon ?? 'wrench'} size={12} className="shrink-0" />}
        >
          {meta?.label ?? name}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <ToolInfo name={name} />
        {note ? <p className="max-w-xs px-1 pb-1 text-xs text-default-500">{note}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

/** Текст з назвами інструментів як кольоровими мітками (лише перегляд); клік по мітці — опис інструмента. */
export function InstructionPreview({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOOL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    nodes.push(<BotToolChip key={`${index}-${match[1]}`} name={match[1]} />);
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <p className="text-xs text-default-500 whitespace-pre-wrap leading-relaxed font-mono">{nodes}</p>;
}

function chipElement(name: string): HTMLSpanElement {
  const meta = BOT_TOOL_META[name];
  const span = document.createElement('span');
  span.contentEditable = 'false';
  span.dataset.tool = name;
  span.className = cn(CHIP_BASE, meta?.chip ?? FALLBACK_CHIP);
  const icon = createLucideElement(meta?.iconNode ?? Wrench);
  icon.setAttribute('width', '12');
  icon.setAttribute('height', '12');
  icon.classList.add('shrink-0', 'ms-0.5');
  const label = document.createElement('span');
  label.className = CHIP_CONTENT;
  label.textContent = meta?.label ?? name;
  span.append(icon, label);
  return span;
}

/** Текст (назви інструментів як є) → вміст редактора з мітками. */
function renderInto(root: HTMLElement, text: string): void {
  root.replaceChildren();
  let last = 0;
  for (const match of text.matchAll(TOOL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) root.append(document.createTextNode(text.slice(last, index)));
    root.append(chipElement(match[1]));
    last = index + match[0].length;
  }
  if (last < text.length) root.append(document.createTextNode(text.slice(last)));
}

/** Чи є в тексті редактора назви інструментів, ще не перетворені на мітки (після вставки). */
function hasPlainToolNames(root: HTMLElement): boolean {
  return [...root.childNodes].some(
    (n) => n.nodeType === Node.TEXT_NODE && new RegExp(TOOL_PATTERN.source).test(n.textContent ?? ''),
  );
}

/** Вміст редактора → текст для бота: мітка → назва інструмента. */
function serialize(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? '';
    } else if (child instanceof HTMLElement) {
      if (child.dataset.tool) out += child.dataset.tool;
      else if (child.tagName === 'BR') out += '\n';
      else {
        if (out && !out.endsWith('\n')) out += '\n';
        out += serialize(child);
      }
    }
  });
  return out;
}

type ToolMenu = {
  x: number;
  y: number;
  query: string;
  active: number;
  /** Діапазон, який замінить мітка: «@запит» або позиція курсора. */
  range: Range | null;
};

function filteredTools(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOL_NAMES;
  return TOOL_NAMES.filter((name) => name.includes(q) || (BOT_TOOL_META[name]?.label ?? '').toLowerCase().includes(q));
}

/**
 * Поле інструкції для бота з інструментами-мітками прямо в тексті. Вставити інструмент:
 * «@» + назва, правий клік або кнопка «Інструмент». Модель отримує текст із технічними назвами.
 */
export function InstructionEditor({
  value,
  onChange,
  label,
  ariaLabel,
  headerExtra,
  context,
  minRows = 3,
  description,
  highlighted,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: React.ReactNode;
  ariaLabel?: string;
  /** Поряд з назвою в одному рядку (ключ, «змінено», скидання). */
  headerExtra?: React.ReactNode;
  /** Під назвою: коли й де бот отримує цей текст. */
  context?: React.ReactNode;
  minRows?: number;
  maxRows?: number;
  maxLength?: number;
  description?: string;
  highlighted?: boolean;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [menu, setMenu] = useState<ToolMenu | null>(null);
  const [focused, setFocused] = useState(false);
  /** Клік по мітці в полі — поповер з описом інструмента. */
  const [chipInfo, setChipInfo] = useState<{ name: string; x: number; y: number } | null>(null);

  // Зовнішня зміна значення (завантаження, скидання) — перебудувати вміст; власний ввід не чіпаємо.
  useLayoutEffect(() => {
    const root = editorRef.current;
    if (!root || value === lastValue.current) return;
    renderInto(root, value);
    lastValue.current = value;
  }, [value]);

  const emit = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const text = serialize(root);
    lastValue.current = text;
    onChange(text);
  }, [onChange]);

  const rememberSelection = () => {
    const sel = window.getSelection();
    const root = editorRef.current;
    if (sel && sel.rangeCount > 0 && root?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
  };

  const caretRange = (): Range => {
    const root = editorRef.current!;
    if (savedRange.current && root.contains(savedRange.current.startContainer)) return savedRange.current.cloneRange();
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    return range;
  };

  const insertTool = (name: string, range: Range | null) => {
    const root = editorRef.current;
    if (!root) return;
    const target = range ?? caretRange();
    target.deleteContents();
    const chip = chipElement(name);
    const space = document.createTextNode(' ');
    target.insertNode(space);
    target.insertNode(chip);
    const sel = window.getSelection();
    const after = document.createRange();
    after.setStart(space, 1);
    after.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(after);
    savedRange.current = after.cloneRange();
    setMenu(null);
    root.focus();
    emit();
  };

  /** Після вводу: «@запит» перед курсором відкриває / фільтрує меню інструментів. */
  const detectMention = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return setMenu(null);
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !editorRef.current?.contains(node)) return setMenu(null);
    const before = (node.textContent ?? '').slice(0, sel.anchorOffset);
    const match = before.match(/(?:^|\s)@([\p{L}_]{0,30})$/u);
    if (!match) return setMenu(null);
    const range = document.createRange();
    range.setStart(node, sel.anchorOffset - match[1].length - 1);
    range.setEnd(node, sel.anchorOffset);
    const rect = range.getBoundingClientRect();
    setMenu((prev) => ({
      x: rect.left,
      y: rect.bottom + 4,
      query: match[1],
      active: prev && prev.query === match[1] ? prev.active : 0,
      range,
    }));
  };

  const options = menu ? filteredTools(menu.query) : [];

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (menu && options.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setMenu({ ...menu, active: (menu.active + delta + options.length) % options.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertTool(options[menu.active] ?? options[0], menu.range);
        return;
      }
    }
    if (menu && e.key === 'Escape') {
      e.preventDefault();
      setMenu(null);
      return;
    }
    if (e.key === 'Enter') {
      // Новий рядок як «\n» у тексті, без <div> браузера.
      e.preventDefault();
      document.execCommand('insertText', false, '\n');
    }
  };

  // Клік поза меню / поповером закриває їх.
  useEffect(() => {
    if (!menu && !chipInfo) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-tool-menu]')) setMenu(null);
      if (!target.closest('[data-tool-info]') && !target.closest('[data-tool]')) setChipInfo(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu, chipInfo]);

  const minHeight = `${minRows * 1.625 + 1}rem`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 min-h-8">
        {label ? <span className="text-sm font-semibold">{label}</span> : null}
        {headerExtra}
      </div>
      {context ? <div className="-mt-1 text-xs leading-relaxed text-default-500">{context}</div> : null}
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ minHeight }}
        className={cn(
          'rounded-medium bg-default-100 px-3 py-2 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words outline-none transition-colors',
          'border border-transparent hover:bg-default-50 hover:border-primary-500/30 focus:bg-default-50 focus:border-primary-500/30',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-default-400',
          highlighted && 'border-warning-300 bg-warning-50/50',
        )}
        onInput={() => {
          emit();
          detectMention();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onClick={(e) => {
          const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]');
          if (!chip?.dataset.tool) return setChipInfo(null);
          const rect = chip.getBoundingClientRect();
          setChipInfo({ name: chip.dataset.tool, x: rect.left, y: rect.bottom + 6 });
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          rememberSelection();
          setFocused(false);
          // Назви інструментів, вставлені текстом (paste), стають мітками.
          if (editorRef.current && hasPlainToolNames(editorRef.current)) {
            renderInto(editorRef.current, lastValue.current ?? value);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          rememberSelection();
          const sel = window.getSelection();
          const range = sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
          setMenu({ x: e.clientX, y: e.clientY, query: '', active: 0, range });
        }}
      />
      
      <p className="text-xs text-default-400">
        &nbsp;
        {description ? `${description} ` : ''}
        {focused ? 'Інструмент: «@» + назва або правий клік.' : ''}
      </p>
    
      {chipInfo &&
        createPortal(
          <div
            data-tool-info
            className="fixed z-50 rounded-medium border border-default-200 bg-content1 p-2 shadow-lg"
            style={{ left: Math.min(chipInfo.x, window.innerWidth - 340), top: Math.min(chipInfo.y, window.innerHeight - 160) }}
          >
            <ToolInfo name={chipInfo.name} />
          </div>,
          document.body,
        )}
      {menu && options.length > 0 && createPortal(
        <div
          data-tool-menu
          role="listbox"
          aria-label="Вставити інструмент"
          className="fixed z-50 w-64 rounded-medium border border-default-200 bg-content1 p-1 shadow-lg"
          style={{ left: Math.min(menu.x, window.innerWidth - 272), top: Math.min(menu.y, window.innerHeight - 300) }}
        >
          {options.map((name, index) => {
            const meta = BOT_TOOL_META[name];
            return (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={index === menu.active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertTool(name, menu.range);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-small px-2 py-1.5 text-left text-sm',
                  index === menu.active ? 'bg-default-100' : 'hover:bg-default-50',
                )}
              >
                <span className={cn('inline-flex size-6 items-center justify-center rounded-full', meta?.chip ?? FALLBACK_CHIP)}>
                  <DynamicIcon name={meta?.icon ?? 'wrench'} size={13} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{meta?.label ?? name}</span>
                  <span className="block truncate font-mono text-[11px] text-default-400">{name}</span>
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

