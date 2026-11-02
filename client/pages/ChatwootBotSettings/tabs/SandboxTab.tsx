import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Radio,
  RadioGroup,
  Textarea,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  ChatwootBotSandboxOutcome,
  ChatwootBotSandboxReplyResult,
  ChatwootBotSandboxScenario,
} from '@shared/types/chatwootBotSandbox';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { ToastService } from '@/services/ToastService';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';

/** `navigate(…, { state })` зі статистики: одразу поставити це питання боту. */
export type SandboxNavigationState = { sandboxAsk?: string };

type Props = { page: ChatwootBotSettingsPageModel };

type Turn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; result: ChatwootBotSandboxReplyResult };

type HoursMode = 'schedule' | 'in' | 'out';

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

function hoursValue(mode: HoursMode): boolean | null {
  return mode === 'schedule' ? null : mode === 'in';
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function prettyJson(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
  } catch {
    return String(value);
  }
}

function TurnMeta({ result }: { result: ChatwootBotSandboxReplyResult }) {
  const [open, setOpen] = useState(false);
  const meta = result.meta;
  const trace = meta?.toolTrace ?? [];
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
        ? trace.map((entry) => (
            <div key={entry.step} className="rounded-md border border-default-200 bg-default-50 p-2 space-y-1">
              <div className="text-xs font-semibold text-default-700">
                {entry.step}. {entry.name}
                <span className="font-normal text-default-400"> · раунд {entry.apiRound}</span>
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

function Transcript({ turns }: { turns: Turn[] }) {
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
          <div key={index} className="flex justify-end">
            <div className="max-w-[85%] rounded-lg bg-default-100 px-3 py-2 text-sm whitespace-pre-wrap">
              {turn.content}
            </div>
          </div>
        ) : (
          <div key={index} className="max-w-[95%]">
            <div className="rounded-lg border border-default-200 bg-content1 px-3 py-2 text-sm whitespace-pre-wrap">
              {turn.content}
            </div>
            <TurnMeta result={turn.result} />
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

  useEffect(() => {
    chatwootBotApi
      .getSandboxScenarios()
      .then(setScenarios)
      .catch(() => setScenarios([]));
  }, []);

  /** Один хід бота на історію `history` (останнє — від клієнта). */
  const askBot = useCallback(
    async (history: Turn[]): Promise<Turn> => {
      const result = await chatwootBotApi.sandboxReply({
        messages: toHistory(history),
        inBusinessHours: hoursValue(hoursMode),
        aiProvider: form?.aiProvider,
        aiModel: form?.aiModel,
        aiMaskId: form?.aiMaskId,
        aiMasks: form?.aiMasks,
      });
      return { role: 'assistant', content: result.text, result };
    },
    [form?.aiMaskId, form?.aiMasks, form?.aiModel, form?.aiProvider, hoursMode],
  );

  const runScenario = useCallback(
    async (scenario: ChatwootBotSandboxScenario): Promise<ScenarioRun> => {
      const acc: Turn[] = [];
      try {
        for (const message of scenario.messages) {
          if (stopRef.current) break;
          acc.push({ role: 'user', content: message });
          acc.push(await askBot(acc));
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
      const reply = await askBot(history);
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
            <RadioGroup
              orientation="horizontal"
              size="sm"
              value={hoursMode}
              onValueChange={(v) => setHoursMode(v as HoursMode)}
              aria-label="Робочі години"
            >
              <Radio value="schedule">За розкладом</Radio>
              <Radio value="in">Робочий час</Radio>
              <Radio value="out">Неробочий</Radio>
            </RadioGroup>
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
            — з форми (зокрема незбережені зміни). Верифікація замовлень тут недоступна: немає розмови Chatwoot.
          </p>
          <Transcript turns={turns} />
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
                  <div className="flex items-start gap-2">
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
    </div>
  );
}
