import type { ChatwootBotTurnOutcome } from '@shared/types/chatwootBotDialogs';
import type { TurnBadge } from '../ChatwootBotSettings/components/BotTurnView';

export const TURN_OUTCOME_META: Record<ChatwootBotTurnOutcome, TurnBadge & { hint: string }> = {
  llm: { label: 'LLM', color: 'success', hint: 'Відповідь моделі' },
  pattern: { label: 'Патерн', color: 'primary', hint: 'Правило автовідповіді' },
  fallback: { label: 'Fallback', color: 'danger', hint: 'Модель нічого не відповіла — стандартний текст' },
  handover: { label: 'Оператору', color: 'warning', hint: 'Бот передав розмову оператору' },
  handover_keyword: { label: 'Handover: слово', color: 'warning', hint: 'Клієнт попросив оператора' },
  emergency: { label: 'Екстрений', color: 'danger', hint: 'Екстрений виклик поза годинами' },
  callback: { label: 'Дзвінок', color: 'secondary', hint: 'Клієнт залишив контакт для дзвінка' },
  human_active: { label: 'Веде оператор', color: 'default', hint: 'Розмову веде оператор — бот мовчав' },
  reclaim: { label: 'Reclaim', color: 'secondary', hint: 'Бот забрав розмову в неактивного оператора' },
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
