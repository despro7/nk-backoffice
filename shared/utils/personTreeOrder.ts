import { DILOVOD_PERSON_GROUP_EMPLOYEES } from '../constants/dilovod.js';
import type { HrPersonTreeNode } from '../types/hr.js';
import { OUT_OF_GROUP_NODE_ID } from './dilovodPersonGroups.js';

function rootGroupSortKey(node: HrPersonTreeNode): number {
  if (node.groupId === DILOVOD_PERSON_GROUP_EMPLOYEES) return 0;
  if (node.id === `group:${OUT_OF_GROUP_NODE_ID}`) return 2;
  return 1;
}

function compareTreeNodes(a: HrPersonTreeNode, b: HrPersonTreeNode): number {
  if (a.parentId == null && b.parentId == null) {
    const orderDiff = rootGroupSortKey(a) - rootGroupSortKey(b);
    if (orderDiff !== 0) return orderDiff;
  }
  if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1;
  if (a.isSystem && !b.isSystem) return -1;
  if (!a.isSystem && b.isSystem) return 1;
  return a.label.localeCompare(b.label, 'uk');
}

export function buildPersonTreeChildrenMap(
  nodes: HrPersonTreeNode[],
): Map<string | null, HrPersonTreeNode[]> {
  const childrenByParent = new Map<string | null, HrPersonTreeNode[]>();
  for (const node of nodes) {
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node);
    childrenByParent.set(node.parentId, list);
  }
  for (const children of childrenByParent.values()) {
    children.sort(compareTreeNodes);
  }
  return childrenByParent;
}

/** DFS: groups before persons on кожному рівні, діти одразу під батьком. */
/** Кількість фізичних осіб у піддереві групи (рекурсивно). */
export function computeGroupPersonCounts(nodes: HrPersonTreeNode[]): Map<string, number> {
  const childrenByParent = buildPersonTreeChildrenMap(nodes);
  const counts = new Map<string, number>();

  const countPersons = (groupId: string): number => {
    let total = 0;
    for (const child of childrenByParent.get(groupId) ?? []) {
      if (child.kind === 'person') total += 1;
      else total += countPersons(child.id);
    }
    return total;
  };

  for (const node of nodes) {
    if (node.kind === 'group') {
      counts.set(node.id, countPersons(node.id));
    }
  }
  return counts;
}

export function collectAncestorIdsForNodes(
  nodes: HrPersonTreeNode[],
  targetIds: ReadonlySet<string>,
): Set<string> {
  const parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
  const expanded = new Set<string>();
  for (const targetId of targetIds) {
    let current = parentById.get(targetId) ?? null;
    while (current) {
      expanded.add(current);
      current = parentById.get(current) ?? null;
    }
  }
  return expanded;
}

export function flattenPersonTreeNodes(
  nodes: HrPersonTreeNode[],
  expandedGroupIds?: ReadonlySet<string>,
): HrPersonTreeNode[] {
  const childrenByParent = buildPersonTreeChildrenMap(nodes);
  const result: HrPersonTreeNode[] = [];

  const walk = (parentId: string | null) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      result.push(child);
      if (child.kind === 'group' && (!expandedGroupIds || expandedGroupIds.has(child.id))) {
        walk(child.id);
      }
    }
  };

  walk(null);
  return result;
}
