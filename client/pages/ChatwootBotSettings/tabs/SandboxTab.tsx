import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
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
import {
  BotBubble,
  BotTurnMeta,
  CustomerBubble,
  useKnowledgeArticleEditor,
  type OpenArticle,
  type TurnBadge,
} from '../components/BotTurnView';

/** `navigate(…, { state })` зі статистики: одразу поставити це питання боту. */
export type SandboxNavigationState = { sandboxAsk?: string };

type Props = { page: ChatwootBotSettingsPageModel };

type Turn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; result: ChatwootBotSandboxReplyResult };

type HoursMode = 'schedule' | 'in' | 'out';

type ScenarioRun = { turns: Turn[]; error?: string };

const OUTCOME_META: Record<ChatwootBotSandboxOutcome, TurnBadge> = {
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

function hoursValue(mode: HoursMode): boolean | null {
  return mode === 'schedule' ? null : mode === 'in';
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const SANDBOX_VERIFY_TOOLTIP =
  'Перевірка на реальних замовленнях (лише читання). Стан живе до очищення діалогу; у Chatwoot і статистику нічого не пишеться.';

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
          <CustomerBubble key={index} text={turn.content} />
        ) : (
          <BotBubble key={index} texts={[turn.content]}>
            <BotTurnMeta
              badge={OUTCOME_META[turn.result.outcome]}
              detail={turn.result.detail}
              verify={turn.result.verify}
              verifyTooltip={SANDBOX_VERIFY_TOOLTIP}
              meta={turn.result.meta}
              instructionSource={{ kind: 'form', page }}
              openArticle={openArticle}
            />
          </BotBubble>
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

  const { openArticle, drawer: articleDrawer } = useKnowledgeArticleEditor();

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

      {articleDrawer}
    </div>
  );
}
