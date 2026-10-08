import { describe, expect, it } from 'vitest';
import { DILOVOD_PERSON_GROUP_EMPLOYEES } from '../constants/dilovod.js';
import type { HrPersonTreeNode } from '../types/hr.js';
import { OUT_OF_GROUP_NODE_ID } from './dilovodPersonGroups.js';
import { computeGroupPersonCounts, flattenPersonTreeNodes } from './personTreeOrder.js';

function group(
  id: string,
  parentId: string | null,
  label: string,
  groupId?: string,
): HrPersonTreeNode {
  return {
    id,
    kind: 'group',
    parentId,
    label,
    depth: 0,
    groupId: groupId ?? id.replace('group:', ''),
  };
}

function person(id: string, parentId: string, label: string): HrPersonTreeNode {
  return { id, kind: 'person', parentId, label, depth: 0 };
}

describe('computeGroupPersonCounts', () => {
  it('counts persons in nested folders recursively', () => {
    const nodes: HrPersonTreeNode[] = [
      group('group:root', null, 'Працівники'),
      group('group:sub', 'group:root', 'ФОП'),
      group('group:deep', 'group:sub', 'Відділ'),
      person('person:1', 'group:deep', 'Іванов'),
      person('person:2', 'group:sub', 'Петренко'),
      person('person:3', 'group:root', 'Сидоренко'),
    ];

    const counts = computeGroupPersonCounts(nodes);

    expect(counts.get('group:root')).toBe(3);
    expect(counts.get('group:sub')).toBe(2);
    expect(counts.get('group:deep')).toBe(1);
  });
});

describe('flattenPersonTreeNodes', () => {
  it('places children immediately under their parent', () => {
    const nodes: HrPersonTreeNode[] = [
      group('group:root', null, 'Працівники'),
      group('group:sub', 'group:root', 'ФОП'),
      person('person:1', 'group:sub', 'Іванов'),
      person('person:2', 'group:root', 'Петренко'),
    ];

    const expanded = new Set(['group:root', 'group:sub']);
    const flat = flattenPersonTreeNodes(nodes, expanded);

    expect(flat.map((node) => node.id)).toEqual([
      'group:root',
      'group:sub',
      'person:1',
      'person:2',
    ]);
  });

  it('hides descendants of collapsed groups', () => {
    const nodes: HrPersonTreeNode[] = [
      group('group:root', null, 'Працівники'),
      group('group:sub', 'group:root', 'ФОП'),
      person('person:1', 'group:sub', 'Іванов'),
    ];

    const flat = flattenPersonTreeNodes(nodes, new Set(['group:root']));

    expect(flat.map((node) => node.id)).toEqual(['group:root', 'group:sub']);
  });

  it('reorders server flat list (groups first, persons appended at end)', () => {
    const nodes: HrPersonTreeNode[] = [
      group('group:root', null, 'Працівники'),
      group('group:dismissed', 'group:root', 'Звільнені працівники'),
      group('group:employer', 'group:root', 'ТОВ Компанія'),
      person('person:1', 'group:employer', 'Іванов'),
      person('person:2', 'group:employer', 'Петренко'),
      person('person:3', 'group:root', 'Сидоренко'),
    ];

    const expanded = new Set(['group:root', 'group:employer']);
    const flat = flattenPersonTreeNodes(nodes, expanded);

    expect(flat.map((node) => node.id)).toEqual([
      'group:root',
      'group:dismissed',
      'group:employer',
      'person:1',
      'person:2',
      'person:3',
    ]);
  });

  it('keeps employees root before out-of-group root', () => {
    const employeesRootId = `group:${DILOVOD_PERSON_GROUP_EMPLOYEES}`;
    const outOfGroupId = `group:${OUT_OF_GROUP_NODE_ID}`;
    const nodes: HrPersonTreeNode[] = [
      group(outOfGroupId, null, 'Поза групою'),
      group(employeesRootId, null, 'Працівники', DILOVOD_PERSON_GROUP_EMPLOYEES),
      person('person:1', outOfGroupId, 'Іванов'),
    ];

    const flat = flattenPersonTreeNodes(nodes, new Set([employeesRootId, outOfGroupId]));

    expect(flat.map((node) => node.id)).toEqual([
      employeesRootId,
      outOfGroupId,
      'person:1',
    ]);
  });
});
