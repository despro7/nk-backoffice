import type {
  ChatwootBotActionRequestDto,
  ChatwootBotActionScenario,
  ChatwootBotActionSolution,
} from '../../../shared/types/chatwootBotScenarios.js';
import type { ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';
import { knowledgeStems, indexKnowledgeDoc, searchKnowledgeIndex } from './chatwootBotKnowledgeSearch.js';
import { clusterQuestions, type QuestionSample } from './chatwootBotQuestionClusters.js';

/** Дії, які бот уже вміє без сценарію: вбудовані інструменти й потоки. */
const BUILT_IN_ACTIONS: Array<{
  stems: string[];
  title: string;
  enabled: (settings: ChatwootBotSettings) => boolean;
}> = [
  {
    stems: ['~скасування'],
    title: 'Скасування замовлення (request_order_cancellation)',
    enabled: (settings) => settings.orderCancelEnabled,
  },
  {
    stems: ['передз', 'зател', 'перез', 'позво', 'дзвін'],
    title: 'Дзвінок оператора: збір контактів поза годинами',
    enabled: () => true,
  },
];

function builtInSolution(text: string, settings: ChatwootBotSettings): ChatwootBotActionSolution | null {
  const stems = [...knowledgeStems(text)];
  for (const action of BUILT_IN_ACTIONS) {
    if (stems.some((stem) => action.stems.some((prefix) => stem.startsWith(prefix)))) {
      return { kind: 'tool', title: action.title, enabled: action.enabled(settings) };
    }
  }
  return null;
}

/** Сценарій, що найкраще пасує до запиту (назва й фрази-тригери; пошук як у базі знань). */
export function matchScenario(
  text: string,
  scenarios: ChatwootBotActionScenario[],
): ChatwootBotActionScenario | null {
  if (scenarios.length === 0) return null;
  const index = scenarios.map((s, i) =>
    indexKnowledgeDoc({ id: i, title: s.title, questions: s.triggers, tags: [], answer: '' }),
  );
  const [hit] = searchKnowledgeIndex(index, text, 1);
  return hit ? scenarios[hit.doc.id] : null;
}

/**
 * Групи схожих запитів на дію за період і чи є для них рішення:
 * сценарій з налаштувань, вбудований інструмент або нічого (передається оператору).
 */
export function buildActionRequests(
  samples: QuestionSample[],
  settings: Pick<ChatwootBotSettings, 'actionScenarios'> & ChatwootBotSettings,
  maxClusters = 20,
): ChatwootBotActionRequestDto[] {
  return clusterQuestions(samples, { maxClusters }).map((cluster) => {
    const texts = [cluster.label, ...cluster.examples].join(' ');
    const scenario = matchScenario(texts, settings.actionScenarios);
    const solution: ChatwootBotActionSolution = scenario
      ? { kind: 'scenario', title: scenario.title, enabled: scenario.enabled, scenarioId: scenario.id }
      : (builtInSolution(texts, settings) ?? { kind: 'none', title: 'Передається оператору', enabled: false });
    return { label: cluster.label, count: cluster.count, examples: cluster.examples, solution };
  });
}
