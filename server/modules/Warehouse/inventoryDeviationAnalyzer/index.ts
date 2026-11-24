import { prisma } from '../../../lib/utils.js';
import type { DeviationHintsResponse } from '../../../../shared/types/inventoryDeviationHints.js';
import { resolveInventorySessionWarehouseScope, normalizeInventoryItemsForScope } from '../../../../shared/utils/inventorySessionWarehouse.js';
import { safeParseItems } from '../historyNormalize.js';
import { collectCandidates, resolveAnalysisWindow, resolveSkuNames, type SessionItemWithMeta } from './collectCandidates.js';
import { buildDeviationVector } from './deviationVector.js';
import { scoreHypotheses } from './scoreHypotheses.js';
import { detectResidualPatterns, HISTORY_SESSIONS, isCountingNoise, type PreviousSessionDeviation } from './chronicSkus.js';
import { loadPreviousCompletedSessions } from './previousSessions.js';

/** Аналізує відхилення інвентаризації та повертає ймовірні причини (rule-based). `null`, якщо сесії немає. */
export async function analyzeInventoryDeviations(sessionId: number): Promise<DeviationHintsResponse | null> {
  const session = await prisma.warehouseInventory.findUnique({
    where: { id: sessionId },
    select: { id: true, warehouse: true, items: true, inventoryDate: true, createdAt: true },
  });
  if (!session) return null;

  const rawItems = safeParseItems(session.items) as SessionItemWithMeta[];
  const scope = resolveInventorySessionWarehouseScope(session.warehouse, rawItems);
  const items = normalizeInventoryItemsForScope(rawItems, scope);
  const deviation = buildDeviationVector(items, scope);
  const inventoryDate = session.inventoryDate ?? session.createdAt;
  const window = await resolveAnalysisWindow(session.id, inventoryDate, scope);
  const windowPayload = { from: window.start.toISOString(), to: window.end.toISOString() };

  if (deviation.size === 0) {
    return { hypotheses: [], totalDeviationUnits: 0, explainedUnits: 0, residual: [], window: windowPayload };
  }

  const candidates = await collectCandidates({ items, deviation, scope, window });
  const candidateSkus = new Set<string>();
  for (const c of candidates) for (const sku of c.vector.keys()) candidateSkus.add(sku);
  const names = await resolveSkuNames(items, candidateSkus);

  const result = scoreHypotheses(deviation, candidates, {
    names,
    windowStart: window.start.getTime(),
    windowEnd: window.end.getTime(),
  });

  const previousRows = await loadPreviousCompletedSessions({
    sessionId: session.id,
    inventoryDate,
    scope,
    limit: HISTORY_SESSIONS,
  });
  const previous: PreviousSessionDeviation[] = previousRows.map((row) => ({
    sessionId: row.id,
    deviation: buildDeviationVector(normalizeInventoryItemsForScope(row.items as SessionItemWithMeta[], scope), scope),
  }));
  const residual = detectResidualPatterns(result.residual, previous);
  const countingNoise = isCountingNoise(residual, result.hypotheses.length);

  return {
    ...result,
    residual,
    window: windowPayload,
    historySessions: previous.length,
    ...(countingNoise ? { countingNoise: true } : {}),
  };
}
