import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { logServer, prisma } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_TOPIC_LIMITS as LIMITS,
  type ChatwootBotTopicDeleteMode,
  type ChatwootBotTopicQuestionsAction,
  type ChatwootBotTopicRef,
} from '../../../shared/types/chatwootBotTopics.js';
import { assignQuestionsToTopics } from './chatwootBotTopicAssign.js';

/**
 * Збережені теми питань клієнтів. Перша лінія — алгоритм (`sync`): нові питання розкладаються
 * по темах або утворюють нові. Менеджер виправляє вручну; ручне призначення алгоритм не чіпає.
 */

/** Прод і локальний BO ділять БД; частіше синхронізувати немає сенсу. */
const SYNC_INTERVAL_MS = 30_000;

export class ChatwootBotTopicsValidationError extends Error {}

export function questionHash(contentNorm: string): string {
  return createHash('sha256').update(contentNorm).digest('hex');
}

export type TopicAssignmentRow = {
  questionHash: string;
  contentNorm: string;
  preview: string;
  topicId: number | null;
  source: string;
  ignored: boolean;
};

export type TopicsSnapshot = {
  topics: ChatwootBotTopicRef[];
  /** contentNorm → призначення. */
  assignments: Map<string, TopicAssignmentRow>;
};

function cleanTitle(raw: unknown): string {
  const title = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!title) throw new ChatwootBotTopicsValidationError('Вкажіть назву теми');
  if (title.length > LIMITS.titleMax) {
    throw new ChatwootBotTopicsValidationError(`Назва довша за ${LIMITS.titleMax} символів`);
  }
  return title;
}

function cleanDescription(raw: unknown): string | null {
  const description = String(raw ?? '').trim();
  if (description.length > LIMITS.descriptionMax) {
    throw new ChatwootBotTopicsValidationError(`Опис довший за ${LIMITS.descriptionMax} символів`);
  }
  return description || null;
}

function cleanHashes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const hashes = [...new Set(list.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h)))];
  if (hashes.length === 0) throw new ChatwootBotTopicsValidationError('Не вибрано жодного питання');
  if (hashes.length > LIMITS.hashesMax) throw new ChatwootBotTopicsValidationError('Забагато питань за раз');
  return hashes;
}

export class ChatwootBotQuestionTopicsService {
  private lastSyncAt = 0;
  private running: Promise<void> | null = null;

  /** Розкласти нові питання. Без `force` — не частіше за SYNC_INTERVAL_MS. */
  async sync(force = false): Promise<void> {
    if (this.running) return this.running;
    if (!force && Date.now() - this.lastSyncAt < SYNC_INTERVAL_MS) return;
    this.running = this.runSync().finally(() => {
      this.lastSyncAt = Date.now();
      this.running = null;
    });
    return this.running;
  }

  private async runSync(): Promise<void> {
    const grouped = await prisma.chatwootBotAnalyticsEvent.groupBy({
      by: ['contentNorm'],
      where: { kind: 'customer_message', contentNorm: { not: null } },
      _count: { _all: true },
      _max: { contentPreview: true },
    });
    const questions = grouped
      .filter((g): g is typeof g & { contentNorm: string } => Boolean(g.contentNorm))
      .map((g) => ({
        key: g.contentNorm,
        text: g._max.contentPreview ?? g.contentNorm,
        count: g._count._all,
      }));

    const assignments = await prisma.chatwootBotQuestionAssignment.findMany({
      select: { contentNorm: true, topicId: true, ignored: true },
    });
    const assignedNorms = new Map(assignments.map((a) => [a.contentNorm, a]));
    const pendingKeys = questions
      .filter((q) => {
        const row = assignedNorms.get(q.key);
        return !row || (row.topicId == null && !row.ignored);
      })
      .map((q) => q.key);

    if (pendingKeys.length > 0) {
      const members = new Map<number, string[]>();
      for (const a of assignments) {
        if (a.topicId == null || a.ignored) continue;
        const list = members.get(a.topicId) ?? [];
        list.push(a.contentNorm);
        members.set(a.topicId, list);
      }
      const plan = assignQuestionsToTopics(
        questions,
        [...members].map(([id, memberKeys]) => ({ id, memberKeys })),
        pendingKeys,
      );
      const textByKey = new Map(questions.map((q) => [q.key, q.text]));

      type Write = { contentNorm: string; topicId: number | null; ignored: boolean; confidence: number | null };
      const upsert = (tx: Prisma.TransactionClient, write: Write) => {
        const hash = questionHash(write.contentNorm);
        const data = {
          topicId: write.topicId,
          ignored: write.ignored,
          confidence: write.confidence,
          source: 'auto',
          method: 'local',
          preview: (textByKey.get(write.contentNorm) ?? write.contentNorm).slice(0, 512),
        };
        return tx.chatwootBotQuestionAssignment.upsert({
          where: { questionHash: hash },
          create: { questionHash: hash, contentNorm: write.contentNorm, ...data },
          update: data,
        });
      };

      for (const write of [
        ...plan.assigned.map((a) => ({ contentNorm: a.key, topicId: a.topicId, ignored: false, confidence: a.score })),
        ...plan.noise.map((key) => ({ contentNorm: key, topicId: null, ignored: true, confidence: null })),
      ]) {
        await upsert(prisma, write);
      }
      // Тема і її питання — разом, щоб прибирання порожніх тем не встигло видалити нову.
      for (const draft of plan.newTopics) {
        await prisma.$transaction(async (tx) => {
          const topic = await tx.chatwootBotQuestionTopic.create({
            data: { title: draft.label.slice(0, LIMITS.titleMax), origin: 'auto' },
          });
          for (const key of draft.keys) {
            await upsert(tx, { contentNorm: key, topicId: topic.id, ignored: false, confidence: null });
          }
        });
      }
      logServer(
        `[ChatwootBotTopics] sync: ${plan.assigned.length} assigned, ${plan.newTopics.length} new topics, ${plan.noise.length} noise`,
      );
    }

    await this.deleteEmptyTopics();
  }

  private async deleteEmptyTopics(): Promise<void> {
    await prisma.chatwootBotQuestionTopic.deleteMany({
      where: { questions: { none: { ignored: false } } },
    });
  }

  /** Теми й призначення для статистики. Помилка синхронізації не ламає читання. */
  async snapshot(): Promise<TopicsSnapshot> {
    try {
      await this.sync();
    } catch (err) {
      logServer('[ChatwootBotTopics] sync failed (non-fatal)', err);
    }
    const [topics, rows] = await Promise.all([
      prisma.chatwootBotQuestionTopic.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
      prisma.chatwootBotQuestionAssignment.findMany({
        select: { questionHash: true, contentNorm: true, preview: true, topicId: true, source: true, ignored: true },
      }),
    ]);
    return { topics, assignments: new Map(rows.map((r) => [r.contentNorm, r])) };
  }

  async rename(id: number, input: { title?: unknown; description?: unknown }, userId: number | null): Promise<void> {
    await prisma.chatwootBotQuestionTopic.update({
      where: { id },
      data: {
        title: cleanTitle(input.title),
        ...(input.description !== undefined ? { description: cleanDescription(input.description) } : {}),
        origin: 'manual',
        updatedBy: userId,
      },
    });
  }

  /** Нова тема з вибраних питань — так розділяється тема, яку алгоритм склеїв зайве. */
  async createFromQuestions(input: { title?: unknown; hashes?: unknown }, userId: number | null): Promise<ChatwootBotTopicRef> {
    const title = cleanTitle(input.title);
    const hashes = cleanHashes(input.hashes);
    const topic = await prisma.$transaction(async (tx) => {
      const created = await tx.chatwootBotQuestionTopic.create({
        data: { title, origin: 'manual', createdBy: userId, updatedBy: userId },
      });
      const moved = await tx.chatwootBotQuestionAssignment.updateMany({
        where: { questionHash: { in: hashes } },
        data: { topicId: created.id, ignored: false, source: 'manual', method: 'manual', confidence: null, updatedBy: userId },
      });
      if (moved.count === 0) throw new ChatwootBotTopicsValidationError('Питання не знайдено');
      return created;
    });
    await this.deleteEmptyTopics();
    return { id: topic.id, title: topic.title };
  }

  async applyQuestionsAction(input: Partial<ChatwootBotTopicQuestionsAction>, userId: number | null): Promise<void> {
    const hashes = cleanHashes(input.hashes);
    const where = { questionHash: { in: hashes } };
    switch (input.action) {
      case 'move': {
        const topicId = Number((input as { topicId?: unknown }).topicId);
        const exists = Number.isInteger(topicId) && (await prisma.chatwootBotQuestionTopic.count({ where: { id: topicId } }));
        if (!exists) throw new ChatwootBotTopicsValidationError('Тему не знайдено');
        await prisma.chatwootBotQuestionAssignment.updateMany({
          where,
          data: { topicId, ignored: false, source: 'manual', method: 'manual', confidence: null, updatedBy: userId },
        });
        break;
      }
      case 'noise':
        await prisma.chatwootBotQuestionAssignment.updateMany({
          where,
          data: { topicId: null, ignored: true, source: 'manual', method: 'manual', confidence: null, updatedBy: userId },
        });
        break;
      case 'auto':
        await prisma.chatwootBotQuestionAssignment.updateMany({
          where,
          data: { topicId: null, ignored: false, source: 'auto', confidence: null, updatedBy: userId },
        });
        break;
      default:
        throw new ChatwootBotTopicsValidationError('Невідома дія');
    }
    await this.deleteEmptyTopics();
    await this.sync(true);
  }

  /** Злиття: питання тем-джерел переходять у цільову, джерела видаляються. */
  async merge(targetId: number, rawSourceIds: unknown, userId: number | null): Promise<void> {
    const sourceIds = [...new Set((Array.isArray(rawSourceIds) ? rawSourceIds : []).map(Number))].filter(
      (id) => Number.isInteger(id) && id > 0 && id !== targetId,
    );
    if (sourceIds.length === 0) throw new ChatwootBotTopicsValidationError('Виберіть теми для об’єднання');
    await prisma.$transaction(async (tx) => {
      await tx.chatwootBotQuestionTopic.update({
        where: { id: targetId },
        data: { origin: 'manual', updatedBy: userId },
      });
      await tx.chatwootBotQuestionAssignment.updateMany({
        where: { topicId: { in: sourceIds } },
        data: { topicId: targetId, updatedBy: userId },
      });
      await tx.chatwootBotQuestionTopic.deleteMany({ where: { id: { in: sourceIds } } });
    });
  }

  async remove(id: number, mode: ChatwootBotTopicDeleteMode, userId: number | null): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.chatwootBotQuestionAssignment.updateMany({
        where: { topicId: id },
        data:
          mode === 'ignore'
            ? { topicId: null, ignored: true, source: 'manual', method: 'manual', confidence: null, updatedBy: userId }
            : { topicId: null, ignored: false, source: 'auto', confidence: null, updatedBy: userId },
      });
      await tx.chatwootBotQuestionTopic.delete({ where: { id } });
    });
    if (mode === 'reassign') await this.sync(true);
  }
}

export const chatwootBotQuestionTopicsService = new ChatwootBotQuestionTopicsService();
