import { isRebatchSku } from '../types/warehouseRelease.js';
import {
  BATCH_CORRECTION_COMMENT_PREFIX_RE,
  BATCH_CORRECTION_COMMENT_STRIP_RE,
  normalizeCorrectionSessionId,
  REBATCH_COMMENT_UI_PREFIX_RE,
} from './releaseBatchCorrection.js';
import { resolveStoredCorrectionSessionId } from './releaseHistoryListGroup.js';

export type ReleasePairCandidate = {
  id: number;
  internalDocNumber: string | null;
  operationType: string;
  setSku: string | null;
  quantity: number;
  comment: string | null;
  createdAt: Date;
  correctionSessionId: string | null;
  items: unknown;
};

export type ReleaseCorrectionPair = {
  matchKey: string;
  kit: ReleasePairCandidate;
  unkit: ReleasePairCandidate;
  sessionId: string;
  reason: 'new_link' | 'reinforce_existing';
  /** Усі kit/unkit однієї сесії (напр. kit + помилковий unkit + успішний unkit). */
  memberIds?: number[];
};

export type SkippedAmbiguous = {
  matchKey: string;
  kitIds: number[];
  unkitIds: number[];
  reason: string;
};

export type LinkReleaseCorrectionPairsResult = {
  pairs: ReleaseCorrectionPair[];
  alreadyLinked: ReleaseCorrectionPair[];
  skipped: SkippedAmbiguous[];
};

export type InvalidLinkedCorrectionPair = {
  sessionId: string;
  kit: ReleasePairCandidate;
  unkit: ReleasePairCandidate;
  kitMatchKey: string | null;
  unkitMatchKey: string | null;
  reason: string;
};

export type AuditLinkedReleaseCorrectionSessionsResult = {
  validLinked: ReleaseCorrectionPair[];
  invalidLinked: InvalidLinkedCorrectionPair[];
  /** Записи з session id, але без валідної пари kit+unkit у сесії. */
  orphanIds: number[];
};

function normalizeComment(comment: string | null): string {
  return String(comment ?? '').replace(/\s+/g, ' ').trim();
}

function resolveSetSku(row: ReleasePairCandidate): string {
  const direct = String(row.setSku ?? '').trim();
  if (direct) return direct.toLowerCase();
  if (!Array.isArray(row.items) || row.items.length === 0) return '';
  const first = row.items[0];
  if (!first || typeof first !== 'object') return '';
  const item = first as { set_sku?: unknown; setSku?: unknown; sku?: unknown };
  return String(item.set_sku ?? item.setSku ?? item.sku ?? '').trim().toLowerCase();
}

export function toReleasePairCandidate(row: {
  id: number;
  internalDocNumber?: string | null;
  operationType?: string | null;
  setSku?: string | null;
  quantity?: number | null;
  comment?: string | null;
  createdAt: Date;
  correctionSessionId?: string | null;
  items?: unknown;
}): ReleasePairCandidate {
  return {
    id: row.id,
    internalDocNumber: row.internalDocNumber ?? null,
    operationType: String(row.operationType ?? ''),
    setSku: row.setSku ?? null,
    quantity: Number(row.quantity ?? 0),
    comment: row.comment ?? null,
    createdAt: row.createdAt,
    correctionSessionId: row.correctionSessionId ?? null,
    items: row.items,
  };
}

export function releaseCorrectionPairIsConsistent(
  kit: ReleasePairCandidate,
  unkit: ReleasePairCandidate,
): boolean {
  const kitKey = buildReleaseCorrectionMatchKey(kit);
  const unkitKey = buildReleaseCorrectionMatchKey(unkit);
  return Boolean(kitKey && unkitKey && kitKey === unkitKey);
}

/** Різні назви продукту в коментарі — явно хибна пара (напр. Печеня vs Борщ). */
export function correctionPairClearlyMismatch(
  kit: ReleasePairCandidate,
  unkit: ReleasePairCandidate,
): boolean {
  const kLabel = normalizeReleaseCorrectionMatchComment(kit.comment);
  const uLabel = normalizeReleaseCorrectionMatchComment(unkit.comment);
  if (!kLabel || !uLabel) return false;
  return kLabel !== uLabel;
}

function sharedCorrectionSessionId(members: ReleasePairCandidate[]): string | null {
  const ids = members
    .map((row) => resolveStoredCorrectionSessionId(row))
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return null;
  const first = ids[0];
  return ids.every((id) => id === first) ? first : null;
}

function normalizeReleaseCorrectionMatchComment(comment: string | null): string {
  return normalizeComment(comment)
    .replace(BATCH_CORRECTION_COMMENT_STRIP_RE, '')
    .replace(REBATCH_COMMENT_UI_PREFIX_RE, '')
    .trim()
    .toLowerCase();
}

function usesBatchCorrectionMatchKey(row: ReleasePairCandidate): boolean {
  const comment = normalizeComment(row.comment);
  if (BATCH_CORRECTION_COMMENT_PREFIX_RE.test(comment)) return true;
  const sku = resolveSetSku(row);
  return isRebatchSku(sku);
}

export function buildReleaseCorrectionMatchKey(row: ReleasePairCandidate): string | null {
  const comment = normalizeComment(row.comment);
  const quantity = Number(row.quantity);
  if (!comment || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  if (usesBatchCorrectionMatchKey(row)) {
    const productLabel = normalizeReleaseCorrectionMatchComment(row.comment);
    if (!productLabel) return null;
    return `batch|${quantity}|${productLabel}`;
  }
  const sku = resolveSetSku(row);
  if (!sku) return null;
  return `${sku}|${quantity}|${comment}`;
}

function operationKind(value: string): 'kit' | 'unkit' | 'other' {
  const op = String(value ?? '').toLowerCase();
  if (op === 'kit') return 'kit';
  if (op === 'unkit') return 'unkit';
  return 'other';
}

function isAlreadyPaired(kit: ReleasePairCandidate, unkit: ReleasePairCandidate): boolean {
  const kitSession = resolveStoredCorrectionSessionId(kit);
  const unkitSession = resolveStoredCorrectionSessionId(unkit);
  return Boolean(
    kitSession
    && unkitSession
    && kitSession === unkitSession
    && releaseCorrectionPairIsConsistent(kit, unkit),
  );
}

function correctionSessionGroupAlreadyLinked(
  kit: ReleasePairCandidate,
  unkits: ReleasePairCandidate[],
): boolean {
  const sessionId = resolveStoredCorrectionSessionId(kit);
  if (!sessionId || unkits.length === 0) return false;
  return unkits.every((unkit) => (
    resolveStoredCorrectionSessionId(unkit) === sessionId
    && releaseCorrectionPairIsConsistent(kit, unkit)
  ));
}

function pickPrimaryUnkitForLink(unkits: ReleasePairCandidate[]): ReleasePairCandidate {
  const sorted = [...unkits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return sorted.at(-1)!;
}

/** Кандидати для ручного обʼєднання (той самий matchKey, інша/відсутня session). */
export function listReleaseCorrectionMergeCandidates(
  anchor: ReleasePairCandidate,
  pool: ReleasePairCandidate[],
): ReleasePairCandidate[] {
  const anchorKey = buildReleaseCorrectionMatchKey(anchor);
  if (!anchorKey) return [];
  const anchorSession = resolveStoredCorrectionSessionId(anchor);

  return pool.filter((row) => {
    if (row.id === anchor.id) return false;
    const key = buildReleaseCorrectionMatchKey(row);
    if (!key || key !== anchorKey) return false;
    const rowSession = resolveStoredCorrectionSessionId(row);
    if (anchorSession && rowSession && anchorSession === rowSession) return false;
    return true;
  });
}

/** Пара kit ↔ unkit за одним matchKey (унікальна кількість → зазвичай 1:1). */
export function pairKitUnkitByTimeline(
  kits: ReleasePairCandidate[],
  unkits: ReleasePairCandidate[],
): Array<{ kit: ReleasePairCandidate; unkit: ReleasePairCandidate }> {
  if (kits.length === 1 && unkits.length === 1) {
    if (releaseCorrectionPairIsConsistent(kits[0], unkits[0])) {
      return [{ kit: kits[0], unkit: unkits[0] }];
    }
    return [];
  }

  const sortedKits = [...kits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const sortedUnkits = [...unkits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const pairs: Array<{ kit: ReleasePairCandidate; unkit: ReleasePairCandidate }> = [];
  const usedUnkits = new Set<number>();

  for (const kit of sortedKits) {
    let unkit = sortedUnkits.find((row) => (
      !usedUnkits.has(row.id)
      && row.createdAt.getTime() >= kit.createdAt.getTime()
      && releaseCorrectionPairIsConsistent(kit, row)
    ));
    if (!unkit) {
      unkit = sortedUnkits.find((row) => (
        !usedUnkits.has(row.id)
        && releaseCorrectionPairIsConsistent(kit, row)
      ));
    }
    if (!unkit) continue;
    usedUnkits.add(unkit.id);
    pairs.push({ kit, unkit });
  }

  return pairs;
}

/** Розбиває членів однієї correctionSession на валідні пари kit+unkit та одиночні рядки. */
export function partitionCorrectionSessionMembers(
  members: ReleasePairCandidate[],
): ReleasePairCandidate[][] {
  if (members.length <= 1) {
    return [members];
  }

  const kits = members.filter((row) => operationKind(row.operationType) === 'kit');
  const unkits = members.filter((row) => operationKind(row.operationType) === 'unkit');
  const others = members.filter((row) => operationKind(row.operationType) === 'other');
  const sharedSession = sharedCorrectionSessionId(members);

  if (members.length === 2 && kits.length === 1 && unkits.length === 1 && sharedSession) {
    const kit = kits[0];
    const unkit = unkits[0];
    if (correctionPairClearlyMismatch(kit, unkit)) {
      return [[kit], [unkit]];
    }
    return [[kit, unkit]];
  }

  if (sharedSession && kits.length === 1 && unkits.length >= 2) {
    const kit = kits[0];
    const sortedUnkits = [...unkits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return [[kit, ...sortedUnkits, ...others]];
  }

  const pairs = pairKitUnkitByTimeline(kits, unkits);
  const usedIds = new Set<number>();
  for (const pair of pairs) {
    usedIds.add(pair.kit.id);
    usedIds.add(pair.unkit.id);
  }

  const groups: ReleasePairCandidate[][] = pairs.map((pair) => [pair.kit, pair.unkit]);
  for (const row of members) {
    if (usedIds.has(row.id)) continue;
    groups.push([row]);
  }
  for (const row of others) {
    if (!usedIds.has(row.id)) {
      groups.push([row]);
      usedIds.add(row.id);
    }
  }

  return groups.length > 0 ? groups : [members];
}

export function auditLinkedReleaseCorrectionSessions(
  rows: ReleasePairCandidate[],
): AuditLinkedReleaseCorrectionSessionsResult {
  const bySession = new Map<string, ReleasePairCandidate[]>();

  for (const row of rows) {
    const sessionId = resolveStoredCorrectionSessionId(row);
    if (!sessionId) continue;
    const bucket = bySession.get(sessionId) ?? [];
    bucket.push(row);
    bySession.set(sessionId, bucket);
  }

  const validLinked: ReleaseCorrectionPair[] = [];
  const invalidLinked: InvalidLinkedCorrectionPair[] = [];
  const orphanIds: number[] = [];

  for (const [sessionId, bucket] of bySession.entries()) {
    const kit = bucket.find((row) => operationKind(row.operationType) === 'kit');
    const unkit = bucket.find((row) => operationKind(row.operationType) === 'unkit');

    if (kit && unkit && bucket.length === 2 && correctionPairClearlyMismatch(kit, unkit)) {
      invalidLinked.push({
        sessionId,
        kit,
        unkit,
        kitMatchKey: buildReleaseCorrectionMatchKey(kit),
        unkitMatchKey: buildReleaseCorrectionMatchKey(unkit),
        reason: 'Спільна correctionSession, але різний продукт у коментарі.',
      });
      continue;
    }

    const partitions = partitionCorrectionSessionMembers(bucket);
    const pairedIds = new Set<number>();

    for (const group of partitions) {
      const groupKit = group.find((row) => operationKind(row.operationType) === 'kit');
      const groupUnkits = group.filter((row) => operationKind(row.operationType) === 'unkit');

      if (groupKit && groupUnkits.length >= 1 && group.length >= 2) {
        const primaryUnkit = pickPrimaryUnkitForLink(groupUnkits);
        for (const row of group) pairedIds.add(row.id);
        validLinked.push({
          matchKey: buildReleaseCorrectionMatchKey(groupKit) ?? '',
          kit: groupKit,
          unkit: primaryUnkit,
          sessionId,
          reason: 'reinforce_existing',
          memberIds: group.map((row) => row.id),
        });
        continue;
      }

      if (group.length === 2) {
        const groupUnkit = groupUnkits[0];
        if (!groupKit || !groupUnkit) {
          for (const row of group) orphanIds.push(row.id);
          continue;
        }
        pairedIds.add(groupKit.id);
        pairedIds.add(groupUnkit.id);
        validLinked.push({
          matchKey: buildReleaseCorrectionMatchKey(groupKit) ?? '',
          kit: groupKit,
          unkit: groupUnkit,
          sessionId,
          reason: 'reinforce_existing',
        });
        continue;
      }
      for (const row of group) {
        orphanIds.push(row.id);
      }
    }

    for (const row of bucket) {
      if (!pairedIds.has(row.id)) {
        const inInvalid = invalidLinked.some((pair) => pair.kit.id === row.id || pair.unkit.id === row.id);
        if (!inInvalid && !orphanIds.includes(row.id)) {
          orphanIds.push(row.id);
        }
      }
    }
  }

  return { validLinked, invalidLinked, orphanIds };
}

export function collectIdsToUnlinkInvalidCorrectionPairs(
  invalidLinked: InvalidLinkedCorrectionPair[],
): number[] {
  const ids = new Set<number>();
  for (const pair of invalidLinked) {
    ids.add(pair.kit.id);
    ids.add(pair.unkit.id);
  }
  return [...ids];
}

function resolveLinkSessionId(
  kit: ReleasePairCandidate,
  unkit: ReleasePairCandidate,
  createSessionId: () => string,
): string {
  const kitSession = resolveStoredCorrectionSessionId(kit);
  const unkitSession = resolveStoredCorrectionSessionId(unkit);
  if (kitSession && unkitSession && kitSession === unkitSession) {
    return kitSession;
  }
  if (kitSession && unkitSession && kitSession !== unkitSession) {
    return createSessionId();
  }
  return normalizeCorrectionSessionId(kitSession ?? unkitSession) ?? createSessionId();
}

export function planReleaseCorrectionPairLinks(
  rows: ReleasePairCandidate[],
  createSessionId: () => string = () => `repair-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
): LinkReleaseCorrectionPairsResult {
  const buckets = new Map<string, ReleasePairCandidate[]>();

  for (const row of rows) {
    const key = buildReleaseCorrectionMatchKey(row);
    if (!key) continue;
    if (operationKind(row.operationType) === 'other') continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const pairs: ReleaseCorrectionPair[] = [];
  const alreadyLinked: ReleaseCorrectionPair[] = [];
  const skipped: SkippedAmbiguous[] = [];

  for (const [matchKey, bucket] of buckets.entries()) {
    const kits = bucket.filter((row) => operationKind(row.operationType) === 'kit');
    const unkits = bucket.filter((row) => operationKind(row.operationType) === 'unkit');

    if (kits.length === 0 || unkits.length === 0) {
      continue;
    }

    if (
      kits.length === 1
      && unkits.every((unkit) => releaseCorrectionPairIsConsistent(kits[0], unkit))
    ) {
      const kit = kits[0];
      const memberIds = [kit.id, ...unkits.map((row) => row.id)];
      const primaryUnkit = pickPrimaryUnkitForLink(unkits);
      const sessionId = resolveLinkSessionId(kit, primaryUnkit, createSessionId);

      if (correctionSessionGroupAlreadyLinked(kit, unkits)) {
        alreadyLinked.push({
          matchKey,
          kit,
          unkit: primaryUnkit,
          sessionId: resolveStoredCorrectionSessionId(kit)!,
          reason: 'reinforce_existing',
          memberIds,
        });
      } else {
        pairs.push({
          matchKey,
          kit,
          unkit: primaryUnkit,
          sessionId,
          reason: 'new_link',
          memberIds,
        });
      }
      continue;
    }

    const timelinePairs = pairKitUnkitByTimeline(kits, unkits);
    const pairedKitIds = new Set(timelinePairs.map((pair) => pair.kit.id));
    const pairedUnkitIds = new Set(timelinePairs.map((pair) => pair.unkit.id));
    const leftoverKits = kits.filter((row) => !pairedKitIds.has(row.id)).map((row) => row.id);
    const leftoverUnkits = unkits.filter((row) => !pairedUnkitIds.has(row.id)).map((row) => row.id);

    if (leftoverKits.length > 0 || leftoverUnkits.length > 0) {
      skipped.push({
        matchKey,
        kitIds: leftoverKits.length > 0 ? leftoverKits : kits.map((row) => row.id),
        unkitIds: leftoverUnkits.length > 0 ? leftoverUnkits : unkits.map((row) => row.id),
        reason: leftoverKits.length > 0 && leftoverUnkits.length > 0
          ? 'Не вдалося однозначно зʼєднати всі kit/unkit (різна кількість або порядок дат).'
          : leftoverKits.length > 0
            ? 'Залишились kit без відповідного unkit після того ж коментаря/SKU/кількості.'
            : 'Залишились unkit без відповідного kit.',
      });
    }

    if (timelinePairs.length === 0) {
      continue;
    }

    if (kits.length > 1 || unkits.length > 1) {
      const uniquePairCount = timelinePairs.length;
      const maxPossible = Math.min(kits.length, unkits.length);
      if (uniquePairCount < maxPossible && leftoverKits.length === 0 && leftoverUnkits.length === 0) {
        skipped.push({
          matchKey,
          kitIds: kits.map((row) => row.id),
          unkitIds: unkits.map((row) => row.id),
          reason: 'Кілька можливих пар з однаковим ключем — пропущено повне автозʼєднання.',
        });
      }
    }

    for (const { kit, unkit } of timelinePairs) {
      if (isAlreadyPaired(kit, unkit)) {
        alreadyLinked.push({
          matchKey,
          kit,
          unkit,
          sessionId: resolveStoredCorrectionSessionId(kit)!,
          reason: 'reinforce_existing',
        });
        continue;
      }

      pairs.push({
        matchKey,
        kit,
        unkit,
        sessionId: resolveLinkSessionId(kit, unkit, createSessionId),
        reason: 'new_link',
      });
    }
  }

  return { pairs, alreadyLinked, skipped };
}

export function patchReleaseItemsCorrectionSession(items: unknown, sessionId: string): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item, index) => {
    if (index !== 0 || !item || typeof item !== 'object') return item;
    return {
      ...(item as Record<string, unknown>),
      correction_session_id: sessionId,
    };
  });
}

export function clearReleaseItemsCorrectionSession(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item, index) => {
    if (index !== 0 || !item || typeof item !== 'object') return item;
    const copy = { ...(item as Record<string, unknown>) };
    delete copy.correction_session_id;
    return copy;
  });
}
