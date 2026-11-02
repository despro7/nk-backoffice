/** Сценарії відповідей на запити дій (конструктор у налаштуваннях бота). */

export type ChatwootBotActionScenario = {
  id: string;
  title: string;
  enabled: boolean;
  /** Як клієнти формулюють запит («надішліть прайс», «скиньте ціни»). */
  triggers: string[];
  /** Кроки для бота; назви інструментів (get_storefront_catalog тощо) — як є, UI показує їх мітками. */
  instructions: string;
};

export const CHATWOOT_BOT_SCENARIO_LIMITS = {
  scenariosMax: 30,
  titleMax: 120,
  triggersMax: 20,
  triggerMax: 200,
  instructionsMax: 4000,
} as const;

/** Чим закривається запит на дію. */
export type ChatwootBotActionSolution = {
  /** scenario — сценарій з налаштувань; tool — вбудований інструмент / потік; none — лише оператор. */
  kind: 'scenario' | 'tool' | 'none';
  /** Коротка назва для чипа. */
  title: string;
  enabled: boolean;
  scenarioId?: string;
  /** Схема коротко: кроки сценарію або що робить вбудована дія. */
  summary?: string;
  /** Скільки фраз-тригерів у сценарії. */
  triggersCount?: number;
  /** Вкладка налаштувань бота, де вмикається / налаштовується вбудована дія. */
  settingsTab?: string;
};

export type ChatwootBotActionRequestDto = {
  /** Найчастіше формулювання дії («Надіслати прайс»). */
  label: string;
  count: number;
  examples: string[];
  solution: ChatwootBotActionSolution;
};
