import { prisma, logServer } from '../../lib/utils.js';
import {
  DILOVOD_PERSON_GROUP_DISMISSED,
  DILOVOD_PERSON_GROUP_EMPLOYEES,
} from '../../../shared/constants/dilovod.js';
import { isDilovodPersonGroupRow } from '../../../shared/utils/dilovodPersonGroups.js';
import { dilovodService } from '../../services/dilovod/DilovodService.js';
import { hrAuditService } from './HrAuditService.js';
import { HrError } from './HrService.js';

export interface DilovodEmployerPersonGroup {
  id: string;
  name: string;
  parentId: string;
}

const GROUPS_CACHE_TTL_MS = 5 * 60 * 1000;

interface DilovodPersonRow {
  id: string;
  parent?: string;
  name?: string | { uk?: string; ru?: string };
  personType?: string;
  taxCode?: string;
  phone?: string;
  isGroup?: number | boolean | string;
  version?: string;
}

export const HR_PERSON_GROUP_MISSING_IN_DILOVOD = 'PERSON_GROUP_MISSING_IN_DILOVOD';

function isDilovodCatalogObjectNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found/i.test(message);
}

function resolveName(name: DilovodPersonRow['name']): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name.uk || name.ru || '';
}

export class HrPersonGroupSyncService {
  private cachedEmployerGroups: {
    groups: DilovodEmployerPersonGroup[];
    fetchedAt: number;
  } | null = null;

  private invalidateGroupsCache(): void {
    this.cachedEmployerGroups = null;
  }

  async listGroupsUnderEmployeesRoot(forceRefresh = false): Promise<DilovodEmployerPersonGroup[]> {
    const now = Date.now();
    if (
      !forceRefresh
      && this.cachedEmployerGroups
      && now - this.cachedEmployerGroups.fetchedAt < GROUPS_CACHE_TTL_MS
    ) {
      return this.cachedEmployerGroups.groups;
    }

    const api = dilovodService.getApiClient();
    const groups: DilovodEmployerPersonGroup[] = [];
    const visitedParents = new Set<string>();
    const queue = [DILOVOD_PERSON_GROUP_EMPLOYEES];

    while (queue.length > 0) {
      const parentId = queue.shift();
      if (!parentId || visitedParents.has(parentId)) continue;
      visitedParents.add(parentId);

      const rows = await api.getPersonsByParent(parentId);
      for (const row of rows as DilovodPersonRow[]) {
        if (!isDilovodPersonGroupRow(row)) continue;
        const groupId = String(row.id);
        if (
          groupId === DILOVOD_PERSON_GROUP_EMPLOYEES
          || groupId === DILOVOD_PERSON_GROUP_DISMISSED
        ) {
          continue;
        }
        if (groups.some((group) => group.id === groupId)) continue;
        groups.push({
          id: groupId,
          name: resolveName(row.name).trim() || `Група ${groupId}`,
          parentId,
        });
        queue.push(groupId);
      }
    }

    groups.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    this.cachedEmployerGroups = { groups, fetchedAt: now };
    return groups;
  }

  async pullGroupsUnderRoot(): Promise<{ linked: number }> {
    const groups = await this.listGroupsUnderEmployeesRoot(true);
    let linked = 0;

    for (const group of groups) {
      const groupId = group.id;
      const name = group.name.trim();
      if (!name) continue;

      const byGroupId = await prisma.hrLegalEntity.findFirst({
        where: { dilovodPersonGroupId: groupId },
      });
      if (byGroupId) continue;

      const byName = await prisma.hrLegalEntity.findFirst({
        where: { name },
        orderBy: { id: 'asc' },
      });
      if (!byName) continue;

      if (byName.dilovodPersonGroupId && byName.dilovodPersonGroupId !== groupId) {
        logServer('[hr] person group name match conflict', {
          legalEntityId: byName.id,
          existingGroupId: byName.dilovodPersonGroupId,
          dilovodGroupId: groupId,
        });
        continue;
      }

      await prisma.hrLegalEntity.update({
        where: { id: byName.id },
        data: { dilovodPersonGroupId: groupId },
      });
      linked += 1;
    }

    this.invalidateGroupsCache();
    logServer('[hr] pulled person groups under employees root', { linked, total: groups.length });
    return { linked };
  }

  private async repairEmployerPersonGroupIfNeeded(
    legalEntityId: number,
    entity: { name: string; dilovodPersonGroupId: string },
    userId?: number,
  ): Promise<void> {
    const api = dilovodService.getApiClient();
    const rows = await api.getPersonsByIds([entity.dilovodPersonGroupId]);
    const row = rows[0] as DilovodPersonRow | undefined;
    if (!row || isDilovodPersonGroupRow(row)) return;

    await api.updatePersonGroup({
      id: entity.dilovodPersonGroupId,
      name: entity.name,
      parent: DILOVOD_PERSON_GROUP_EMPLOYEES,
      version: row.version ?? null,
    });

    await hrAuditService.log({
      entityType: 'legal_entity',
      entityId: legalEntityId,
      action: 'person_group_repaired',
      userId,
      payload: { dilovodPersonGroupId: entity.dilovodPersonGroupId, name: entity.name },
    });
    logServer('[hr] repaired employer person group isGroup flag', {
      legalEntityId,
      dilovodPersonGroupId: entity.dilovodPersonGroupId,
    });
  }

  async ensureEmployerPersonGroup(legalEntityId: number, userId?: number): Promise<string> {
    const entity = await prisma.hrLegalEntity.findUnique({ where: { id: legalEntityId } });
    if (!entity) throw new HrError('Роботодавця не знайдено', 404);
    if (entity.dilovodPersonGroupId) {
      await this.repairEmployerPersonGroupIfNeeded(legalEntityId, {
        name: entity.name,
        dilovodPersonGroupId: entity.dilovodPersonGroupId,
      }, userId);
      return entity.dilovodPersonGroupId;
    }

    const api = dilovodService.getApiClient();
    const created = await api.createPersonGroup({
      name: entity.name,
      parent: DILOVOD_PERSON_GROUP_EMPLOYEES,
    });

    await prisma.hrLegalEntity.update({
      where: { id: legalEntityId },
      data: { dilovodPersonGroupId: created.id },
    });

    await hrAuditService.log({
      entityType: 'legal_entity',
      entityId: legalEntityId,
      action: 'person_group_created',
      userId,
      payload: { dilovodPersonGroupId: created.id, name: entity.name },
    });

    this.invalidateGroupsCache();
    logServer('[hr] created employer person group', {
      legalEntityId,
      dilovodPersonGroupId: created.id,
    });

    return created.id;
  }

  /** Створити папку в Dilovod за потреби та оновити dilovodPersonGroupId у роботодавця. */
  async syncEmployerPersonGroup(legalEntityId: number, userId?: number): Promise<{ dilovodPersonGroupId: string }> {
    const dilovodPersonGroupId = await this.ensureEmployerPersonGroup(legalEntityId, userId);
    return { dilovodPersonGroupId };
  }

  /** Видалити порожню папку роботодавця в Dilovod і скинути звʼязок у backoffice. */
  async deleteEmptyEmployerPersonGroup(
    legalEntityId: number,
    userId?: number,
    options?: { localOnly?: boolean },
  ): Promise<void> {
    const localOnly = options?.localOnly === true;
    const entity = await prisma.hrLegalEntity.findUnique({ where: { id: legalEntityId } });
    if (!entity) throw new HrError('Роботодавця не знайдено', 404);
    if (!entity.dilovodPersonGroupId) {
      throw new HrError('У роботодавця немає папки в Dilovod');
    }

    const groupId = entity.dilovodPersonGroupId;
    const personsInFolder = await prisma.hrPerson.count({
      where: { dilovodParentId: groupId, localStatus: { not: 'archived' } },
    });
    if (personsInFolder > 0) {
      throw new HrError('Папку можна видалити лише якщо в ній немає контактів');
    }

    if (!localOnly) {
      const api = dilovodService.getApiClient();
      const children = await api.getPersonsByParent(groupId);
      if (children.length > 0) {
        throw new HrError('Папка в Dilovod не порожня — спочатку перемістіть або видаліть вміст');
      }

      const [groupRow] = await api.getPersonsByIds([groupId]);
      if (!groupRow) {
        throw new HrError(
          'Папку в Dilovod не знайдено. Можна скинути лише локальний звʼязок з роботодавцем.',
          409,
          HR_PERSON_GROUP_MISSING_IN_DILOVOD,
        );
      }

      try {
        await api.deletePersonCatalogEntry(groupId);
      } catch (error) {
        if (isDilovodCatalogObjectNotFound(error)) {
          throw new HrError(
            'Папку в Dilovod не знайдено. Можна скинути лише локальний звʼязок з роботодавцем.',
            409,
            HR_PERSON_GROUP_MISSING_IN_DILOVOD,
          );
        }
        logServer('[hr] delete employer person group in dilovod failed', {
          legalEntityId,
          dilovodPersonGroupId: groupId,
          error: error instanceof Error ? error.message : error,
        });
        throw error;
      }
    }

    await prisma.hrLegalEntity.update({
      where: { id: legalEntityId },
      data: { dilovodPersonGroupId: null },
    });

    await hrAuditService.log({
      entityType: 'legal_entity',
      entityId: legalEntityId,
      action: localOnly ? 'person_group_unlinked' : 'person_group_deleted',
      userId,
      payload: { dilovodPersonGroupId: groupId, name: entity.name, localOnly: localOnly || undefined },
    });

    this.invalidateGroupsCache();
    logServer(localOnly ? '[hr] unlinked employer person group locally' : '[hr] deleted empty employer person group', {
      legalEntityId,
      dilovodPersonGroupId: groupId,
      localOnly,
    });
  }
}

export const hrPersonGroupSyncService = new HrPersonGroupSyncService();
