/** База знань Chatwoot Bot (tool search_knowledge_base). */

export type ChatwootBotKnowledgeEntry = {
  id: number;
  title: string;
  /** Варіанти формулювань питання клієнта. */
  questions: string[];
  /** Факти, з яких LLM формулює відповідь своїми словами. */
  answer: string;
  tags: string[];
  enabled: boolean;
  hits: number;
  createdAt: string;
  updatedAt: string;
};

export type ChatwootBotKnowledgeEntryInput = {
  title: string;
  questions: string[];
  answer: string;
  tags: string[];
  enabled: boolean;
};

export type ChatwootBotKnowledgeSearchHit = {
  id: number;
  title: string;
  answer: string;
  score: number;
};

/** Результат LLM tool search_knowledge_base. */
export type ChatwootBotKnowledgeToolResult =
  | { found: true; entries: Array<{ title: string; answer: string }>; hint: string }
  | { found: false; hint: string };

export const CHATWOOT_BOT_KNOWLEDGE_LIMITS = {
  titleMax: 255,
  answerMax: 4000,
  questionsMax: 30,
  questionMax: 300,
  tagsMax: 20,
  tagMax: 50,
} as const;
