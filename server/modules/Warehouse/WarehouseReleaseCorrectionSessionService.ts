import type { Prisma } from '@prisma/client';
import { logServer, prisma } from '../../lib/utils.js';
import {
  createCorrectionSessionId,
  isReleaseBatchCorrection,
} from '../../../shared/utils/releaseBatchCorrection.js';
import {
  buildReleaseCorrectionMatchKey,
  patchReleaseItemsCorrectionSession,
  toReleasePairCandidate,
} from '../../../shared/utils/linkReleaseCorrectionPairs.js';
import { resolveStoredCorrectionSessionId } from '../../../shared/utils/releaseHistoryListGroup.js';

const ACTIVE_STATUSES = ['created', 'send_failed'];

function operationKind(value: string): 'kit' | 'unkit' | 'other' {
  const op = String(value ?? '').toLowerCase();
  if (op === 'kit') return 'kit';
  if (op === 'unkit') return 'unkit';
  return 'other';
}

export class WarehouseReleaseCorrectionSessionService {
  async mergeReleaseDocuments(releaseIds: number[]): Promise<{ sessionId: string; updatedIds: number[] }> {
    const uniqueIds = [...new Set(releaseIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
    if (uniqueIds.length < 2) {
      throw new Error('Обʼєднання: потрібно щонайменше 2 документи коригування.');
    }

    const rows = await prisma.warehouseReleaseSet.findMany({
      where: {
        id: { in: uniqueIds },
        status: { in: ACTIVE_STATUSES },
      },
      select: {
        id: true,
        internalDocNumber: true,
        operationType: true,
        setSku: true,
        quantity: true,
        comment: true,
        createdAt: true,
        correctionSessionId: true,
        items: true,
      },
    });

    if (rows.length !== uniqueIds.length) {
      throw new Error('Не всі документи знайдено або вони вже видалені (deleted).');
    }

    for (const row of rows) {
      if (!isReleaseBatchCorrection(row)) {
        throw new Error(`Документ ${row.internalDocNumber ?? `#${row.id}`} не є коригуванням парт. обліку.`);
      }
    }

    const candidates = rows.map((row) => toReleasePairCandidate(row));
    const matchKeys = candidates.map((row) => buildReleaseCorrectionMatchKey(row)).filter(Boolean);
    const uniqueKeys = new Set(matchKeys);
    if (uniqueKeys.size !== 1) {
      throw new Error('Документи мають різний продукт, кількість або коментар — обʼєднати неможливо.');
    }

    const kit = candidates.find((row) => operationKind(row.operationType) === 'kit');
    if (!kit) {
      throw new Error('Серед документів немає комплектування (kit) — обʼєднати сесію неможливо.');
    }

    const existingSessions = candidates
      .map((row) => resolveStoredCorrectionSessionId(row))
      .filter((id): id is string => Boolean(id));
    const sessionId = existingSessions[0] ?? createCorrectionSessionId();

    for (const row of rows) {
      const nextItems = patchReleaseItemsCorrectionSession(row.items, sessionId);
      await prisma.warehouseReleaseSet.update({
        where: { id: row.id },
        data: {
          correctionSessionId: sessionId,
          items: nextItems as Prisma.InputJsonValue,
        },
      });
    }

    logServer('[WarehouseReleaseCorrectionSession] merged', {
      sessionId,
      updatedIds: uniqueIds,
    });

    return { sessionId, updatedIds: uniqueIds };
  }
}

export const warehouseReleaseCorrectionSessionService = new WarehouseReleaseCorrectionSessionService();
