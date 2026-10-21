import type {
  StorefrontBlockNodeAttrs,
  StorefrontDescriptionDoc,
  StorefrontDescriptionNode,
} from '../types/storefront.js';
import {
  collectStorefrontDescriptionBlocksById,
  normalizeStorefrontDescriptionDoc,
  storefrontDescriptionDocMarketingPlain,
  storefrontDescriptionNodesSemanticallyEqual,
} from './storefrontDescription.js';

export type StorefrontDocBlockDiffKind = 'only_local' | 'only_remote' | 'changed';

export interface StorefrontDocBlockDiff {
  index: number;
  blockId: string | null;
  blockType: string;
  kind: StorefrontDocBlockDiffKind;
}

const MARKETING_BLOCK_ID = 'storefront-marketing';

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

function indexOfBlockId(doc: StorefrontDescriptionDoc, blockId: string): number {
  const idx = (doc.content ?? []).findIndex((node) => {
    const attrs = node.attrs as StorefrontBlockNodeAttrs | undefined;
    return attrs?.blockId === blockId;
  });
  return idx >= 0 ? idx : 0;
}

/** Порівняння TipTap doc BO vs WC (маркетинг + блоки за blockId, не лише індекс). */
export function diffStorefrontDescriptionDocs(
  localRaw: string | null | undefined,
  remoteRaw: string | null | undefined,
): StorefrontDocBlockDiff[] {
  const localDoc = normalizedStorefrontDoc(localRaw);
  const remoteDoc = normalizedStorefrontDoc(remoteRaw);
  const diffs: StorefrontDocBlockDiff[] = [];

  const localMarketing = storefrontDescriptionDocMarketingPlain(localDoc ?? { type: 'doc', content: [] });
  const remoteMarketing = storefrontDescriptionDocMarketingPlain(remoteDoc ?? { type: 'doc', content: [] });
  if (localMarketing !== remoteMarketing) {
    diffs.push({
      index: 0,
      blockId: MARKETING_BLOCK_ID,
      blockType: 'paragraph',
      kind: localMarketing && remoteMarketing ? 'changed' : localMarketing ? 'only_local' : 'only_remote',
    });
  }

  const localBlocks = collectStorefrontDescriptionBlocksById(localDoc ?? { type: 'doc', content: [] });
  const remoteBlocks = collectStorefrontDescriptionBlocksById(remoteDoc ?? { type: 'doc', content: [] });
  const blockIds = new Set([...localBlocks.keys(), ...remoteBlocks.keys()]);
  const sortedIds = [...blockIds].sort((a, b) => a.localeCompare(b, 'uk'));

  for (const blockId of sortedIds) {
    const localBlock = localBlocks.get(blockId);
    const remoteBlock = remoteBlocks.get(blockId);
    const index =
      localDoc && blockId !== MARKETING_BLOCK_ID
        ? indexOfBlockId(localDoc, blockId)
        : remoteDoc
          ? indexOfBlockId(remoteDoc, blockId)
          : 0;

    if (!localBlock && remoteBlock) {
      diffs.push({ index, blockId, blockType: remoteBlock.type, kind: 'only_remote' });
      continue;
    }
    if (localBlock && !remoteBlock) {
      diffs.push({ index, blockId, blockType: localBlock.type, kind: 'only_local' });
      continue;
    }
    if (!localBlock || !remoteBlock) continue;

    if (!storefrontDescriptionNodesSemanticallyEqual(localBlock, remoteBlock)) {
      diffs.push({ index, blockId, blockType: localBlock.type, kind: 'changed' });
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

/** Індекси `content[i]` з відмінностями — для розгортання гілок у JSON compare. */
export function storefrontDocDiffContentIndexes(
  localRaw: string | null | undefined,
  remoteRaw: string | null | undefined,
): Set<number> {
  return new Set(diffStorefrontDescriptionDocs(localRaw, remoteRaw).map((d) => d.index));
}
