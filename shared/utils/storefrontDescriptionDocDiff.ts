import type {
  StorefrontBlockNodeAttrs,
  StorefrontDescriptionDoc,
  StorefrontDescriptionNode,
} from '../types/storefront.js';
import {
  normalizeStorefrontDescriptionDoc,
  storefrontDescriptionNodesSemanticallyEqual,
} from './storefrontDescription.js';

export type StorefrontDocBlockDiffKind = 'only_local' | 'only_remote' | 'changed';

export interface StorefrontDocBlockDiff {
  index: number;
  blockId: string | null;
  blockType: string;
  kind: StorefrontDocBlockDiffKind;
}

function parseStorefrontDoc(raw: string | null | undefined): StorefrontDescriptionDoc | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as StorefrontDescriptionDoc).type === 'doc' &&
      Array.isArray((parsed as StorefrontDescriptionDoc).content)
    ) {
      return parsed as StorefrontDescriptionDoc;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function normalizedStorefrontDoc(raw: string | null | undefined): StorefrontDescriptionDoc | null {
  const doc = parseStorefrontDoc(raw);
  return doc ? normalizeStorefrontDescriptionDoc(doc) : null;
}

/** Чи BO і WC doc дають однаковий зміст на вітрині (не байтовий JSON). */
export function storefrontDescriptionDocsSemanticallyEqual(
  localRaw: string | null | undefined,
  remoteRaw: string | null | undefined,
): boolean {
  return diffStorefrontDescriptionDocs(localRaw, remoteRaw).length === 0;
}

function blockLabel(node: StorefrontDescriptionNode, index: number): { blockId: string | null; blockType: string } {
  const attrs = node.attrs as StorefrontBlockNodeAttrs | undefined;
  return {
    blockId: attrs?.blockId?.trim() || null,
    blockType: node.type?.trim() || 'block',
  };
}

/** Порівняння TipTap doc BO vs WC (за blockId, далі за індексом). */
export function diffStorefrontDescriptionDocs(
  localRaw: string | null | undefined,
  remoteRaw: string | null | undefined,
): StorefrontDocBlockDiff[] {
  const localDoc = normalizedStorefrontDoc(localRaw);
  const remoteDoc = normalizedStorefrontDoc(remoteRaw);
  const localBlocks = localDoc?.content ?? [];
  const remoteBlocks = remoteDoc?.content ?? [];

  const diffs: StorefrontDocBlockDiff[] = [];
  const maxLen = Math.max(localBlocks.length, remoteBlocks.length);

  for (let index = 0; index < maxLen; index += 1) {
    const localBlock = localBlocks[index];
    const remoteBlock = remoteBlocks[index];
    const label = blockLabel(localBlock ?? remoteBlock!, index);

    if (!localBlock && remoteBlock) {
      diffs.push({ index, ...label, kind: 'only_remote' });
      continue;
    }
    if (localBlock && !remoteBlock) {
      diffs.push({ index, ...label, kind: 'only_local' });
      continue;
    }
    if (!localBlock || !remoteBlock) continue;

    const localId = blockLabel(localBlock, index).blockId;
    const remoteId = blockLabel(remoteBlock, index).blockId;
    if (localId && remoteId && localId !== remoteId) {
      diffs.push({ index, ...label, kind: 'changed' });
      continue;
    }

    if (!storefrontDescriptionNodesSemanticallyEqual(localBlock, remoteBlock)) {
      diffs.push({ index, ...label, kind: 'changed' });
    }
  }

  return diffs;
}

export function formatStorefrontDocBlockDiffLine(diff: StorefrontDocBlockDiff): string {
  const pos = diff.index + 1;
  const idPart = diff.blockId ? ` «${diff.blockId}»` : '';
  switch (diff.kind) {
    case 'only_local':
      return `Поз. ${pos}${idPart}: лише в Backoffice`;
    case 'only_remote':
      return `Поз. ${pos}${idPart}: лише в WooCommerce`;
    case 'changed':
      return `Поз. ${pos}${idPart} (${diff.blockType}): інший вміст`;
    default: {
      const _exhaustive: never = diff.kind;
      return String(_exhaustive);
    }
  }
}

export function summarizeStorefrontDescriptionDocDiff(
  localRaw: string | null | undefined,
  remoteRaw: string | null | undefined,
): { diffCount: number; lines: string[]; diffs: StorefrontDocBlockDiff[] } {
  const diffs = diffStorefrontDescriptionDocs(localRaw, remoteRaw);
  return {
    diffCount: diffs.length,
    lines: diffs.map(formatStorefrontDocBlockDiffLine),
    diffs,
  };
}

export function storefrontDocDiffContentIndexes(
  localRaw: string | null | undefined,
  remoteRaw: string | null | undefined,
): Set<number> {
  return new Set(diffStorefrontDescriptionDocs(localRaw, remoteRaw).map((d) => d.index));
}
