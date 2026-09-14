import type { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  findAllPersonDuplicateMatchIds,
  findDuplicatesForPerson,
  findPersonDuplicateCandidateIds,
  type PersonDuplicateFields,
} from '../../../shared/utils/hrPersonDuplicate.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneNormalizer.js';
import {
  HR_PERSON_LOCAL_STATUSES,
  type HrPersonDto,
  type HrPersonLocalStatus,
  type HrPersonSummaryDto,
  type HrPersonWritePayload,
} from '../../../shared/types/hr.js';
import { hrAuditService } from './HrAuditService.js';
import { HrError } from './HrService.js';

function buildPersonSearchWhere(search: string): Prisma.HrPersonWhereInput | undefined {
  const trimmed = search.trim();
  if (!trimmed) return undefined;

  const phoneDigits = trimmed.replace(/\D/g, '');
  const tokens = trimmed.split(/\s+/).filter((token) => token.length >= 2);
  const orConditions: Prisma.HrPersonWhereInput[] = [
    { displayName: { contains: trimmed } },
    { taxCode: { contains: trimmed } },
  ];

  if (phoneDigits.length >= 3) {
    orConditions.push({ phone: { contains: phoneDigits } });
  }

  if (tokens.length > 1) {
    orConditions.push({
      AND: tokens.map((token) => ({ displayName: { contains: token } })),
    });
  }

  return { OR: orConditions };
}

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

function toDto(
  row: PersonRow,
  duplicateMatchIds?: Set<number>,
  mergedCount = 0,
): HrPersonDto {
  const hasUnresolvedDuplicates = duplicateMatchIds?.has(row.id) ?? false;
  return {
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
    isDuplicateCandidate: hasUnresolvedDuplicates,
    mergedCount,
    hasUnresolvedDuplicates,
  };
}

function isUnresolvedPerson(row: Pick<PersonRow, 'duplicateOfId'>): boolean {
  return row.duplicateOfId == null;
}

export class HrPersonService {
  async list(params: {
    search?: string;
    employeesGroupOnly?: boolean;
    outOfGroup?: boolean;
    duplicatesOnly?: boolean;
  }): Promise<HrPersonDto[]> {
    const { DILOVOD_PERSON_GROUP_EMPLOYEES } = await import('../../../shared/constants/dilovod.js');
    const rows = await prisma.hrPerson.findMany({
      where: {
        localStatus: { not: 'archived' },
        duplicateOfId: null,
        ...(params.employeesGroupOnly
          ? { dilovodParentId: DILOVOD_PERSON_GROUP_EMPLOYEES }
          : {}),
        ...(params.outOfGroup
          ? {
              OR: [
                { dilovodParentId: { not: DILOVOD_PERSON_GROUP_EMPLOYEES } },
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
    const filtered = params.duplicatesOnly
      ? unresolvedRows.filter((row) => duplicateMatchIds.has(row.id))
      : unresolvedRows;
    return filtered.map((row) => toDto(row, duplicateMatchIds, mergedCountById.get(row.id) ?? 0));
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
    return toDto(row, duplicateMatchIds, mergedCount);
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
    const mergedCountById = await this.loadMergedCounts(matches.map((match) => match.id));
    return matches.map((match) => {
      const row = allRows.find((item) => item.id === match.id);
      return row ? toDto(row, duplicateMatchIds, mergedCountById.get(row.id) ?? 0) : null;
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
    await this.markDuplicateCandidates();
    return this.getById(id);
  }

  async merge(sourceId: number, targetId: number, userId?: number): Promise<HrPersonDto> {
    if (sourceId === targetId) throw new HrError('Оберіть іншу особу для об\'єднання');
    const [source, target] = await Promise.all([
      prisma.hrPerson.findUnique({ where: { id: sourceId } }),
      prisma.hrPerson.findUnique({ where: { id: targetId } }),
    ]);
    if (!source || !target) throw new HrError('Особу не знайдено', 404);

    await prisma.$transaction(async (tx) => {
      await tx.hrEmployee.updateMany({
        where: { personId: sourceId },
        data: { personId: targetId },
      });
      await tx.hrPerson.update({
        where: { id: sourceId },
        data: { duplicateOfId: targetId, localStatus: 'duplicate_candidate' },
      });
    });

    await hrAuditService.log({
      entityType: 'person',
      entityId: targetId,
      action: 'merged',
      userId,
      payload: { sourceId, targetId, sourceDisplayName: source.displayName },
    });
    await this.markDuplicateCandidates();
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
