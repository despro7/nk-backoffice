import { contentBlockIndexFromKeys } from './storefrontDocJsonKeys.js';

/** Розгортання гілок `content[i]` з відмінностями в TipTap doc JSON. */
export function shouldExpandStorefrontDocDiffNode(
  diffContentIndexes: ReadonlySet<number>,
  keys: (number | string)[],
): boolean {
  if (keys.length === 0) return true;

  if (keys.length === 1 && keys[0] === 'content') {
    return true;
  }

  const blockIndex = contentBlockIndexFromKeys(keys);
  if (blockIndex != null) {
    return diffContentIndexes.has(blockIndex);
  }

  return false;
}
