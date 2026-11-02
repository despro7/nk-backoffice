import React, { useEffect, useRef, useState } from 'react';
import { Button, Chip, Input, Textarea, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CHATWOOT_BOT_SCENARIO_LIMITS as LIMITS,
  type ChatwootBotActionScenario,
} from '@shared/types/chatwootBotScenarios';
import { SettingsCard, SettingsColumns, type SettingsCardProps } from '../cards/SettingsCard';
import { InstructionEditor } from '../components/InstructionEditor';
import { FormSwitchField } from '../components/FormSwitchField';
import type { SandboxNavigationState } from './SandboxTab';

/** Зі статистики «Запити на дію»: новий сценарій із фразами запиту або відкрити наявний. */
export type ScenarioNavigationState = {
  scenarioDraft?: { title: string; triggers: string[] };
  scenarioId?: string;
};

const INSTRUCTIONS_PLACEHOLDER =
  'Напр.: 1. Виклич get_storefront_catalog без query і коротко назви категорії та ціни.\n2. Дай посилання на каталог https://nk-food.shop/shop/.\n3. Якщо клієнт хоче файл – виклич request_operator (kind: action).';

function newScenario(draft?: ScenarioNavigationState['scenarioDraft']): ChatwootBotActionScenario {
  return {
    id: `scenario_${Date.now()}`,
    title: draft?.title ?? 'Новий сценарій',
    enabled: true,
    triggers: draft?.triggers.slice(0, LIMITS.triggersMax) ?? [],
    instructions: '',
  };
}

/**
 * Конструктор сценаріїв для запитів на дію: назва, як клієнти просять, і кроки для бота
 * з інструментами. Увімкнені сценарії додаються в інструкції бота; зберігаються з рештою налаштувань.
 */
export function ScenariosTab({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const handledState = useRef(false);

  const scenarios = form?.actionScenarios ?? [];
  const setScenarios = (next: ChatwootBotActionScenario[]) => updateField('actionScenarios', next);
  const update = (id: string, patch: Partial<ChatwootBotActionScenario>) =>
    setScenarios(scenarios.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  // Перехід зі статистики: створити чернетку або відкрити сценарій; state прибираємо.
  useEffect(() => {
    if (!form || handledState.current) return;
    const state = location.state as ScenarioNavigationState | null;
    if (!state?.scenarioDraft && !state?.scenarioId) return;
    handledState.current = true;
    navigate(`${location.pathname}${location.hash}`, { replace: true, state: null });
    if (state.scenarioDraft) {
      const created = newScenario(state.scenarioDraft);
      setScenarios([...scenarios, created]);
      setSelectedId(created.id);
    } else if (state.scenarioId) {
      setSelectedId(state.scenarioId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  if (!form) return null;
  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0] ?? null;

  const testInSandbox = (scenario: ChatwootBotActionScenario) => {
    const ask = scenario.triggers[0] ?? scenario.title;
    const state: SandboxNavigationState = { sandboxAsk: ask };
    navigate('/chatwoot-bot/settings#tab=sandbox', { state });
  };

  return (
    <SettingsColumns
      left={
        <SettingsCard
          icon="workflow"
          title="Сценарії дій"
          headerEnd={
            <Button
              size="sm"
              variant="flat"
              isDisabled={scenarios.length >= LIMITS.scenariosMax}
              startContent={<DynamicIcon name="plus" size={14} />}
              onPress={() => {
                const created = newScenario();
                setScenarios([...scenarios, created]);
                setSelectedId(created.id);
              }}
            >
              Новий
            </Button>
          }
        >
          <p className="text-xs text-default-500">
            Як бот відповідає на конкретні запити дій («надішліть прайс», «змініть адресу»). Увімкнені сценарії йдуть
            у його інструкції; зберігаються кнопкою «Зберегти» внизу. Які запити клієнти шлють найчастіше – статистика,
            блок «Запити на дію».
          </p>
          {scenarios.length === 0 ? (
            <p className="text-sm text-default-400">Сценаріїв ще немає.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setSelectedId(scenario.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left ${
                    selected?.id === scenario.id ? 'bg-default-100' : 'hover:bg-default-50'
                  }`}
                >
                  <DynamicIcon
                    name={scenario.enabled ? 'circle-check' : 'circle-pause'}
                    size={16}
                    className={scenario.enabled ? 'text-success' : 'text-default-400'}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{scenario.title}</span>
                    <span className="block text-xs text-default-500">
                      фраз: {scenario.triggers.length}
                      {scenario.instructions.trim() ? '' : ' · без кроків – не збережеться'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </SettingsCard>
      }
      right={
        selected ? (
          <SettingsCard
            icon="square-pen"
            title={selected.title || 'Сценарій'}
            headerEnd={
              <div className="flex items-center gap-1">
                <Tooltip content="Поставити першу фразу боту в пісочниці" placement="top">
                  <Button
                    size="sm"
                    variant="light"
                    startContent={<DynamicIcon name="flask-conical" size={14} />}
                    onPress={() => testInSandbox(selected)}
                  >
                    Тест
                  </Button>
                </Tooltip>
                <Tooltip content="Видалити сценарій" placement="top">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label="Видалити сценарій"
                    onPress={() => {
                      setScenarios(scenarios.filter((s) => s.id !== selected.id));
                      setSelectedId(null);
                    }}
                  >
                    <DynamicIcon name="trash-2" size={14} />
                  </Button>
                </Tooltip>
              </div>
            }
          >
            <FormSwitchField
              isSelected={selected.enabled}
              onValueChange={(v) => update(selected.id, { enabled: v })}
              title="Увімкнено"
              description="Вимкнений сценарій зберігається, але бот його не бачить."
            />
            <Input
              label="Назва (що просить клієнт)"
              maxLength={LIMITS.titleMax}
              value={selected.title}
              onValueChange={(v) => update(selected.id, { title: v })}
            />
            <Textarea
              label="Як клієнти це формулюють"
              description="Кожна фраза з нового рядка. За ними бот розпізнає запит, а статистика – привʼязує групу до сценарію."
              minRows={3}
              value={selected.triggers.join('\n')}
              onValueChange={(v) =>
                update(selected.id, {
                  triggers: v
                    .split('\n')
                    .map((t) => t.slice(0, LIMITS.triggerMax))
                    .slice(0, LIMITS.triggersMax),
                })
              }
            />
            <InstructionEditor
              label="Кроки для бота"
              value={selected.instructions}
              onChange={(v) => update(selected.id, { instructions: v })}
              minRows={5}
              maxLength={LIMITS.instructionsMax}
              placeholder={INSTRUCTIONS_PLACEHOLDER}
              description="Пишіть як інструкцію боту; «Інструмент» вставляє назву інструмента – під полем видно мітками."
            />
            {selected.triggers.filter((t) => t.trim()).length === 0 && (
              <Chip size="sm" variant="flat" color="warning">
                Додайте хоча б одну фразу клієнта
              </Chip>
            )}
          </SettingsCard>
        ) : (
          <SettingsCard icon="square-pen" title="Сценарій">
            <p className="text-sm text-default-400">Оберіть сценарій зліва або створіть новий.</p>
          </SettingsCard>
        )
      }
    />
  );
}
