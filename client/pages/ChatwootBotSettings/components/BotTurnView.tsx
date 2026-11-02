import React, { useEffect, useState } from 'react';
import { Avatar, Button, Chip, Popover, PopoverContent, PopoverTrigger, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useNavigate } from 'react-router-dom';
import type { LlmTestModelResponse } from '@shared/types/llm';
import type { ChatwootBotSandboxVerifyState } from '@shared/types/chatwootBotSandbox';
import {
  CHATWOOT_BOT_INSTRUCTION_MAX_LENGTH,
  CHATWOOT_BOT_INSTRUCTIONS,
  botInstruction,
} from '@shared/constants/chatwootBotInstructions';
import type { ChatwootBotKnowledgeEntry } from '@shared/types/chatwootBotKnowledge';
import { PERMISSIONS } from '@shared/constants/permissions';
import { chatwootKnowledgeApi } from '@/services/ChatwootKnowledgeService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { ToastService } from '@/services/ToastService';
import { KnowledgeEntryDrawer } from '@/pages/ChatwootBotKnowledge/KnowledgeEntryDrawer';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';
import { InstructionEditor, InstructionPreview } from './InstructionEditor';
import { withInstructionText } from '../cards/AiInstructionsCard';

/** Спільне для пісочниці й журналу «Діалоги бота»: бульбашки, мітки ходу, trace інструментів. */

export type TurnBadge = { label: string; color: 'success' | 'primary' | 'warning' | 'danger' | 'default' | 'secondary' };

/** Відкрити статтю бази знань на редагування або нову з питанням; `undefined` — немає права керувати базою. */
export type OpenArticle = ((target: { id: number } | { question: string }) => void) | undefined;

/**
 * Як редагувати інструкції з кроку: `page` — у формі налаштувань (пісочниця, незбережені зміни);
 * `overrides` — лише показати збіги й відкрити вкладку AI (журнал діалогів).
 */
export type InstructionSource =
  | { kind: 'form'; page: ChatwootBotSettingsPageModel }
  | { kind: 'link'; overrides: Record<string, string> }
  | null;

type LlmMeta = Omit<LlmTestModelResponse, 'reply'>;
type InstructionDef = (typeof CHATWOOT_BOT_INSTRUCTIONS)[number];

const VERIFY_ATTEMPT_LABEL: Record<NonNullable<ChatwootBotSandboxVerifyState['attempt']>, string> = {
  ok: 'пройдено повідомленням',
  mismatch: 'дані не збіглися',
  ambiguous: 'кілька замовлень',
  rate_limited: 'ліміт спроб',
  invalid_input: 'не розпізнано',
};

/** Стан верифікації після ходу: скільки замовлень відкрито і чим закінчилась автоперевірка повідомлення. */
function VerifyChip({ verify, tooltip }: { verify: ChatwootBotSandboxVerifyState; tooltip: string }) {
  const verified = verify.verifiedOrders > 0;
  const parts = [
    verified ? `верифіковано (${verify.verifiedOrders})` : 'не верифіковано',
    verify.attempt ? VERIFY_ATTEMPT_LABEL[verify.attempt] : null,
    !verified && verify.failedAttempts > 0 ? `невдач: ${verify.failedAttempts}` : null,
  ].filter(Boolean);
  return (
    <Tooltip content={tooltip} placement="top" className="max-w-xs">
      <Chip
        size="sm"
        variant="flat"
        color={verified ? 'success' : 'default'}
        startContent={<DynamicIcon name={verified ? 'shield-check' : 'shield'} size={12} />}
      >
        {parts.join(' · ')}
      </Chip>
    </Tooltip>
  );
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value.trim());
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

/** Інструкції, що сформували крок: опис інструмента і підказки, текст яких є у відповіді. */
function stepInstructions(name: string, result: unknown, overrides: Record<string, string>): InstructionDef[] {
  const strings = collectStrings(result).filter((t) => t.length > 0);
  return CHATWOOT_BOT_INSTRUCTIONS.filter((item) => {
    if (item.group === 'tools') return item.key === `tool.${name}`;
    const text = botInstruction(overrides, item.key).trim();
    return text.length > 0 && strings.some((t) => t === text || (text.length >= 20 && t.includes(text)));
  });
}

const STEP_CHIP = 'h-6 min-w-0 gap-1 px-2 text-tiny font-normal';

/** Редагування інструкції з кроку: змінює форму (як на вкладці AI), діє з наступного повідомлення. */
function InstructionQuickEdit({ item, page }: { item: InstructionDef; page: ChatwootBotSettingsPageModel }) {
  const overrides = page.form?.aiInstructions ?? {};
  const isChanged = overrides[item.key] != null;
  const isTool = item.group === 'tools';
  return (
    <Popover placement="bottom-start" shouldBlockScroll={false}>
      <PopoverTrigger>
        <Button
          size="sm"
          variant="flat"
          color={isChanged ? 'warning' : 'default'}
          className={STEP_CHIP}
          startContent={<DynamicIcon name={isTool ? 'wrench' : 'message-square-text'} size={12} />}
        >
          {isTool ? 'Опис інструмента' : item.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(560px,90vw)] items-stretch p-3">
        <InstructionEditor
          label={item.label}
          ariaLabel={item.label}
          headerExtra={<span className="font-mono text-[11px] text-default-400">{item.key}</span>}
          context={<InstructionPreview text={item.usage} />}
          minRows={2}
          maxLength={CHATWOOT_BOT_INSTRUCTION_MAX_LENGTH}
          value={overrides[item.key] ?? item.defaultText}
          onChange={(v) => page.updateField('aiInstructions', withInstructionText(overrides, item.key, item.defaultText, v))}
          highlighted={isChanged}
        />
        <div className="mt-2 flex items-center gap-2 text-xs text-default-500">
          <span className="flex-1">Діє з наступного повідомлення в пісочниці. Щоб застосувати в live — збережіть налаштування.</span>
          {isChanged ? (
            <Button
              size="sm"
              variant="light"
              color="danger"
              className="h-6 min-w-0 px-2"
              startContent={<DynamicIcon name="rotate-ccw" size={12} />}
              onPress={() => page.updateField('aiInstructions', withInstructionText(overrides, item.key, item.defaultText, null))}
            >
              Стандартний
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Інструкція поза налаштуваннями: поточний текст у поповері й перехід на вкладку AI з пошуком за ключем. */
function InstructionLink({ item, overrides }: { item: InstructionDef; overrides: Record<string, string> }) {
  const navigate = useNavigate();
  const isTool = item.group === 'tools';
  return (
    <Popover placement="bottom-start" shouldBlockScroll={false}>
      <PopoverTrigger>
        <Button
          size="sm"
          variant="flat"
          color={overrides[item.key] != null ? 'warning' : 'default'}
          className={STEP_CHIP}
          startContent={<DynamicIcon name={isTool ? 'wrench' : 'message-square-text'} size={12} />}
        >
          {isTool ? 'Опис інструмента' : item.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(480px,90vw)] items-stretch gap-2 p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{item.label}</span>
          <span className="font-mono text-[11px] text-default-400">{item.key}</span>
        </div>
        <InstructionPreview text={item.usage} />
        <div className="rounded-md bg-default-100 px-2 py-1.5 text-xs">
          <InstructionPreview text={botInstruction(overrides, item.key)} />
        </div>
        <Button
          size="sm"
          variant="flat"
          color="primary"
          className="self-start"
          startContent={<DynamicIcon name="pencil" size={14} />}
          onPress={() => navigate('/chatwoot-bot/settings#tab=ai', { state: { instructionSearch: item.key } })}
        >
          Редагувати в налаштуваннях
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Статті з відповіді search_knowledge_base (старі відповіді без `id` пропускаємо). */
function knowledgeHits(result: unknown): Array<{ id: number; title: string }> {
  const entries = (result as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((e: { id?: unknown; title?: unknown }) =>
    typeof e?.id === 'number' ? [{ id: e.id, title: String(e.title ?? '') }] : [],
  );
}

function prettyJson(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
  } catch {
    return String(value);
  }
}

/** Знайдені статті — відкрити на редагування; нічого не знайдено — створити статтю з запитом моделі. */
function ArticleButtons({
  hits,
  query,
  openArticle,
}: {
  hits: Array<{ id: number; title: string }>;
  query: string;
  openArticle: NonNullable<OpenArticle>;
}) {
  const className = `${STEP_CHIP} max-w-64`;
  if (hits.length === 0) {
    return query.trim() ? (
      <Button
        size="sm"
        variant="flat"
        color="primary"
        className={className}
        startContent={<DynamicIcon name="book-plus" size={12} />}
        onPress={() => openArticle({ question: query.trim() })}
      >
        Створити статтю
      </Button>
    ) : null;
  }
  return (
    <>
      {hits.map((hit) => (
        <Button
          key={hit.id}
          size="sm"
          variant="flat"
          className={`${className} bg-sky-200/60 text-sky-700`}
          startContent={<DynamicIcon name="book-open" size={12} className="shrink-0" />}
          onPress={() => openArticle({ id: hit.id })}
        >
          <span className="truncate">{hit.title}</span>
        </Button>
      ))}
    </>
  );
}

/** Мітки під відповіддю бота: результат, верифікація, модель / токени і trace інструментів. */
export function BotTurnMeta({
  badge,
  detail,
  verify,
  verifyTooltip,
  meta,
  instructionSource,
  openArticle,
}: {
  badge: TurnBadge;
  detail?: string | null;
  verify?: ChatwootBotSandboxVerifyState;
  verifyTooltip: string;
  meta?: LlmMeta;
  instructionSource: InstructionSource;
  openArticle: OpenArticle;
}) {
  const [open, setOpen] = useState(false);
  const trace = meta?.toolTrace ?? [];
  const overrides =
    instructionSource?.kind === 'form' ? (instructionSource.page.form?.aiInstructions ?? {}) : (instructionSource?.overrides ?? {});
  // Звʼязок крок → інструкції фіксуємо на момент відповіді: після редагування текст у старій відповіді вже не збігатиметься.
  const [instructions] = useState(() => trace.map((entry) => stepInstructions(entry.name, entry.result, overrides)));
  // Скасування замовлення тощо в пісочниці лише моделюються (`simulated: true` у відповіді інструмента).
  const simulated = trace.some(
    (entry) => typeof entry.result === 'object' && entry.result !== null && (entry.result as { simulated?: unknown }).simulated === true,
  );
  const cost = meta?.usage?.estimatedCostUsd;
  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
        <Chip size="sm" variant="flat" color={badge.color}>
          {badge.label}
        </Chip>
        {detail ? <span className="truncate max-w-xs">{detail}</span> : null}
        {verify ? <VerifyChip verify={verify} tooltip={verifyTooltip} /> : null}
        {simulated ? (
          <Tooltip content="Інструмент лише змоделював дію: у SalesDrive нічого не змінено, оператора не сповіщено" placement="top">
            <Chip size="sm" variant="flat" color="secondary" startContent={<DynamicIcon name="flask-conical" size={12} />}>
              симуляція
            </Chip>
          </Tooltip>
        ) : null}
        {meta ? (
          <span className="font-mono">
            {meta.model} · {(meta.latencyMs / 1000).toFixed(1)} с
            {meta.usage ? ` · ${meta.usage.promptTokens}/${meta.usage.completionTokens} tok` : ''}
            {cost != null ? ` · $${cost.toFixed(4)}` : ''}
          </span>
        ) : null}
        {trace.length > 0 ? (
          <Button
            size="sm"
            variant="light"
            className="h-6 min-w-0 px-2"
            startContent={<DynamicIcon name={open ? 'chevron-up' : 'wrench'} size={14} />}
            onPress={() => setOpen((v) => !v)}
          >
            Інструменти ({trace.length})
          </Button>
        ) : meta ? (
          <span>без інструментів</span>
        ) : null}
      </div>
      {open
        ? trace.map((entry, index) => (
            <div key={entry.step} className="rounded-md border border-default-200 bg-default-50 p-2 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold text-default-700">
                  {entry.step}. {entry.name}
                  <span className="font-normal text-default-400"> · раунд {entry.apiRound}</span>
                </span>
                {openArticle && entry.name === 'search_knowledge_base' ? (
                  <ArticleButtons
                    hits={knowledgeHits(entry.result)}
                    query={String((entry.arguments as { query?: unknown } | null)?.query ?? '')}
                    openArticle={openArticle}
                  />
                ) : null}
                {instructionSource
                  ? instructions[index]?.map((item) =>
                      instructionSource.kind === 'form' ? (
                        <InstructionQuickEdit key={item.key} item={item} page={instructionSource.page} />
                      ) : (
                        <InstructionLink key={item.key} item={item} overrides={instructionSource.overrides} />
                      ),
                    )
                  : null}
              </div>
              <pre className="font-mono text-xs text-default-600 whitespace-pre-wrap break-all">
                {prettyJson(entry.arguments)}
              </pre>
              <pre className="font-mono text-xs text-default-500 whitespace-pre-wrap break-all max-h-60 overflow-auto border-t border-default-200 pt-1">
                {prettyJson(entry.result)}
              </pre>
            </div>
          ))
        : null}
    </div>
  );
}

export function CustomerBubble({ text, footer }: { text: string; footer?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-end gap-2">
      <div className="flex max-w-[85%] flex-col items-end gap-0.5">
        <div className="rounded-lg bg-default-100 px-3 py-2 text-sm whitespace-pre-wrap">{text}</div>
        {footer}
      </div>
      <Avatar
        size="sm"
        className="shrink-0 bg-default-200 text-default-600"
        icon={<DynamicIcon name="user" size={16} />}
        aria-label="Клієнт"
      />
    </div>
  );
}

/** Відповідь бота; `texts` порожній — бот нічого не надіслав (показуємо `emptyText`). */
export function BotBubble({ texts, emptyText, children }: { texts: string[]; emptyText?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Avatar
        size="sm"
        className="shrink-0 bg-primary-100 text-primary-600"
        icon={<DynamicIcon name="bot" size={16} />}
        aria-label="Бот"
      />
      <div className="min-w-0 max-w-[95%] space-y-1">
        {texts.length > 0 ? (
          texts.map((text, i) => (
            <div key={i} className="rounded-lg border border-default-200 bg-content1 px-3 py-2 text-sm whitespace-pre-wrap">
              {text}
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-default-300 px-3 py-2 text-sm italic text-default-400">
            {emptyText ?? 'Бот нічого не надіслав'}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * Статті бази знань з кроку search_knowledge_base: редагуються одразу в БД (як на сторінці бази знань),
 * бот бачить зміни з наступного повідомлення. Повертає `openArticle` і drawer, який треба відрендерити.
 */
export function useKnowledgeArticleEditor(): { openArticle: OpenArticle; drawer: React.ReactNode } {
  const { hasPermission } = useRoleAccess();
  const canManage = hasPermission(PERMISSIONS.ACTION_CHATWOOT_KNOWLEDGE_MANAGE);
  const [articles, setArticles] = useState<ChatwootBotKnowledgeEntry[]>([]);
  const [state, setState] = useState<{ entry: ChatwootBotKnowledgeEntry | null; question?: string } | null>(null);
  useEffect(() => {
    if (!canManage) return;
    chatwootKnowledgeApi
      .list()
      .then(setArticles)
      .catch(() => setArticles([]));
  }, [canManage]);
  const openArticle: OpenArticle = canManage
    ? (target) => {
        if ('question' in target) {
          setState({ entry: null, question: target.question });
          return;
        }
        const entry = articles.find((a) => a.id === target.id);
        if (entry) setState({ entry });
        else ToastService.show({ title: 'Статтю не знайдено', description: 'Можливо, її видалено.', color: 'warning' });
      }
    : undefined;
  const drawer = canManage ? (
    <KnowledgeEntryDrawer
      isOpen={state != null}
      entry={state?.entry ?? null}
      initialQuestion={state?.question}
      canManage
      onClose={() => setState(null)}
      onSaved={(saved) => {
        setArticles((prev) => [...prev.filter((a) => a.id !== saved.id), saved]);
        setState(null);
      }}
    />
  ) : null;
  return { openArticle, drawer };
}
