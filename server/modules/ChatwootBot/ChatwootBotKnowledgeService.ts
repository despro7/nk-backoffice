import { logServer, prisma } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_KNOWLEDGE_LIMITS as LIMITS,
  type ChatwootBotKnowledgeEntry,
  type ChatwootBotKnowledgeEntryInput,
  type ChatwootBotKnowledgeSearchHit,
  type ChatwootBotKnowledgeToolResult,
} from '../../../shared/types/chatwootBotKnowledge.js';
import {
  indexKnowledgeDoc,
  searchKnowledgeIndex,
  type KnowledgeSearchIndexEntry,
} from './chatwootBotKnowledgeSearch.js';

/** Прод і локальний BO ділять БД, тому кеш короткий навіть з інвалідацією на запис. */
const INDEX_TTL_MS = 60_000;
const TOOL_RESULT_LIMIT = 3;

export class ChatwootBotKnowledgeValidationError extends Error {}

type KnowledgeRow = {
  id: number;
  title: string;
  questions: unknown;
  answer: string;
  tags: unknown;
  enabled: boolean;
  hits: number;
  createdAt: Date;
  updatedAt: Date;
};

function toStringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

function toDto(row: KnowledgeRow): ChatwootBotKnowledgeEntry {
  return {
    id: row.id,
    title: row.title,
    questions: toStringList(row.questions),
    answer: row.answer,
    tags: toStringList(row.tags),
    enabled: row.enabled,
    hits: row.hits,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function cleanList(raw: unknown, maxItems: number, maxLength: number): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const value = item.replace(/\s+/g, ' ').trim().slice(0, maxLength);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function sanitizeKnowledgeInput(input: Partial<ChatwootBotKnowledgeEntryInput>): ChatwootBotKnowledgeEntryInput {
  const title = String(input.title ?? '').trim();
  const answer = String(input.answer ?? '').trim();
  if (!title) throw new ChatwootBotKnowledgeValidationError('Вкажіть назву статті');
  if (title.length > LIMITS.titleMax) {
    throw new ChatwootBotKnowledgeValidationError(`Назва довша за ${LIMITS.titleMax} символів`);
  }
  if (!answer) throw new ChatwootBotKnowledgeValidationError('Вкажіть відповідь (факти для бота)');
  if (answer.length > LIMITS.answerMax) {
    throw new ChatwootBotKnowledgeValidationError(`Відповідь довша за ${LIMITS.answerMax} символів`);
  }
  return {
    title,
    answer,
    questions: cleanList(input.questions, LIMITS.questionsMax, LIMITS.questionMax),
    tags: cleanList(input.tags, LIMITS.tagsMax, LIMITS.tagMax),
    enabled: input.enabled !== false,
  };
}

export class ChatwootBotKnowledgeService {
  private index: KnowledgeSearchIndexEntry<ChatwootBotKnowledgeEntry>[] | null = null;
  private indexExpiresAt = 0;

  private invalidate(): void {
    this.index = null;
  }

  private async getIndex(): Promise<KnowledgeSearchIndexEntry<ChatwootBotKnowledgeEntry>[]> {
    if (this.index && Date.now() < this.indexExpiresAt) return this.index;
    const rows = await prisma.chatwootBotKnowledgeEntry.findMany({ where: { enabled: true } });
    this.index = rows.map((row) => indexKnowledgeDoc(toDto(row)));
    this.indexExpiresAt = Date.now() + INDEX_TTL_MS;
    return this.index;
  }

  async list(): Promise<ChatwootBotKnowledgeEntry[]> {
    const rows = await prisma.chatwootBotKnowledgeEntry.findMany({ orderBy: [{ updatedAt: 'desc' }] });
    return rows.map(toDto);
  }

  async create(input: Partial<ChatwootBotKnowledgeEntryInput>, userId: number | null): Promise<ChatwootBotKnowledgeEntry> {
    const data = sanitizeKnowledgeInput(input);
    const row = await prisma.chatwootBotKnowledgeEntry.create({
      data: { ...data, createdBy: userId, updatedBy: userId },
    });
    this.invalidate();
    return toDto(row);
  }

  async update(
    id: number,
    input: Partial<ChatwootBotKnowledgeEntryInput>,
    userId: number | null,
  ): Promise<ChatwootBotKnowledgeEntry> {
    const data = sanitizeKnowledgeInput(input);
    const row = await prisma.chatwootBotKnowledgeEntry.update({
      where: { id },
      data: { ...data, updatedBy: userId },
    });
    this.invalidate();
    return toDto(row);
  }

  async remove(id: number): Promise<void> {
    await prisma.chatwootBotKnowledgeEntry.delete({ where: { id } });
    this.invalidate();
  }

  async search(query: string, limit = TOOL_RESULT_LIMIT): Promise<ChatwootBotKnowledgeSearchHit[]> {
    const index = await this.getIndex();
    return searchKnowledgeIndex(index, query, limit).map(({ doc, score }) => ({
      id: doc.id,
      title: doc.title,
      answer: doc.answer,
      score,
    }));
  }

  /** LLM tool search_knowledge_base: факти без службових полів + лічильник використань. */
  async searchForTool(query: string): Promise<ChatwootBotKnowledgeToolResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { found: false, hint: 'Передай у query суть питання клієнта.' };
    }
    let hits: ChatwootBotKnowledgeSearchHit[];
    try {
      hits = await this.search(trimmed);
    } catch (err) {
      logServer('[ChatwootBot] knowledge search failed (non-fatal)', err);
      return { found: false, hint: 'База знань тимчасово недоступна. Спробуй get_storefront_site_pages або запропонуй оператора.' };
    }
    if (hits.length === 0) {
      return {
        found: false,
        hint: 'У базі знань немає відповіді. Спробуй get_storefront_site_pages; якщо й там немає – чесно скажи й запропонуй оператора.',
      };
    }
    void prisma.chatwootBotKnowledgeEntry
      .updateMany({ where: { id: { in: hits.map((h) => h.id) } }, data: { hits: { increment: 1 } } })
      .catch((err: unknown) => logServer('[ChatwootBot] knowledge hits update failed', err));
    return {
      found: true,
      entries: hits.map((h) => ({ title: h.title, answer: h.answer })),
      hint: 'Сформулюй відповідь своїми словами лише за цими фактами; не вигадуй того, чого тут немає.',
    };
  }
}

export const chatwootBotKnowledgeService = new ChatwootBotKnowledgeService();
