import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  ChatwootBotSandboxOutcome,
  ChatwootBotSandboxReplyResult,
  ChatwootBotSandboxScenario,
  ChatwootBotSandboxVerifyState,
} from '@shared/types/chatwootBotSandbox';
import {
  CHATWOOT_BOT_INSTRUCTION_MAX_LENGTH,
  CHATWOOT_BOT_INSTRUCTIONS,
  botInstruction,
} from '@shared/constants/chatwootBotInstructions';
import type { ChatwootBotKnowledgeEntry } from '@shared/types/chatwootBotKnowledge';
import { PERMISSIONS } from '@shared/constants/permissions';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { chatwootKnowledgeApi } from '@/services/ChatwootKnowledgeService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { KnowledgeEntryDrawer } from '@/pages/ChatwootBotKnowledge/KnowledgeEntryDrawer';
import { ToastService } from '@/services/ToastService';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';
import { InstructionEditor, InstructionPreview } from '../components/InstructionEditor';
import { withInstructionText } from '../cards/AiInstructionsCard';

/** `navigate(…, { state })` зі статистики: одразу поставити це питання боту. */
export type SandboxNavigationState = { sandboxAsk?: string };

type Props = { page: ChatwootBotSettingsPageModel };

type Turn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; result: ChatwootBotSandboxReplyResult };

type HoursMode = 'schedule' | 'in' | 'out';

/** Відкрити статтю бази знань на редагування або нову з питанням; `undefined` — немає права керувати базою. */
type OpenArticle = ((target: { id: number } | { question: string }) => void) | undefined;

type ScenarioRun = { turns: Turn[]; error?: string };

const OUTCOME_META: Record<
  ChatwootBotSandboxOutcome,
  { label: string; color: 'success' | 'primary' | 'warning' | 'danger' | 'default' }
> = {
  llm: { label: 'LLM', color: 'success' },
  pattern: { label: 'Патерн', color: 'primary' },
  handover_keyword: { label: 'Handover: слово', color: 'warning' },
  operator_tool: { label: 'Оператор (tool)', color: 'warning' },
  fallback: { label: 'Fallback', color: 'danger' },
};

const HOURS_MODES: Array<{ key: HoursMode; label: string; icon: 'calendar-clock' | 'sun' | 'moon' }> = [
  { key: 'schedule', label: 'За розкладом', icon: 'calendar-clock' },
  { key: 'in', label: 'Робочий час', icon: 'sun' },
  { key: 'out', label: 'Неробочий', icon: 'moon' },
];

const VERIFY_ATTEMPT_LABEL: Record<NonNullable<ChatwootBotSandboxVerifyState['attempt']>, string> = {
  ok: 'пройдено повідомленням',
  mismatch: 'дані не збіглися',
  ambiguous: 'кілька замовлень',
  rate_limited: 'ліміт спроб',
  invalid_input: 'не розпізнано',
};

/** Стан верифікації сесії після ходу: скільки замовлень відкрито і чим закінчилась автоперевірка повідомлення. */
function VerifyChip({ verify }: { verify: ChatwootBotSandboxVerifyState }) {
  const verified = verify.verifiedOrders > 0;
  const parts = [
    verified ? `верифіковано (${verify.verifiedOrders})` : 'не верифіковано',
    verify.attempt ? VERIFY_ATTEMPT_LABEL[verify.attempt] : null,
    !verified && verify.failedAttempts > 0 ? `невдач: ${verify.failedAttempts}` : null,
  ].filter(Boolean);
  return (
    <Tooltip
      content="Перевірка на реальних замовленнях (лише читання). Стан живе до очищення діалогу; у Chatwoot і статистику нічого не пишеться."
      placement="top"
      className="max-w-xs"
    >
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

function hoursValue(mode: HoursMode): boolean | null {
  return mode === 'schedule' ? null : mode === 'in';
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type InstructionDef = (typeof CHATWOOT_BOT_INSTRUCTIONS)[number];

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

/** Редагування інструкції просто з пісочниці: змінює форму (як на вкладці AI), діє з наступного повідомлення. */
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
          className="h-6 min-w-0 gap-1 px-2 text-tiny font-normal"
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
  const className = 'h-6 min-w-0 max-w-64 gap-1 px-2 text-tiny font-normal';
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

function TurnMeta({
  result,
  page,
  openArticle,
}: {
  result: ChatwootBotSandboxReplyResult;
  page: ChatwootBotSettingsPageModel;
  openArticle: OpenArticle;
}) {
  const [open, setOpen] = useState(false);
  const meta = result.meta;
  const trace = meta?.toolTrace ?? [];
  // Звʼязок крок → інструкції фіксуємо на момент відповіді: після редагування текст у старій відповіді вже не збігатиметься.
  const [instructions] = useState(() =>
    trace.map((entry) => stepInstructions(entry.name, entry.result, page.form?.aiInstructions ?? {})),
  );
  // Скасування замовлення тощо в пісочниці лише моделюються (`simulated: true` у відповіді інструмента).
  const simulated = trace.some(
    (entry) => typeof entry.result === 'object' && entry.result !== null && (entry.result as { simulated?: unknown }).simulated === true,
  );
  const outcome = OUTCOME_META[result.outcome];
  const cost = meta?.usage?.estimatedCostUsd;
  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
        <Chip size="sm" variant="flat" color={outcome.color}>
          {outcome.label}
        </Chip>
        {result.detail ? <span className="truncate max-w-xs">{result.detail}</span> : null}
        {result.verify ? <VerifyChip verify={result.verify} /> : null}
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
                {instructions[index]?.map((item) => <InstructionQuickEdit key={item.key} item={item} page={page} />)}
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

function Transcript({
  turns,
  page,
  openArticle,
}: {
  turns: Turn[];
  page: ChatwootBotSettingsPageModel;
  openArticle: OpenArticle;
}) {
  if (turns.length === 0) {
    return (
      <p className="text-sm text-default-400 py-6 text-center">
        Напишіть повідомлення як клієнт — бот відповість з реальними інструментами, без відправки в Chatwoot.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {turns.map((turn, index) =>
        turn.role === 'user' ? (
          <div key={index} className="flex items-end justify-end gap-2">
            <div className="max-w-[85%] rounded-lg bg-default-100 px-3 py-2 text-sm whitespace-pre-wrap">
              {turn.content}
            </div>
            <Avatar
              size="sm"
              className="shrink-0 bg-default-200 text-default-600"
              icon={<DynamicIcon name="user" size={16} />}
              aria-label="Клієнт"
            />
          </div>
        ) : (
          <div key={index} className="flex items-start gap-2">
            <Avatar
              size="sm"
              className="shrink-0 bg-primary-100 text-primary-600"
              icon={<DynamicIcon name="bot" size={16} />}
              aria-label="Бот"
            />
            <div className="min-w-0 max-w-[95%]">
              <div className="rounded-lg border border-default-200 bg-content1 px-3 py-2 text-sm whitespace-pre-wrap">
                {turn.content}
              </div>
              <TurnMeta result={turn.result} page={page} openArticle={openArticle} />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function toHistory(turns: Turn[]) {
  return turns.map((t) => ({ role: t.role, content: t.content }));
}

export function SandboxTab({ page }: Props) {
  const { form } = page;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [hoursMode, setHoursMode] = useState<HoursMode>('schedule');
  const [busy, setBusy] = useState(false);
  const [scenarios, setScenarios] = useState<ChatwootBotSandboxScenario[]>([]);
  const [scenarioTitle, setScenarioTitle] = useState('');
  const [runs, setRuns] = useState<Record<string, ScenarioRun>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const stopRef = useRef(false);
  /** Сесія діалогу на сервері (стан верифікації); нова — після очищення або для кожного прогону сценарію. */
  const sessionRef = useRef(newId());

  // Статті бази знань: редагуються одразу в БД (як на сторінці бази знань), бот бачить зміни з наступного повідомлення.
  const { hasPermission } = useRoleAccess();
  const canManageKnowledge = hasPermission(PERMISSIONS.ACTION_CHATWOOT_KNOWLEDGE_MANAGE);
  const [articles, setArticles] = useState<ChatwootBotKnowledgeEntry[]>([]);
  const [articleDrawer, setArticleDrawer] = useState<{ entry: ChatwootBotKnowledgeEntry | null; question?: string } | null>(
    null,
  );
  useEffect(() => {
    if (!canManageKnowledge) return;
    chatwootKnowledgeApi
      .list()
      .then(setArticles)
      .catch(() => setArticles([]));
  }, [canManageKnowledge]);
  const openArticle: OpenArticle = canManageKnowledge
    ? (target) => {
        if ('question' in target) {
          setArticleDrawer({ entry: null, question: target.question });
          return;
        }
        const entry = articles.find((a) => a.id === target.id);
        if (entry) setArticleDrawer({ entry });
        else ToastService.show({ title: 'Статтю не знайдено', description: 'Можливо, її видалено.', color: 'warning' });
      }
    : undefined;

  useEffect(() => {
    chatwootBotApi
      .getSandboxScenarios()
      .then(setScenarios)
      .catch(() => setScenarios([]));
  }, []);

  /** Один хід бота на історію `history` (останнє — від клієнта). */
  const askBot = useCallback(
    async (history: Turn[], sessionId: string): Promise<Turn> => {
      const result = await chatwootBotApi.sandboxReply({
        messages: toHistory(history),
        sessionId,
        inBusinessHours: hoursValue(hoursMode),
        aiProvider: form?.aiProvider,
        aiModel: form?.aiModel,
        aiMaskId: form?.aiMaskId,
        aiMasks: form?.aiMasks,
        aiInstructions: form?.aiInstructions,
        actionScenarios: form?.actionScenarios,
      });
      return { role: 'assistant', content: result.text, result };
    },
    [form?.actionScenarios, form?.aiInstructions, form?.aiMaskId, form?.aiMasks, form?.aiModel, form?.aiProvider, hoursMode],
  );

  const runScenario = useCallback(
    async (scenario: ChatwootBotSandboxScenario): Promise<ScenarioRun> => {
      const acc: Turn[] = [];
      const sessionId = newId();
      try {
        for (const message of scenario.messages) {
          if (stopRef.current) break;
          acc.push({ role: 'user', content: message });
          acc.push(await askBot(acc, sessionId));
        }
        return { turns: acc };
      } catch (e) {
        return { turns: acc, error: e instanceof Error ? e.message : 'Помилка' };
      }
    },
    [askBot],
  );

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || busy) return;
    const history: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(history);
    setDraft('');
    setActiveScenarioId(null);
    setBusy(true);
    try {
      const reply = await askBot(history, sessionRef.current);
      setTurns([...history, reply]);
    } catch (e) {
      ToastService.show({
        title: 'Пісочниця',
        description: e instanceof Error ? e.message : 'Бот не відповів',
        color: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  // «Протестувати в пісочниці» зі статистики тем: питання приходить у state навігації.
  const location = useLocation();
  const navigate = useNavigate();
  const askedRef = useRef(false);
  useEffect(() => {
    const ask = (location.state as SandboxNavigationState | null)?.sandboxAsk?.trim();
    if (!ask || askedRef.current) return;
    askedRef.current = true;
    // Прибрати state, щоб «Назад» / оновлення не надсилали питання вдруге.
    navigate(`${location.pathname}${location.hash}`, { replace: true, state: null });
    void send(ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistScenarios = async (next: ChatwootBotSandboxScenario[]) => {
    try {
      setScenarios(await chatwootBotApi.saveSandboxScenarios(next));
    } catch (e) {
      ToastService.show({
        title: 'Сценарії',
        description: e instanceof Error ? e.message : 'Не вдалося зберегти',
        color: 'danger',
      });
    }
  };

  const saveAsScenario = async () => {
    const messages = turns.filter((t) => t.role === 'user').map((t) => t.content);
    const title = scenarioTitle.trim() || messages[0]?.slice(0, 60) || '';
    if (!title || messages.length === 0) return;
    await persistScenarios([...scenarios, { id: newId(), title, messages }]);
    setScenarioTitle('');
  };

  const runOne = async (scenario: ChatwootBotSandboxScenario) => {
    stopRef.current = false;
    setBusy(true);
    setActiveScenarioId(scenario.id);
    setTurns([]);
    sessionRef.current = newId();
    const run = await runScenario(scenario);
    setRuns((prev) => ({ ...prev, [scenario.id]: run }));
    setTurns(run.turns);
    setBusy(false);
  };

  const runAll = async () => {
    stopRef.current = false;
    setRunningAll(true);
    setBusy(true);
    setRuns({});
    for (const scenario of scenarios) {
      if (stopRef.current) break;
      const run = await runScenario(scenario);
      setRuns((prev) => ({ ...prev, [scenario.id]: run }));
    }
    setRunningAll(false);
    setBusy(false);
  };

  const showRun = (scenario: ChatwootBotSandboxScenario) => {
    const run = runs[scenario.id];
    if (!run) return;
    setActiveScenarioId(scenario.id);
    setTurns(run.turns);
  };

  if (!form) return null;

  const userTurns = turns.filter((t) => t.role === 'user').length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      <Card>
        <CardHeader className="flex flex-wrap gap-2 px-4 items-center border-b border-default-200">
          <DynamicIcon name="flask-conical" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">Діалог</h2>
          <div className="ml-auto flex items-center gap-2">
            <ButtonGroup size="sm" aria-label="Робочі години">
              {HOURS_MODES.map((mode) => (
                <Button
                  key={mode.key}
                  variant={hoursMode === mode.key ? 'solid' : 'flat'}
                  color={hoursMode === mode.key ? 'warning' : 'warning'}
                  startContent={<DynamicIcon name={mode.icon} size={14} />}
                  aria-pressed={hoursMode === mode.key}
                  onPress={() => setHoursMode(mode.key)}
                >
                  {mode.label}
                </Button>
              ))}
            </ButtonGroup>
            <Tooltip content="Почати новий діалог" placement="top">
              <Button
                size="sm"
                variant="light"
                isIconOnly
                aria-label="Очистити діалог"
                isDisabled={busy || turns.length === 0}
                onPress={() => {
                  setTurns([]);
                  setActiveScenarioId(null);
                  sessionRef.current = newId();
                }}
              >
                <DynamicIcon name="eraser" size={16} />
              </Button>
            </Tooltip>
          </div>
        </CardHeader>
        <CardBody className="gap-4 p-4">
          <p className="text-xs text-default-500">
            Той самий шлях, що в live: ключові слова handover → патерни → LLM з інструментами → fallback. Маска й модель
            — з форми (зокрема незбережені зміни). Верифікація — на реальних замовленнях (лише читання), стан діє до
            очищення діалогу; скасування замовлень лише моделюється.
          </p>
          <Transcript turns={turns} page={page} openArticle={openArticle} />
          {busy && !runningAll ? (
            <div className="flex items-center gap-2 text-xs text-default-500">
              <DynamicIcon name="loader-2" size={14} className="animate-spin" /> Бот думає…
            </div>
          ) : null}
          <div className="flex gap-2 items-end">
            <Textarea
              minRows={1}
              maxRows={6}
              placeholder="Повідомлення клієнта…"
              value={draft}
              onValueChange={setDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              color="primary"
              isIconOnly
              aria-label="Надіслати"
              isDisabled={busy || !draft.trim()}
              onPress={() => void send()}
            >
              <DynamicIcon name={busy ? 'loader-2' : 'send'} size={16} className={busy ? 'animate-spin' : ''} />
            </Button>
          </div>
          {userTurns > 0 && !activeScenarioId ? (
            <div className="flex gap-2 items-center">
              <Input
                size="sm"
                placeholder="Назва сценарію (необовʼязково)"
                value={scenarioTitle}
                onValueChange={setScenarioTitle}
              />
              <Button
                size="sm"
                variant="flat"
                startContent={<DynamicIcon name="bookmark-plus" size={16} />}
                isDisabled={busy}
                onPress={() => void saveAsScenario()}
              >
                Зберегти сценарій
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
          <DynamicIcon name="list-checks" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">Сценарії</h2>
          <div className="ml-auto">
            {runningAll ? (
              <Button
                size="sm"
                variant="flat"
                color="danger"
                startContent={<DynamicIcon name="square" size={14} />}
                onPress={() => {
                  stopRef.current = true;
                }}
              >
                Зупинити
              </Button>
            ) : (
              <Button
                size="sm"
                variant="flat"
                color="success"
                startContent={<DynamicIcon name="play" size={14} />}
                isDisabled={busy || scenarios.length === 0}
                onPress={() => void runAll()}
              >
                Прогнати всі
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody className="p-2 gap-1">
          {scenarios.length === 0 ? (
            <p className="text-sm text-default-400 p-3">
              Проведіть діалог зліва і збережіть його як сценарій. Після зміни маски чи бази знань прогоніть усі
              сценарії й порівняйте відповіді.
            </p>
          ) : (
            scenarios.map((scenario) => {
              const run = runs[scenario.id];
              const outcomes = run?.turns.flatMap((t) => (t.role === 'assistant' ? [t.result.outcome] : [])) ?? [];
              const last = outcomes[outcomes.length - 1];
              return (
                <div
                  key={scenario.id}
                  className={`rounded-lg px-3 py-2 ${activeScenarioId === scenario.id ? 'bg-default-100' : 'hover:bg-default-50'}`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => showRun(scenario)}
                      disabled={!run}
                    >
                      <div className="text-sm font-medium text-default-900 truncate">{scenario.title}</div>
                      <div className="text-xs text-default-500">
                        {scenario.messages.length} повідомл.
                        {run?.error ? <span className="text-danger"> · {run.error}</span> : null}
                      </div>
                    </button>
                    {last ? (
                      <Chip size="sm" variant="flat" color={OUTCOME_META[last].color}>
                        {OUTCOME_META[last].label}
                      </Chip>
                    ) : null}
                    <Tooltip content="Прогнати" placement="top">
                      <Button
                        size="sm"
                        variant="light"
                        className="data-[hover=true]:bg-blue-500/15 text-blue-600"
                        isIconOnly
                        aria-label="Прогнати сценарій"
                        isDisabled={busy}
                        onPress={() => void runOne(scenario)}
                      >
                        <DynamicIcon name="play" size={14} />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Видалити" placement="top">
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        isIconOnly
                        aria-label="Видалити сценарій"
                        isDisabled={busy}
                        onPress={() => void persistScenarios(scenarios.filter((s) => s.id !== scenario.id))}
                      >
                        <DynamicIcon name="trash-2" size={14} />
                      </Button>
                    </Tooltip>
                  </div>
                  {runningAll && !run ? (
                    <div className="text-xs text-default-400 flex items-center gap-1 mt-1">
                      <DynamicIcon name="loader-2" size={12} className="animate-spin" /> в черзі
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      {canManageKnowledge ? (
        <KnowledgeEntryDrawer
          isOpen={articleDrawer != null}
          entry={articleDrawer?.entry ?? null}
          initialQuestion={articleDrawer?.question}
          canManage
          onClose={() => setArticleDrawer(null)}
          onSaved={(saved) => {
            setArticles((prev) => [...prev.filter((a) => a.id !== saved.id), saved]);
            setArticleDrawer(null);
          }}
        />
      ) : null}
    </div>
  );
}
