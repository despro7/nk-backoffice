import {
  DILOVOD_PERSON_GROUP_DISMISSED,
  DILOVOD_PERSON_GROUP_EMPLOYEES,
  DILOVOD_PERSON_TYPE_PHYSICAL,
} from '../constants/dilovod.js';

export const OUT_OF_GROUP_NODE_ID = 'out-of-group';

export interface PersonGroupMeta {
  id: string;
  parentId: string | null;
  label: string;
  isSystem: boolean;
  legalEntityId?: number;
}

export const SYSTEM_PERSON_GROUPS: readonly PersonGroupMeta[] = [
  {
    id: DILOVOD_PERSON_GROUP_EMPLOYEES,
    parentId: null,
    label: 'Працівники',
    isSystem: true,
  },
  {
    id: DILOVOD_PERSON_GROUP_DISMISSED,
    parentId: DILOVOD_PERSON_GROUP_EMPLOYEES,
    label: 'Звільнені працівники',
    isSystem: true,
  },
];

function isTruthyDilovodGroupFlag(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

function isFalsyDilovodGroupFlag(value: unknown): boolean {
  return value === 0 || value === false || value === '0';
}

/** Група/папка в каталозі контактів Dilovod (не фізособа для HR). */
export function isDilovodPersonGroupRow(row: {
  id?: string;
  personType?: string | null;
  taxCode?: string | null;
  phone?: string | null;
  isGroup?: number | boolean | string | null;
}): boolean {
  if (row.id === DILOVOD_PERSON_GROUP_EMPLOYEES || row.id === DILOVOD_PERSON_GROUP_DISMISSED) {
    return true;
  }
  if (isTruthyDilovodGroupFlag(row.isGroup)) {
    return true;
  }
  if (isFalsyDilovodGroupFlag(row.isGroup)) {
    return false;
  }
  // isGroup не передано — лише для старих відповідей API без поля
  if (row.personType === DILOVOD_PERSON_TYPE_PHYSICAL) {
    return false;
  }
  if (row.personType && row.personType !== DILOVOD_PERSON_TYPE_PHYSICAL) {
    return true;
  }
  return !row.taxCode && !row.phone;
}

export function collectKnownGroupIds(
  employerGroups: Array<{ dilovodPersonGroupId: string | null }>,
): Set<string> {
  const ids = new Set(SYSTEM_PERSON_GROUPS.map((group) => group.id));
  for (const employer of employerGroups) {
    if (employer.dilovodPersonGroupId) {
      ids.add(employer.dilovodPersonGroupId);
    }
  }
  return ids;
}

export function buildGroupLabelMap(
  legalEntities: Array<{ id: number; name: string; dilovodPersonGroupId: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of SYSTEM_PERSON_GROUPS) {
    map.set(group.id, group.label);
  }
  for (const entity of legalEntities) {
    if (entity.dilovodPersonGroupId) {
      map.set(entity.dilovodPersonGroupId, entity.name);
    }
  }
  return map;
}

export function isUnderEmployeesTree(
  parentId: string | null | undefined,
  knownGroupIds: Set<string>,
): boolean {
  if (!parentId) return false;
  return knownGroupIds.has(parentId) || parentId === DILOVOD_PERSON_GROUP_EMPLOYEES;
}

export function resolvePersonGroupLabel(
  groupId: string | null | undefined,
  groupLabels: Map<string, string>,
): string {
  if (!groupId) return 'Поза групою';
  return groupLabels.get(groupId) ?? 'Невідома група';
}

export function resolveEmployerFolderForLegalEntity(
  legalEntity: { dilovodPersonGroupId: string | null } | null | undefined,
): string {
  return legalEntity?.dilovodPersonGroupId ?? DILOVOD_PERSON_GROUP_EMPLOYEES;
}
