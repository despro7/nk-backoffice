import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, cn } from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { CHATWOOT_BOT_LLM_TOOLS } from '@shared/constants/chatwootBotLlmTools';

/** Людські назви, іконки й кольори інструментів бота для міток у тексті інструкцій. */
export const BOT_TOOL_META: Record<string, { label: string; icon: IconName; chip: string }> = {
  get_storefront_catalog: { label: 'Каталог страв', icon: 'utensils', chip: 'bg-orange-100 text-orange-700' },
  search_knowledge_base: { label: 'База знань', icon: 'book-open', chip: 'bg-sky-100 text-sky-700' },
  get_storefront_site_pages: { label: 'Сторінки сайту', icon: 'globe', chip: 'bg-teal-100 text-teal-700' },
  verify_customer: { label: 'Перевірити клієнта', icon: 'shield-check', chip: 'bg-emerald-100 text-emerald-700' },
  get_verified_order: { label: 'Статус замовлення', icon: 'package', chip: 'bg-violet-100 text-violet-700' },
  request_order_cancellation: { label: 'Скасування замовлення', icon: 'circle-x', chip: 'bg-rose-100 text-rose-700' },
  request_operator: { label: 'Передати оператору', icon: 'headset', chip: 'bg-amber-100 text-amber-800' },
};

const FALLBACK_CHIP = 'bg-default-100 text-default-700';
const TOOL_NAMES = CHATWOOT_BOT_LLM_TOOLS.map((t) => t.name);
const TOOL_PATTERN = new RegExp(`\\b(${TOOL_NAMES.join('|')})\\b`, 'g');

/** Мітка інструмента всередині тексту: однаковий вигляд у редакторі (DOM) і в перегляді (React). */
const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-full px-2 mx-0.5 text-[13px] leading-6 font-medium align-baseline select-none ' +
  "before:content-[''] before:size-1.5 before:rounded-full before:bg-current before:opacity-70";

/** Текст з назвами інструментів як кольоровими мітками (лише перегляд). */
export function InstructionPreview({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOOL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const meta = BOT_TOOL_META[match[1]];
    nodes.push(
      <span key={`${index}-${match[1]}`} title={match[1]} className={cn(CHIP_CLASS, meta?.chip ?? FALLBACK_CHIP)}>
        {meta?.label ?? match[1]}
      </span>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <p className="text-sm text-default-700 whitespace-pre-wrap leading-7">{nodes}</p>;
}

function chipElement(name: string): HTMLSpanElement {
  const meta = BOT_TOOL_META[name];
  const span = document.createElement('span');
  span.contentEditable = 'false';
  span.dataset.tool = name;
  span.title = name;
  span.className = cn(CHIP_CLASS, meta?.chip ?? FALLBACK_CHIP);
  span.textContent = meta?.label ?? name;
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

  // Клік поза меню закриває його.
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-tool-menu]')) setMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const minHeight = `${minRows * 1.75 + 1}rem`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 min-h-8">
        {label ? <span className="text-sm font-medium">{label}</span> : null}
        {headerExtra}
        <Button
          size="sm"
          variant="light"
          className="ml-auto shrink-0"
          startContent={<DynamicIcon name="wrench" size={14} />}
          onPress={(e) => {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom + 4, query: '', active: 0, range: null });
          }}
        >
          Інструмент
        </Button>
      </div>
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
          'rounded-medium bg-default-100 px-3 py-2 text-sm leading-7 text-foreground whitespace-pre-wrap break-words outline-none transition-colors',
          'hover:bg-default-200 focus:bg-default-100 focus:ring-2 focus:ring-focus',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-default-400',
          highlighted && 'ring-1 ring-warning-300',
        )}
        onInput={() => {
          emit();
          detectMention();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
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
      {description || focused ? (
        <p className="text-xs text-default-400">
          {description ? `${description} ` : ''}
          {focused ? 'Інструмент: «@» + назва або правий клік.' : ''}
        </p>
      ) : null}
      {menu && options.length > 0 && (
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
        </div>
      )}
    </div>
  );
}

