import { prisma, logServer } from '../../lib/utils.js';
import type { LlmUsageFeature, LlmUsageProvider, LlmUsageSummaryResponse } from '../../../shared/types/llm.js';
import { summarizeLlmUsage } from './llmUsageSummary.js';

/**
 * Журнал платних викликів LLM (`llm_usage_log`): пишуть LlmService, тести моделей і Jev.
 * Запис — fire-and-forget: збій журналу не ламає відповідь бота.
 */

const RETENTION_DAYS = 365;
const ERROR_MAX_CHARS = 255;

export type LlmUsageEntry = {
  provider: LlmUsageProvider;
  model: string;
  feature?: LlmUsageFeature;
  inputTokens?: number;
  outputTokens?: number;
  apiCalls?: number;
  costUsd?: number | null;
  error?: unknown;
};

function errorText(error: unknown): string | null {
  if (error == null) return null;
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, ERROR_MAX_CHARS);
}

export class LlmUsageLogService {
  record(entry: LlmUsageEntry): void {
    const cost = entry.costUsd;
    void prisma.llmUsageLog
      .create({
        data: {
          provider: entry.provider,
          model: entry.model.slice(0, 191),
          feature: entry.feature ?? 'other',
          inputTokens: Math.max(0, Math.round(entry.inputTokens ?? 0)),
          outputTokens: Math.max(0, Math.round(entry.outputTokens ?? 0)),
          apiCalls: Math.max(1, entry.apiCalls ?? 1),
          costUsd: cost != null && Number.isFinite(cost) ? cost : null,
          ok: entry.error == null,
          error: errorText(entry.error),
        },
      })
      .catch((err: unknown) => logServer('[LlmUsageLog] record failed', err));
  }

  async getSummary(days: number, now = new Date()): Promise<LlmUsageSummaryResponse> {
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.llmUsageLog.findMany({
      where: { createdAt: { gte: from } },
      select: {
        createdAt: true,
        provider: true,
        model: true,
        feature: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        ok: true,
      },
    });
    return summarizeLlmUsage(
      rows.map((row) => ({ ...row, costUsd: row.costUsd == null ? null : Number(row.costUsd) })),
      days,
      now,
    );
  }

  async purgeOld(): Promise<number> {
    const before = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await prisma.llmUsageLog.deleteMany({ where: { createdAt: { lt: before } } });
    return count;
  }
}

export const llmUsageLogService = new LlmUsageLogService();
