import type { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  findAllPersonDuplicateMatchIds,
  findDuplicatesForPerson,
  findPersonDuplicateCandidateIds,
  type PersonDuplicateFields,
} from '../../../shared/utils/hrPersonDuplicate.js';
import {
  buildEmployeeDisplayName,
  parseUaDisplayName,
} from '../../../shared/utils/hrEmployeePersonName.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneNormalizer.js';
import {
  DILOVOD_PERSON_GROUP_EMPLOYEES,
} from '../../../shared/constants/dilovod.js';
import {
  buildGroupLabelMap,
  collectKnownGroupIds,
  OUT_OF_GROUP_NODE_ID,
  resolvePersonGroupLabel,
  SYSTEM_PERSON_GROUPS,
} from '../../../shared/utils/dilovodPersonGroups.js';
import { pickCurrentEmploymentForEmployerContext } from '../../../shared/utils/hrEmploymentDedupe.js';
import { personGroupAlignedWithEmployerFromDto } from '../../../shared/utils/personEmployerGroupAlign.js';
import {
  collectAncestorIdsForNodes,
  computeGroupPersonCounts,
} from '../../../shared/utils/personTreeOrder.js';
import {
  HR_EMPLOYEE_STATUSES,
  HR_PERSON_LOCAL_STATUSES,
  type HrEmployeeStatus,
  type HrPersonDto,
  type HrPersonLinkedEmployeeDto,
  type HrPersonLocalStatus,
  HR_PERSON_MERGE_PICKABLE_FIELDS,
  type HrPersonMergeFieldSelections,
  type HrPersonSummaryDto,
  type HrPersonTreeNode,
  type HrPersonWritePayload,
} from '../../../shared/types/hr.js';
import { hrAuditService } from './HrAuditService.js';
import { hrPersonGroupSyncService } from './HrPersonGroupSyncService.js';
import { buildPersonSearchWhere } from './hrPersonSearchWhere.js';
import { HrError } from './HrService.js';

function isLocalStatus(value: string): value is HrPersonLocalStatus {
  return (HR_PERSON_LOCAL_STATUSES as readonly string[]).includes(value);
}

type PersonRow = {
  id: number;
  dilovodPersonId: string | null;
  dilovodCode: string | null;
  displayName: string;
  taxCode: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  dilovodParentId: string | null;
  dilovodPersonTypeId: string | null;
  dilovodStateId: string | null;
  isDeletedInDilovod: boolean;
  localStatus: string;
  canonicalPersonId: number | null;
  duplicateOfId: number | null;
  notes: string | null;
  lastSyncedAt: Date | null;
};

function toDuplicateFields(row: PersonDuplicateFields | PersonRow): PersonDuplicateFields {
  return {
    id: row.id,
    displayName: row.displayName,
    taxCode: row.taxCode,
    phone: row.phone,
  };
}

type LinkedEmployeeContext = {
  employeeId: number;
  status: string;
  employments: Array<{
    validFrom: Date;
    validTo: Date | null;
    legalEntity: { id: number; name: string; code: string; dilovodPersonGroupId: string | null };
  }>;
};

function isEmployeeStatus(value: string): value is HrEmployeeStatus {
  return (HR_EMPLOYEE_STATUSES as readonly string[]).includes(value);
}

function toDto(
  row: PersonRow,
  duplicateMatchIds?: Set<number>,
  mergedCount = 0,
  linkedEmployee?: LinkedEmployeeContext | null,
  groupLabels?: Map<string, string>,
): HrPersonDto {
  const hasUnresolvedDuplicates = duplicateMatchIds?.has(row.id) ?? false;
  const currentEmployment = linkedEmployee
    ? pickCurrentEmploymentForEmployerContext(linkedEmployee.employments)
    : null;
  const linkedEmployeeDto: HrPersonLinkedEmployeeDto | null = linkedEmployee
    ? {
        employeeId: linkedEmployee.employeeId,
        status: isEmployeeStatus(linkedEmployee.status) ? linkedEmployee.status : 'inactive',
        currentLegalEntityId: currentEmployment?.legalEntity.id ?? null,
        currentLegalEntityName: currentEmployment?.legalEntity.name ?? null,
        currentLegalEntityDilovodPersonGroupId: currentEmployment?.legalEntity.dilovodPersonGroupId ?? null,
      }
    : null;

  const personGroupLabel = groupLabels
    ? resolvePersonGroupLabel(row.dilovodParentId, groupLabels)
    : null;

  const personDtoBase = {
    id: row.id,
    dilovodPersonId: row.dilovodPersonId,
    dilovodCode: row.dilovodCode,
    displayName: row.displayName,
    taxCode: row.taxCode,
    phone: row.phone,
    email: row.email,
    address: row.address,
    dilovodParentId: row.dilovodParentId,
    dilovodPersonTypeId: row.dilovodPersonTypeId,
    dilovodStateId: row.dilovodStateId,
    isDeletedInDilovod: row.isDeletedInDilovod,
    localStatus: isLocalStatus(row.localStatus) ? row.localStatus : 'active',
    canonicalPersonId: row.canonicalPersonId,
    duplicateOfId: row.duplicateOfId,
    notes: row.notes,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    mergedCount,
    hasUnresolvedDuplicates,
    linkedEmployee: linkedEmployeeDto,
    personGroupLabel,
    employerName: linkedEmployeeDto?.currentLegalEntityName ?? null,
  };

  return {
    ...personDtoBase,
    personGroupAlignedWithEmployer: personGroupAlignedWithEmployerFromDto(personDtoBase),
  };
}

function isUnresolvedPerson(row: Pick<PersonRow, 'duplicateOfId'>): boolean {
  return row.duplicateOfId == null;
}

export class HrPersonService {
  private async loadLegalEntityGroups() {
    return prisma.hrLegalEntity.findMany({
      select: { id: true, name: true, dilovodPersonGroupId: true },
      orderBy: [{ name: 'asc' }],
    });
  }

  private async loadLinkedEmployeesByPersonId(
    personIds: number[],
  ): Promise<Map<number, LinkedEmployeeContext>> {
    if (personIds.length === 0) return new Map();

    const employees = await prisma.hrEmployee.findMany({
      where: { personId: { in: personIds }, deletedAt: null },
      select: {
        id: true,
        personId: true,
        status: true,
        employments: {
          select: {
            validFrom: true,
            validTo: true,
            legalEntity: { select: { id: true, name: true, code: true, dilovodPersonGroupId: true } },
          },
          orderBy: [{ validFrom: 'desc' }],
        },
      },
    });

    const map = new Map<number, LinkedEmployeeContext>();
    for (const employee of employees) {
      if (employee.personId == null) continue;
      map.set(employee.personId, {
        employeeId: employee.id,
        status: employee.status,
        employments: employee.employments,
      });
    }
    return map;
  }

  private async enrichPersonRows(
    rows: PersonRow[],
    duplicateMatchIds: Set<number>,
    mergedCountById: Map<number, number>,
    groupLabels: Map<string, string>,
    linkedEmployees: Map<number, LinkedEmployeeContext>,
  ): Promise<HrPersonDto[]> {
    return rows.map((row) => toDto(
      row,
      duplicateMatchIds,
      mergedCountById.get(row.id) ?? 0,
      linkedEmployees.get(row.id) ?? null,
      groupLabels,
    ));
  }

  async list(params: {
    search?: string;
    employeesGroupOnly?: boolean;
    outOfGroup?: boolean;
    duplicatesOnly?: boolean;
  }): Promise<HrPersonDto[]> {
    const hasSearch = Boolean(params.search?.trim());
    const legalEntities = await this.loadLegalEntityGroups();
    const knownGroupIds = collectKnownGroupIds(legalEntities);
    const groupLabels = buildGroupLabelMap(legalEntities);

    const rows = await prisma.hrPerson.findMany({
      where: {
        localStatus: { not: 'archived' },
        duplicateOfId: null,
        ...(!hasSearch && params.employeesGroupOnly
          ? { dilovodParentId: DILOVOD_PERSON_GROUP_EMPLOYEES }
          : {}),
        ...(!hasSearch && params.outOfGroup
          ? {
              OR: [
                { dilovodParentId: { notIn: [...knownGroupIds] } },
                { dilovodParentId: null },
              ],
            }
          : {}),
        ...(buildPersonSearchWhere(params.search ?? '') ?? {}),
      },
      orderBy: [{ displayName: 'asc' }],
      take: 500,
    });
    const unresolvedRows = rows.filter(isUnresolvedPerson);
    const duplicateMatchIds = findAllPersonDuplicateMatchIds(unresolvedRows.map(toDuplicateFields));
    const mergedCountById = await this.loadMergedCounts(unresolvedRows.map((row) => row.id));
    const linkedEmployees = await this.loadLinkedEmployeesByPersonId(unresolvedRows.map((row) => row.id));
    const filtered = params.duplicatesOnly
      ? unresolvedRows.filter((row) => duplicateMatchIds.has(row.id))
      : unresolvedRows;
    return this.enrichPersonRows(
      filtered,
      duplicateMatchIds,
      mergedCountById,
      groupLabels,
      linkedEmployees,
    );
  }

  async getTree(params: {
    search?: string;
    duplicatesOnly?: boolean;
  }): Promise<HrPersonTreeNode[]> {
    const legalEntities = await this.loadLegalEntityGroups();
    const dilovodEmployerGroups = await hrPersonGroupSyncService.listGroupsUnderEmployeesRoot();
    const knownGroupIds = collectKnownGroupIds(legalEntities);
    for (const group of dilovodEmployerGroups) {
      knownGroupIds.add(group.id);
    }
    const groupLabels = buildGroupLabelMap(legalEntities);
    for (const group of dilovodEmployerGroups) {
      if (!groupLabels.has(group.id)) {
        groupLabels.set(group.id, group.name);
      }
    }

    const searchQuery = params.search?.trim() ?? '';
    let persons: HrPersonDto[];

    if (searchQuery) {
      persons = await this.list({
        search: searchQuery,
        duplicatesOnly: params.duplicatesOnly,
      });
      if (persons.length === 0) return [];
    } else {
      const rows = await prisma.hrPerson.findMany({
        where: { localStatus: { not: 'archived' }, duplicateOfId: null },
        orderBy: [{ displayName: 'asc' }],
        take: 2000,
      });
      const unresolvedRows = rows.filter(isUnresolvedPerson);
      const duplicateMatchIds = findAllPersonDuplicateMatchIds(unresolvedRows.map(toDuplicateFields));
      const mergedCountById = await this.loadMergedCounts(unresolvedRows.map((row) => row.id));
      const linkedEmployees = await this.loadLinkedEmployeesByPersonId(unresolvedRows.map((row) => row.id));
      const filteredRows = params.duplicatesOnly
        ? unresolvedRows.filter((row) => duplicateMatchIds.has(row.id))
        : unresolvedRows;
      persons = await this.enrichPersonRows(
        filteredRows,
        duplicateMatchIds,
        mergedCountById,
        groupLabels,
        linkedEmployees,
      );
    }

    const nodes: HrPersonTreeNode[] = [];
    const rootGroupId = DILOVOD_PERSON_GROUP_EMPLOYEES;
    const rootNodeId = `group:${rootGroupId}`;

    nodes.push({
      id: rootNodeId,
      kind: 'group',
      parentId: null,
      label: SYSTEM_PERSON_GROUPS[0].label,
      depth: 0,
      groupId: rootGroupId,
      isSystem: true,
    });

    nodes.push({
      id: `group:${SYSTEM_PERSON_GROUPS[1].id}`,
      kind: 'group',
      parentId: rootNodeId,
      label: SYSTEM_PERSON_GROUPS[1].label,
      depth: 1,
      groupId: SYSTEM_PERSON_GROUPS[1].id,
      isSystem: true,
    });

    const dilovodGroupById = new Map(dilovodEmployerGroups.map((group) => [group.id, group]));
    const addedEmployerGroupIds = new Set<string>();

    const resolveDilovodParentNodeId = (parentDilovodId: string): string => (
      parentDilovodId === rootGroupId ? rootNodeId : `group:${parentDilovodId}`
    );

    const sortGroupsByDepth = (groups: typeof dilovodEmployerGroups) => {
      const depthOf = (groupId: string): number => {
        let depth = 0;
        let current = dilovodGroupById.get(groupId);
        while (current && current.parentId !== rootGroupId) {
          depth += 1;
          current = dilovodGroupById.get(current.parentId);
          if (depth > 32) break;
        }
        return depth;
      };
      return [...groups].sort((a, b) => depthOf(a.id) - depthOf(b.id));
    };

    for (const group of sortGroupsByDepth(dilovodEmployerGroups)) {
      const entity = legalEntities.find((item) => item.dilovodPersonGroupId === group.id);
      const parentNodeId = resolveDilovodParentNodeId(group.parentId);
      const parentDepth = nodes.find((node) => node.id === parentNodeId)?.depth ?? 0;
      nodes.push({
        id: `group:${group.id}`,
        kind: 'group',
        parentId: parentNodeId,
        label: entity?.name ?? group.name,
        depth: parentDepth + 1,
        groupId: group.id,
        legalEntityId: entity?.id,
      });
      addedEmployerGroupIds.add(group.id);
    }

    for (const entity of legalEntities) {
      if (!entity.dilovodPersonGroupId || addedEmployerGroupIds.has(entity.dilovodPersonGroupId)) {
        continue;
      }
      nodes.push({
        id: `group:${entity.dilovodPersonGroupId}`,
        kind: 'group',
        parentId: rootNodeId,
        label: entity.name,
        depth: 1,
        groupId: entity.dilovodPersonGroupId,
        legalEntityId: entity.id,
      });
      addedEmployerGroupIds.add(entity.dilovodPersonGroupId);
    }

    const outOfGroupNodeId = `group:${OUT_OF_GROUP_NODE_ID}`;
    let outOfGroupAdded = false;

    const ensureGroupNode = (groupId: string): string => {
      const nodeId = `group:${groupId}`;
      if (nodes.some((node) => node.id === nodeId)) return nodeId;

      const dilovodGroup = dilovodGroupById.get(groupId);
      const parentNodeId = dilovodGroup
        ? resolveDilovodParentNodeId(dilovodGroup.parentId)
        : rootNodeId;
      const parentDepth = nodes.find((node) => node.id === parentNodeId)?.depth ?? 0;

      nodes.push({
        id: nodeId,
        kind: 'group',
        parentId: parentNodeId,
        label: groupLabels.get(groupId) ?? 'Невідома група',
        depth: parentDepth + 1,
        groupId,
      });
      knownGroupIds.add(groupId);
      return nodeId;
    };

    for (const person of persons) {
      if (person.dilovodPersonId && knownGroupIds.has(person.dilovodPersonId)) {
        continue;
      }
      const parentGroupId = person.dilovodParentId;
      let parentNodeId: string;
      let depth: number;

      if (parentGroupId && knownGroupIds.has(parentGroupId)) {
        parentNodeId = parentGroupId === rootGroupId
          ? rootNodeId
          : ensureGroupNode(parentGroupId);
        const parentNode = nodes.find((node) => node.id === parentNodeId);
        depth = (parentNode?.depth ?? 0) + 1;
      } else if (parentGroupId === rootGroupId) {
        parentNodeId = rootNodeId;
        depth = 1;
      } else {
        if (!outOfGroupAdded) {
          outOfGroupAdded = true;
          nodes.push({
            id: outOfGroupNodeId,
            kind: 'group',
            parentId: null,
            label: 'Поза групою',
            depth: 0,
            isSystem: true,
          });
        }
        parentNodeId = outOfGroupNodeId;
        depth = 1;
      }

      nodes.push({
        id: `person:${person.id}`,
        kind: 'person',
        parentId: parentNodeId,
        label: person.displayName,
        depth,
        person,
      });
    }

    const groupIdsWithDescendants = new Set<string>();
    for (const node of nodes) {
      if (node.parentId) groupIdsWithDescendants.add(node.parentId);
    }

    const childCountByGroup = computeGroupPersonCounts(nodes);
    const withCounts = nodes.map((node) => (
      node.kind === 'group'
        ? { ...node, childCount: childCountByGroup.get(node.id) ?? 0 }
        : node
    ));

    let filtered = withCounts.filter((node) => {
      if (node.kind !== 'group' || node.isSystem || node.legalEntityId) return true;
      return groupIdsWithDescendants.has(node.id);
    });

    if (searchQuery) {
      const matchedPersonIds = new Set(persons.map((person) => `person:${person.id}`));
      const keepIds = collectAncestorIdsForNodes(filtered, matchedPersonIds);
      for (const personId of matchedPersonIds) keepIds.add(personId);
      filtered = filtered.filter((node) => keepIds.has(node.id));
    }

    return filtered;
  }

  private async loadMergedCounts(personIds: number[]): Promise<Map<number, number>> {
    if (personIds.length === 0) return new Map();
    const grouped = await prisma.hrPerson.groupBy({
      by: ['duplicateOfId'],
      where: { duplicateOfId: { in: personIds } },
      _count: { _all: true },
    });
    const map = new Map<number, number>();
    for (const item of grouped) {
      if (item.duplicateOfId != null) {
        map.set(item.duplicateOfId, item._count._all);
      }
    }
    return map;
  }

  async getById(id: number): Promise<HrPersonDto> {
    const row = await prisma.hrPerson.findUnique({ where: { id } });
    if (!row) throw new HrError('Фізичну особу не знайдено', 404);
    const duplicateMatchIds = await this.loadDuplicateMatchIds();
    const mergedCount = await prisma.hrPerson.count({ where: { duplicateOfId: id } });
    const legalEntities = await this.loadLegalEntityGroups();
    const groupLabels = buildGroupLabelMap(legalEntities);
    const linkedEmployees = await this.loadLinkedEmployeesByPersonId([id]);
    return toDto(
      row,
      duplicateMatchIds,
      mergedCount,
      linkedEmployees.get(id) ?? null,
      groupLabels,
    );
  }

  async findDuplicates(id: number): Promise<HrPersonDto[]> {
    const [target, allRows] = await Promise.all([
      prisma.hrPerson.findUnique({ where: { id } }),
      prisma.hrPerson.findMany({
        where: { localStatus: { not: 'archived' }, duplicateOfId: null },
        orderBy: [{ displayName: 'asc' }],
      }),
    ]);
    if (!target) throw new HrError('Фізичну особу не знайдено', 404);
    if (target.duplicateOfId != null) return [];

    const duplicateMatchIds = findAllPersonDuplicateMatchIds(allRows.map(toDuplicateFields));
    const matches = findDuplicatesForPerson(toDuplicateFields(target), allRows.map(toDuplicateFields));
    const matchIds = matches.map((match) => match.id);
    const [mergedCountById, linkedEmployees, legalEntities] = await Promise.all([
      this.loadMergedCounts(matchIds),
      this.loadLinkedEmployeesByPersonId(matchIds),
      this.loadLegalEntityGroups(),
    ]);
    const groupLabels = buildGroupLabelMap(legalEntities);
    return matches.map((match) => {
      const row = allRows.find((item) => item.id === match.id);
      return row
        ? toDto(
          row,
          duplicateMatchIds,
          mergedCountById.get(row.id) ?? 0,
          linkedEmployees.get(row.id) ?? null,
          groupLabels,
        )
        : null;
    }).filter((item): item is HrPersonDto => item != null);
  }

  async findMerged(id: number): Promise<HrPersonSummaryDto[]> {
    const target = await prisma.hrPerson.findUnique({ where: { id } });
    if (!target) throw new HrError('Фізичну особу не знайдено', 404);

    const rows = await prisma.hrPerson.findMany({
      where: { duplicateOfId: id },
      orderBy: [{ displayName: 'asc' }],
    });
    if (rows.length === 0) return [];

    const auditLogs = await prisma.hrAuditLog.findMany({
      where: {
        entityType: 'person',
        entityId: id,
        action: 'merged',
      },
      orderBy: { createdAt: 'desc' },
      select: { payload: true, createdAt: true },
    });

    const mergedAtBySourceId = new Map<number, string>();
    for (const log of auditLogs) {
      const payload = log.payload as { sourceId?: number } | null;
      if (payload?.sourceId != null && !mergedAtBySourceId.has(payload.sourceId)) {
        mergedAtBySourceId.set(payload.sourceId, log.createdAt.toISOString());
      }
    }

    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      taxCode: row.taxCode,
      phone: row.phone,
      dilovodCode: row.dilovodCode,
      mergedAt: mergedAtBySourceId.get(row.id) ?? null,
    }));
  }

  private async loadDuplicateMatchIds(): Promise<Set<number>> {
    const rows = await prisma.hrPerson.findMany({
      where: { localStatus: { not: 'archived' }, duplicateOfId: null },
      select: { id: true, displayName: true, taxCode: true, phone: true },
    });
    return findAllPersonDuplicateMatchIds(rows);
  }

  async create(payload: HrPersonWritePayload, userId?: number): Promise<HrPersonDto> {
    const displayName = payload.displayName?.trim();
    if (!displayName) throw new HrError('Вкажіть ПІБ');

    const phone = payload.phone ? normalizePhoneNumber(payload.phone) : null;
    const created = await prisma.hrPerson.create({
      data: {
        displayName,
        taxCode: payload.taxCode?.trim() || null,
        phone,
        email: payload.email?.trim() || null,
        address: payload.address?.trim() || null,
        dilovodParentId: payload.dilovodParentId ?? null,
        notes: payload.notes?.trim() || null,
        localStatus: payload.localStatus && isLocalStatus(payload.localStatus) ? payload.localStatus : 'active',
      },
    });
    await hrAuditService.log({
      entityType: 'person',
      entityId: created.id,
      action: 'created',
      userId,
      payload: { displayName },
    });
    logServer('[hr] created person', { id: created.id });
    await this.markDuplicateCandidates();
    return this.getById(created.id);
  }

  async update(id: number, payload: HrPersonWritePayload, userId?: number): Promise<HrPersonDto> {
    const existing = await prisma.hrPerson.findUnique({ where: { id } });
    if (!existing) throw new HrError('Фізичну особу не знайдено', 404);

    const displayName = payload.displayName?.trim() ?? existing.displayName;
    const phone = payload.phone !== undefined
      ? (payload.phone ? normalizePhoneNumber(payload.phone) : null)
      : existing.phone;

    const updated = await prisma.hrPerson.update({
      where: { id },
      data: {
        displayName,
        taxCode: payload.taxCode !== undefined ? payload.taxCode?.trim() || null : existing.taxCode,
        phone,
        email: payload.email !== undefined ? payload.email?.trim() || null : existing.email,
        address: payload.address !== undefined ? payload.address?.trim() || null : existing.address,
        dilovodParentId: payload.dilovodParentId !== undefined ? payload.dilovodParentId : existing.dilovodParentId,
        notes: payload.notes !== undefined ? payload.notes?.trim() || null : existing.notes,
        ...(payload.localStatus && isLocalStatus(payload.localStatus)
          ? { localStatus: payload.localStatus }
          : {}),
      },
    });
    await hrAuditService.log({
      entityType: 'person',
      entityId: id,
      action: 'updated',
      userId,
    });
    if (displayName !== existing.displayName) {
      await this.syncLinkedEmployeeNames(id, displayName);
    }
    await this.markDuplicateCandidates();
    return this.getById(id);
  }

  private async syncLinkedEmployeeNames(personId: number, displayName: string): Promise<void> {
    const parsed = parseUaDisplayName(displayName);
    if (!parsed.lastName || !parsed.firstName) return;
    await prisma.hrEmployee.updateMany({
      where: { personId, deletedAt: null },
      data: {
        lastName: parsed.lastName,
        firstName: parsed.firstName,
        middleName: parsed.middleName,
        displayName: buildEmployeeDisplayName(parsed.lastName, parsed.firstName, parsed.middleName),
      },
    });
  }

  async merge(sourceId: number, targetId: number, userId?: number): Promise<HrPersonDto> {
    const result = await this.mergePersonsBatch(targetId, [sourceId], undefined, userId);
    return result;
  }

  async mergePersonsBatch(
    targetId: number,
    sourceIds: number[],
    fieldSelections?: HrPersonMergeFieldSelections,
    userId?: number,
  ): Promise<HrPersonDto> {
    const uniqueSources = [...new Set(sourceIds.filter((id) => id !== targetId))];
    if (uniqueSources.length === 0) {
      throw new HrError('Оберіть інші особи для обʼєднання');
    }

    const candidateIds = new Set<number>([targetId, ...uniqueSources]);
    if (fieldSelections) {
      for (const field of HR_PERSON_MERGE_PICKABLE_FIELDS) {
        const pickedId = fieldSelections[field];
        if (!candidateIds.has(pickedId)) {
          throw new HrError(`Некоректне джерело для поля «${field}»`);
        }
      }
    }

    const rows = await prisma.hrPerson.findMany({
      where: { id: { in: [...candidateIds] } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const target = byId.get(targetId);
    if (!target) throw new HrError('Особу не знайдено', 404);

    for (const sourceId of uniqueSources) {
      if (!byId.has(sourceId)) throw new HrError('Особу не знайдено', 404);
    }

    const pickRow = (personId: number) => {
      const row = byId.get(personId);
      if (!row) throw new HrError('Особу не знайдено', 404);
      return row;
    };

    const mergedTargetData: Prisma.HrPersonUpdateInput = {};
    if (fieldSelections) {
      mergedTargetData.phone = pickRow(fieldSelections.phone).phone;
      mergedTargetData.email = pickRow(fieldSelections.email).email;
      mergedTargetData.address = pickRow(fieldSelections.address).address;
      mergedTargetData.notes = pickRow(fieldSelections.notes).notes;
      mergedTargetData.dilovodParentId = pickRow(fieldSelections.personGroup).dilovodParentId;
    }

    const statusSourcePersonId = fieldSelections?.employeeStatus;
    const employerSourcePersonId = fieldSelections?.employer;

    const [statusSourceEmployee, employerSourceEmployee] = await Promise.all([
      statusSourcePersonId
        ? prisma.hrEmployee.findFirst({
          where: { personId: statusSourcePersonId, deletedAt: null },
          select: { id: true, status: true },
        })
        : Promise.resolve(null),
      employerSourcePersonId
        ? prisma.hrEmployee.findFirst({
          where: { personId: employerSourcePersonId, deletedAt: null },
          select: { id: true },
        })
        : Promise.resolve(null),
    ]);

    const sourceSnapshots = uniqueSources.map((sourceId) => {
      const source = byId.get(sourceId);
      if (!source) throw new HrError('Особу не знайдено', 404);
      return { sourceId, source };
    });

    await prisma.$transaction(async (tx) => {
      if (Object.keys(mergedTargetData).length > 0) {
        await tx.hrPerson.update({
          where: { id: targetId },
          data: mergedTargetData,
        });
      }

      for (const sourceId of uniqueSources) {
        await tx.hrEmployee.updateMany({
          where: { personId: sourceId },
          data: { personId: targetId },
        });
        await tx.hrPerson.update({
          where: { id: sourceId },
          data: { duplicateOfId: targetId, localStatus: 'duplicate_candidate' },
        });
      }

      if (statusSourceEmployee) {
        await tx.hrEmployee.updateMany({
          where: { personId: targetId, deletedAt: null },
          data: { status: statusSourceEmployee.status },
        });
      }
    });

    for (const { sourceId, source } of sourceSnapshots) {
      await hrAuditService.log({
        entityType: 'person',
        entityId: targetId,
        action: 'merged',
        userId,
        payload: { sourceId, targetId, sourceDisplayName: source.displayName },
      });
    }

    await this.markDuplicateCandidates();

    if (employerSourceEmployee) {
      const { hrPersonSyncService } = await import('./HrPersonSyncService.js');
      await hrPersonSyncService.ensurePersonInEmployerFolder(employerSourceEmployee.id, userId);
    }

    return this.getById(targetId);
  }

  async markDuplicateCandidates(): Promise<number> {
    const persons = await prisma.hrPerson.findMany({
      where: { localStatus: { not: 'archived' }, duplicateOfId: null },
      select: {
        id: true,
        taxCode: true,
        phone: true,
        displayName: true,
        localStatus: true,
        duplicateOfId: true,
      },
    });

    const byTax = new Map<string, number[]>();
    const byPhone = new Map<string, number[]>();

    for (const p of persons) {
      if (p.taxCode) {
        const list = byTax.get(p.taxCode) ?? [];
        list.push(p.id);
        byTax.set(p.taxCode, list);
      }
      if (p.phone) {
        const list = byPhone.get(p.phone) ?? [];
        list.push(p.id);
        byPhone.set(p.phone, list);
      }
    }

    const duplicateIds = findPersonDuplicateCandidateIds(persons);

    const toMark = persons
      .filter((p) => p.localStatus !== 'duplicate_candidate' && duplicateIds.has(p.id))
      .map((p) => p.id);
    const toUnmark = persons
      .filter((p) => (
        p.localStatus === 'duplicate_candidate'
        && !p.duplicateOfId
        && !duplicateIds.has(p.id)
      ))
      .map((p) => p.id);

    if (toMark.length > 0) {
      await prisma.hrPerson.updateMany({
        where: { id: { in: toMark } },
        data: { localStatus: 'duplicate_candidate' },
      });
    }
    if (toUnmark.length > 0) {
      await prisma.hrPerson.updateMany({
        where: { id: { in: toUnmark } },
        data: { localStatus: 'active' },
      });
    }

    return toMark.length;
  }
}

export const hrPersonService = new HrPersonService();
