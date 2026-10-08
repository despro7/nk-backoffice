import { prisma, logServer } from '../../lib/utils.js';
import {
  DILOVOD_PERSON_GROUP_DISMISSED,
  DILOVOD_PERSON_GROUP_DUPLICATE_CONTACTS,
  DILOVOD_PERSON_GROUP_EMPLOYEES,
} from '../../../shared/constants/dilovod.js';
import { isDilovodPersonGroupRow } from '../../../shared/utils/dilovodPersonGroups.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneNormalizer.js';
import { dilovodService } from '../../services/dilovod/DilovodService.js';
import { hrAuditService } from './HrAuditService.js';
import { hrPersonService } from './HrPersonService.js';
import { pickCurrentEmploymentForEmployerContext } from '../../../shared/utils/hrEmploymentDedupe.js';
import { hrPersonGroupSyncService } from './HrPersonGroupSyncService.js';
import { HrError } from './HrService.js';
import type { HrPersonDto } from '../../../shared/types/hr.js';

interface DilovodPersonRow {
  id: string;
  code?: string;
  name?: string | { uk?: string; ru?: string };
  taxCode?: string;
  phone?: string;
  email?: string;
  address?: string;
  parent?: string;
  personType?: string;
  isGroup?: number | boolean | string;
  state?: string;
  delMark?: number | boolean;
  version?: string;
}

function resolveName(name: DilovodPersonRow['name']): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name.uk || name.ru || '';
}

function extractPhone(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const phones = (details as { phones?: Array<{ pr?: string }> }).phones;
  const raw = phones?.[0]?.pr;
  return raw ? normalizePhoneNumber(raw) : null;
}

function extractEmail(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const emails = (details as { emails?: Array<{ pr?: string }> }).emails;
  return emails?.[0]?.pr?.trim() || null;
}

function extractAddress(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const addresses = (details as { addresses?: Array<{ pr?: { uk?: string } | string }> }).addresses;
  const pr = addresses?.[0]?.pr;
  if (!pr) return null;
  if (typeof pr === 'string') return pr;
  return pr.uk || null;
}

export class HrPersonSyncService {
  async pullGroupsFromDilovod(): Promise<{ groupsLinked: number }> {
    const { linked: groupsLinked } = await hrPersonGroupSyncService.pullGroupsUnderRoot();
    logServer('[hr] persons groups pull', { groupsLinked });
    return { groupsLinked };
  }

  async pullContactsFromDilovod(): Promise<{ pulled: number; updated: number }> {
    const api = dilovodService.getApiClient();
    let pulled = 0;
    let updated = 0;

    const linkedIds = new Set<string>();
    const employees = await prisma.hrEmployee.findMany({
      where: { person: { dilovodPersonId: { not: null } } },
      include: { person: true },
    });
    for (const emp of employees) {
      if (emp.person?.dilovodPersonId) linkedIds.add(emp.person.dilovodPersonId);
    }

    const dilovodRows: DilovodPersonRow[] = [];
    const parentIds = new Set<string>([DILOVOD_PERSON_GROUP_EMPLOYEES, DILOVOD_PERSON_GROUP_DISMISSED]);

    const dilovodEmployerGroups = await hrPersonGroupSyncService.listGroupsUnderEmployeesRoot();
    for (const group of dilovodEmployerGroups) {
      parentIds.add(group.id);
    }

    const legalEntities = await prisma.hrLegalEntity.findMany({
      where: { dilovodPersonGroupId: { not: null } },
      select: { dilovodPersonGroupId: true },
    });
    for (const entity of legalEntities) {
      if (entity.dilovodPersonGroupId) parentIds.add(entity.dilovodPersonGroupId);
    }

    for (const parentId of parentIds) {
      const groupRows = await api.getPersonsByParent(parentId);
      for (const row of groupRows) {
        if (isDilovodPersonGroupRow(row)) continue;
        if (!dilovodRows.some((existing) => existing.id === row.id)) {
          dilovodRows.push(row);
        }
      }
    }

    if (linkedIds.size > 0) {
      const byIds = await api.getPersonsByIds([...linkedIds]);
      for (const row of byIds) {
        if (isDilovodPersonGroupRow(row)) continue;
        if (!dilovodRows.some((existing) => existing.id === row.id)) {
          dilovodRows.push(row);
        }
      }
    }

    const dilovodEmployees = await api.getEmployees();
    const employeePersonIds = new Set<string>();
    for (const row of dilovodEmployees) {
      if (row.person) employeePersonIds.add(String(row.person));
    }
    if (employeePersonIds.size > 0) {
      const employeePersonRows = await api.getPersonsByIds([...employeePersonIds]);
      for (const row of employeePersonRows) {
        if (isDilovodPersonGroupRow(row)) continue;
        if (!dilovodRows.some((existing) => existing.id === row.id)) {
          dilovodRows.push(row);
        }
      }
    }

    await this.archiveHrPersonsForDilovodGroupIds(parentIds);

    for (const row of dilovodRows) {
      const result = await this.upsertFromDilovod(row);
      if (result === 'created') pulled += 1;
      if (result === 'updated') updated += 1;
    }

    await hrPersonService.markDuplicateCandidates();
    logServer('[hr] persons contacts pull', {
      pulled,
      updated,
      total: dilovodRows.length,
    });
    return { pulled, updated };
  }

  async pullSelective(): Promise<{ pulled: number; updated: number; groupsLinked: number }> {
    const { groupsLinked } = await this.pullGroupsFromDilovod();
    const { pulled, updated } = await this.pullContactsFromDilovod();
    logServer('[hr] persons selective pull', {
      pulled,
      updated,
      groupsLinked,
    });
    return { pulled, updated, groupsLinked };
  }

  async pushPerson(personId: number, userId?: number): Promise<HrPersonDto> {
    const person = await prisma.hrPerson.findUnique({ where: { id: personId } });
    if (!person) throw new HrError('Фізичну особу не знайдено', 404);

    const api = dilovodService.getApiClient();
    const payload = {
      id: person.dilovodPersonId,
      name: person.displayName,
      taxCode: person.taxCode,
      phone: person.phone,
      email: person.email,
      address: person.address,
      parent: person.dilovodParentId,
      state: person.dilovodStateId,
    };

    const saved = person.dilovodPersonId
      ? await api.updatePerson({
        id: person.dilovodPersonId,
        name: payload.name,
        taxCode: payload.taxCode,
        phone: payload.phone,
        email: payload.email,
        address: payload.address,
        parent: payload.parent,
        state: payload.state,
        version: person.dilovodVersion,
        isGroup: 0,
      })
      : await api.createPersonExtended(payload);

    const updated = await prisma.hrPerson.update({
      where: { id: personId },
      data: {
        dilovodPersonId: saved.id,
        dilovodCode: saved.code ?? person.dilovodCode,
        dilovodVersion: saved.version ?? person.dilovodVersion,
        dilovodParentId: payload.parent ?? person.dilovodParentId,
        lastSyncedAt: new Date(),
      },
    });

    await hrAuditService.log({
      entityType: 'person',
      entityId: personId,
      action: 'sync_push',
      userId,
    });

    return hrPersonService.getById(updated.id);
  }

  async pullPerson(personId: number, userId?: number): Promise<HrPersonDto> {
    const person = await prisma.hrPerson.findUnique({ where: { id: personId } });
    if (!person) throw new HrError('Фізичну особу не знайдено', 404);
    if (!person.dilovodPersonId) {
      throw new HrError('Особа ще не привʼязана до Dilovod — спочатку відправте контакт', 400);
    }

    const api = dilovodService.getApiClient();
    const rows = await api.getPersonsByIds([person.dilovodPersonId]);
    const row = rows[0] as DilovodPersonRow | undefined;
    if (!row) throw new HrError('Контакт не знайдено в Dilovod', 404);

    await this.upsertFromDilovod(row);
    await hrPersonService.markDuplicateCandidates();

    await hrAuditService.log({
      entityType: 'person',
      entityId: personId,
      action: 'sync_pull',
      userId,
    });

    return hrPersonService.getById(personId);
  }

  /** Завантажити з Dilovod, якщо є звʼязок; інакше створити/оновити в Dilovod. */
  async syncPersonRecord(personId: number, userId?: number): Promise<HrPersonDto> {
    const person = await prisma.hrPerson.findUnique({ where: { id: personId } });
    if (!person) throw new HrError('Фізичну особу не знайдено', 404);
    if (person.dilovodPersonId) return this.pullPerson(personId, userId);
    return this.pushPerson(personId, userId);
  }

  async moveToGroup(personId: number, targetGroupId: string, userId?: number): Promise<HrPersonDto> {
    const person = await prisma.hrPerson.findUnique({ where: { id: personId } });
    if (!person) throw new HrError('Фізичну особу не знайдено', 404);
    if (!person.dilovodPersonId) {
      throw new HrError('Особа ще не синхронізована з Dilovod');
    }

    const api = dilovodService.getApiClient();
    const saved = await api.updatePerson({
      id: person.dilovodPersonId,
      name: person.displayName,
      parent: targetGroupId,
      version: person.dilovodVersion,
      isGroup: 0,
    });

    await prisma.hrPerson.update({
      where: { id: personId },
      data: {
        dilovodParentId: targetGroupId,
        dilovodVersion: saved.version ?? person.dilovodVersion,
        lastSyncedAt: new Date(),
      },
    });

    await hrAuditService.log({
      entityType: 'person',
      entityId: personId,
      action: 'person.moved_to_group',
      userId,
      payload: { targetGroupId },
    });

    return hrPersonService.getById(personId);
  }

  async moveToEmployeesGroup(personId: number, userId?: number): Promise<HrPersonDto> {
    return this.moveToGroup(personId, DILOVOD_PERSON_GROUP_EMPLOYEES, userId);
  }

  private async resolveTargetEmployerFolderGroupId(
    personId: number,
    userId?: number,
  ): Promise<string> {
    const employee = await prisma.hrEmployee.findFirst({
      where: { personId, deletedAt: null },
      include: {
        employments: {
          include: { legalEntity: true },
          orderBy: [{ validFrom: 'desc' }],
        },
      },
    });

    const currentEmployment = employee
      ? pickCurrentEmploymentForEmployerContext(employee.employments)
      : null;
    if (!employee || !currentEmployment) {
      return DILOVOD_PERSON_GROUP_EMPLOYEES;
    }

    return hrPersonGroupSyncService.ensureEmployerPersonGroup(
      currentEmployment.legalEntityId,
      userId,
    );
  }

  /** Папка роботодавця в «Працівники», або корінь «Працівники», якщо роботодавця немає. */
  async alignPersonGroupWithEmployer(personId: number, userId?: number): Promise<HrPersonDto> {
    const person = await prisma.hrPerson.findUnique({ where: { id: personId } });
    if (!person) throw new HrError('Фізичну особу не знайдено', 404);
    if (!person.dilovodPersonId) {
      throw new HrError('Особа ще не синхронізована з Dilovod');
    }

    const targetGroupId = await this.resolveTargetEmployerFolderGroupId(personId, userId);
    if (person.dilovodParentId === targetGroupId) {
      return hrPersonService.getById(personId);
    }

    return this.moveToGroup(personId, targetGroupId, userId);
  }

  async finalizeMergedPersonSources(
    sourcePersonIds: number[],
    targetPersonId: number,
    userId?: number,
  ): Promise<HrPersonDto> {
    for (const sourceId of sourcePersonIds) {
      const person = await prisma.hrPerson.findUnique({ where: { id: sourceId } });
      if (!person?.dilovodPersonId) continue;
      try {
        await this.moveToGroup(sourceId, DILOVOD_PERSON_GROUP_DUPLICATE_CONTACTS, userId);
      } catch (error) {
        logServer('[hr] move merged source to duplicates folder failed', {
          sourceId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const target = await prisma.hrPerson.findUnique({ where: { id: targetPersonId } });
    if (target?.dilovodPersonId) {
      try {
        const pushed = await this.pushPerson(targetPersonId, userId);
        if (pushed.dilovodParentId) {
          return await this.moveToGroup(targetPersonId, pushed.dilovodParentId, userId);
        }
        return pushed;
      } catch (error) {
        logServer('[hr] push merged target failed', {
          targetPersonId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return hrPersonService.getById(targetPersonId);
  }

  async dismissPerson(personId: number, dismissedAt: string, userId?: number): Promise<HrPersonDto> {
    const person = await prisma.hrPerson.findUnique({ where: { id: personId } });
    if (!person) throw new HrError('Фізичну особу не знайдено', 404);

    const dismissDate = new Date(dismissedAt);
    if (Number.isNaN(dismissDate.getTime())) {
      throw new HrError('Некоректна дата звільнення');
    }

    await this.moveToGroup(personId, DILOVOD_PERSON_GROUP_DISMISSED, userId);

    const employees = await prisma.hrEmployee.findMany({
      where: { personId, deletedAt: null },
      include: { employments: true },
    });

    for (const employee of employees) {
      await prisma.$transaction(async (tx) => {
        await tx.hrEmployee.update({
          where: { id: employee.id },
          data: { status: 'inactive' },
        });

        for (const employment of employee.employments) {
          if (!employment.validTo || employment.validTo >= dismissDate) {
            await tx.hrEmployment.update({
              where: { id: employment.id },
              data: { validTo: dismissDate },
            });
          }
        }
      });
    }

    await hrAuditService.log({
      entityType: 'person',
      entityId: personId,
      action: 'person.dismissed',
      userId,
      payload: { dismissedAt },
    });

    return hrPersonService.getById(personId);
  }

  async ensurePersonInEmployerFolder(employeeId: number, userId?: number): Promise<void> {
    const employee = await prisma.hrEmployee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { personId: true },
    });
    if (!employee?.personId) return;

    const person = await prisma.hrPerson.findUnique({ where: { id: employee.personId } });
    if (!person?.dilovodPersonId) return;

    const targetGroupId = await this.resolveTargetEmployerFolderGroupId(employee.personId, userId);
    if (person.dilovodParentId === targetGroupId) return;

    await this.moveToGroup(employee.personId, targetGroupId, userId);
  }

  /** Прибрати з каталогу записи, що збігаються з id папок Dilovod (напр. «ЦПУ» з isGroup=1). */
  private async archiveHrPersonsForDilovodGroupIds(groupIds: Set<string>): Promise<void> {
    const ids = [...groupIds].filter(Boolean);
    if (ids.length === 0) return;

    const mistaken = await prisma.hrPerson.findMany({
      where: {
        dilovodPersonId: { in: ids },
        localStatus: { not: 'archived' },
        duplicateOfId: null,
      },
      select: { id: true, dilovodPersonId: true },
    });
    if (mistaken.length === 0) return;

    await prisma.hrPerson.updateMany({
      where: { id: { in: mistaken.map((row) => row.id) } },
      data: { localStatus: 'archived' },
    });
    logServer('[hr] archived persons misclassified as dilovod groups', {
      count: mistaken.length,
      dilovodPersonIds: mistaken.map((row) => row.dilovodPersonId),
    });
  }

  private async upsertFromDilovod(row: DilovodPersonRow): Promise<'created' | 'updated' | 'skipped'> {
    if (isDilovodPersonGroupRow(row)) return 'skipped';

    const displayName = resolveName(row.name);
    if (!displayName) return 'skipped';

    let details: unknown;
    try {
      details = typeof row === 'object' && 'details' in row && typeof (row as { details?: string }).details === 'string'
        ? JSON.parse((row as { details: string }).details)
        : null;
    } catch {
      details = null;
    }

    const phone = row.phone ? normalizePhoneNumber(row.phone) : extractPhone(details);
    const email = row.email || extractEmail(details);
    const address = row.address || extractAddress(details);

    const data = {
      dilovodPersonId: row.id,
      dilovodCode: row.code ?? null,
      displayName,
      taxCode: row.taxCode ?? null,
      phone,
      email,
      address,
      dilovodParentId: row.parent ?? null,
      dilovodPersonTypeId: row.personType ?? null,
      dilovodStateId: row.state ?? null,
      isDeletedInDilovod: Boolean(row.delMark),
      dilovodVersion: row.version ?? null,
      lastSyncedAt: new Date(),
    };

    const existing = await prisma.hrPerson.findUnique({ where: { dilovodPersonId: row.id } });
    if (existing) {
      await prisma.hrPerson.update({ where: { id: existing.id }, data });
      return 'updated';
    }

    await prisma.hrPerson.create({ data });
    return 'created';
  }
}

export const hrPersonSyncService = new HrPersonSyncService();
