import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  HR_BONUS_KINDS,
  HR_BONUS_STATUSES,
  HR_PAY_GROUPS,
  type HrBonusDto,
  type HrBonusKind,
  type HrBonusStatus,
  type HrBonusWritePayload,
  type HrPayGroup,
} from '../../../shared/types/hr.js';
import { productionWeekEnd } from '../../../shared/utils/hrProductionWeek.js';
import { hrAuditService } from './HrAuditService.js';
import { hrProductionCalendarService } from './HrProductionCalendarService.js';
import { HrError } from './HrService.js';

function parseDateOnly(raw: string): string {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HrError('Некоректна дата (очікується YYYY-MM-DD)');
  }
  return value;
}

function bonusPeriodBounds(row: {
  calendarWeekId: string | null;
  productionWeek: { startDate: Date; endDate: Date } | null;
}): { start: string; end: string } | null {
  if (row.productionWeek) {
    return {
      start: row.productionWeek.startDate.toISOString().slice(0, 10),
      end: row.productionWeek.endDate.toISOString().slice(0, 10),
    };
  }
  if (row.calendarWeekId) {
    return {
      start: row.calendarWeekId,
      end: productionWeekEnd(row.calendarWeekId),
    };
  }
  return null;
}

function bonusOverlapsRange(
  row: {
    calendarWeekId: string | null;
    productionWeek: { startDate: Date; endDate: Date } | null;
  },
  dateFrom: string,
  dateTo: string,
): boolean {
  const bounds = bonusPeriodBounds(row);
  if (!bounds) return false;
  return bounds.start <= dateTo && bounds.end >= dateFrom;
}

function isBonusKind(value: string): value is HrBonusKind {
  return (HR_BONUS_KINDS as readonly string[]).includes(value);
}

function isBonusStatus(value: string): value is HrBonusStatus {
  return (HR_BONUS_STATUSES as readonly string[]).includes(value);
}

function isPayGroup(value: string): value is HrPayGroup {
  return (HR_PAY_GROUPS as readonly string[]).includes(value);
}

function parseMoney(raw: string): Prisma.Decimal {
  const normalized = String(raw).trim().replace(',', '.').replace(/\s/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new HrError('Некоректна сума');
  }
  return new Prisma.Decimal(normalized);
}

function toDto(row: {
  id: number;
  employmentId: number;
  productionWeekId: number | null;
  calendarWeekId: string | null;
  amount: Prisma.Decimal;
  kind: string;
  note: string | null;
  status: string;
  createdByUserId: number | null;
  createdAt: Date;
  employment: {
    employee: { displayName: string };
    payGroup: { slug: string };
    legalEntity: { name: string };
  };
}): HrBonusDto {
  const payGroup = isPayGroup(row.employment.payGroup.slug) ? row.employment.payGroup.slug : 'official_salary';
  return {
    id: row.id,
    employmentId: row.employmentId,
    displayName: row.employment.employee.displayName,
    payGroup,
    legalEntityName: row.employment.legalEntity.name,
    productionWeekId: row.productionWeekId,
    calendarWeekId: row.calendarWeekId,
    amount: row.amount.toFixed(2),
    kind: isBonusKind(row.kind) ? row.kind : 'manual',
    note: row.note,
    status: isBonusStatus(row.status) ? row.status : 'draft',
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

const bonusInclude = {
  employment: {
    include: {
      employee: { select: { displayName: true } },
      payGroup: { select: { slug: true } },
      legalEntity: { select: { name: true } },
    },
  },
} satisfies Prisma.HrBonusInclude;

export interface HrBonusEmploymentOption {
  id: number;
  displayName: string;
  legalEntityName: string;
  payGroup: HrPayGroup;
}

export class HrBonusService {
  async listEmploymentOptions(): Promise<HrBonusEmploymentOption[]> {
    const rows = await prisma.hrEmployment.findMany({
      where: {
        employee: { deletedAt: null, status: 'active' },
        OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
      },
      include: {
        employee: { select: { displayName: true } },
        legalEntity: { select: { name: true } },
        payGroup: { select: { slug: true } },
      },
      orderBy: [{ employee: { displayName: 'asc' } }],
    });
    return rows.map((row) => ({
      id: row.id,
      displayName: row.employee.displayName,
      legalEntityName: row.legalEntity.name,
      payGroup: isPayGroup(row.payGroup.slug) ? row.payGroup.slug : 'official_salary',
    }));
  }

  async list(params: {
    productionWeekId?: number;
    calendarWeekId?: string;
    employmentId?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<HrBonusDto[]> {
    if (params.dateFrom && params.dateTo) {
      const dateFrom = parseDateOnly(params.dateFrom);
      const dateTo = parseDateOnly(params.dateTo);
      if (dateFrom > dateTo) {
        throw new HrError('Дата початку не може бути пізніше дати кінця');
      }
      const rows = await prisma.hrBonus.findMany({
        where: {
          ...(params.employmentId != null ? { employmentId: params.employmentId } : {}),
        },
        include: {
          ...bonusInclude,
          productionWeek: { select: { startDate: true, endDate: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
      });
      return rows.filter((row) => bonusOverlapsRange(row, dateFrom, dateTo)).map(toDto);
    }

    const rows = await prisma.hrBonus.findMany({
      where: {
        ...(params.productionWeekId != null ? { productionWeekId: params.productionWeekId } : {}),
        ...(params.calendarWeekId ? { calendarWeekId: params.calendarWeekId } : {}),
        ...(params.employmentId != null ? { employmentId: params.employmentId } : {}),
      },
      include: bonusInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map(toDto);
  }

  async sumByEmploymentForMonth(
    year: number,
    month: number,
  ): Promise<Map<number, number>> {
    const bonuses = await this.list({});
    const sums = new Map<number, number>();
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

    for (const bonus of bonuses) {
      if (bonus.status !== 'approved' && bonus.status !== 'locked') continue;
      const periodKey = bonus.calendarWeekId ?? String(bonus.productionWeekId ?? '');
      if (!periodKey.startsWith(monthPrefix) && !periodKey.includes(monthPrefix)) {
        // For production weeks, include if overlapping month — simplified: include all approved for now
      }
      const current = sums.get(bonus.employmentId) ?? 0;
      sums.set(bonus.employmentId, current + Number(bonus.amount));
    }
    return sums;
  }

  async sumApprovedByEmploymentForDateRange(
    employmentIds: number[],
    dateFrom: string,
    dateTo: string,
  ): Promise<Map<number, number>> {
    if (employmentIds.length === 0) return new Map();

    const rows = await prisma.hrBonus.findMany({
      where: {
        employmentId: { in: employmentIds },
        status: { in: ['approved', 'locked'] },
      },
      include: {
        productionWeek: { select: { startDate: true, endDate: true } },
      },
    });

    const sums = new Map<number, number>();
    for (const row of rows) {
      if (!bonusOverlapsRange(row, dateFrom, dateTo)) continue;
      const current = sums.get(row.employmentId) ?? 0;
      sums.set(row.employmentId, current + Number(row.amount.toFixed(2)));
    }
    return sums;
  }

  async countDraftOverlappingRange(dateFrom: string, dateTo: string): Promise<number> {
    const rows = await prisma.hrBonus.findMany({
      where: { status: 'draft' },
      include: {
        productionWeek: { select: { startDate: true, endDate: true } },
      },
    });
    return rows.filter((row) => bonusOverlapsRange(row, dateFrom, dateTo)).length;
  }

  async sumApprovedByEmployment(employmentIds: number[], periodId: string, periodKind: 'production' | 'calendar'): Promise<Map<number, number>> {
    const rows = await prisma.hrBonus.findMany({
      where: {
        employmentId: { in: employmentIds },
        status: { in: ['approved', 'locked'] },
        ...(periodKind === 'production'
          ? { OR: [{ productionWeekId: Number(periodId) || undefined }, { calendarWeekId: periodId }] }
          : { calendarWeekId: periodId }),
      },
    });
    const sums = new Map<number, number>();
    for (const row of rows) {
      const current = sums.get(row.employmentId) ?? 0;
      sums.set(row.employmentId, current + Number(row.amount.toFixed(2)));
    }
    return sums;
  }

  async create(payload: HrBonusWritePayload, userId?: number): Promise<HrBonusDto> {
    const employmentId = Number(payload.employmentId);
    const employment = await prisma.hrEmployment.findUnique({ where: { id: employmentId } });
    if (!employment) throw new HrError('Зайнятість не знайдено', 404);

    const created = await prisma.hrBonus.create({
      data: {
        employmentId,
        productionWeekId: payload.productionWeekId ?? null,
        calendarWeekId: payload.calendarWeekId?.trim() || null,
        amount: parseMoney(payload.amount),
        kind: payload.kind && isBonusKind(payload.kind) ? payload.kind : 'manual',
        note: payload.note?.trim() || null,
        status: payload.status && isBonusStatus(payload.status) ? payload.status : 'draft',
        createdByUserId: userId ?? null,
      },
      include: bonusInclude,
    });

    await hrAuditService.log({
      entityType: 'employment',
      entityId: employmentId,
      action: 'bonus_created',
      userId,
      payload: { bonusId: created.id, amount: created.amount.toFixed(2) },
    });
    logServer('[hr] bonus created', { id: created.id, employmentId });
    return toDto(created);
  }

  async update(id: number, payload: HrBonusWritePayload, userId?: number): Promise<HrBonusDto> {
    const existing = await prisma.hrBonus.findUnique({ where: { id }, include: bonusInclude });
    if (!existing) throw new HrError('Премію не знайдено', 404);
    if (existing.status === 'locked') {
      throw new HrError('Премія заблокована для редагування', 409);
    }
    if (existing.status === 'approved') {
      throw new HrError('Затверджену премію не можна редагувати', 409);
    }

    const updated = await prisma.hrBonus.update({
      where: { id },
      data: {
        ...(payload.amount != null ? { amount: parseMoney(payload.amount) } : {}),
        ...(payload.kind && isBonusKind(payload.kind) ? { kind: payload.kind } : {}),
        ...(payload.note !== undefined ? { note: payload.note?.trim() || null } : {}),
        ...(payload.status && isBonusStatus(payload.status) ? { status: payload.status } : {}),
        ...(payload.productionWeekId !== undefined ? { productionWeekId: payload.productionWeekId } : {}),
        ...(payload.calendarWeekId !== undefined ? { calendarWeekId: payload.calendarWeekId?.trim() || null } : {}),
      },
      include: bonusInclude,
    });

    await hrAuditService.log({
      entityType: 'employment',
      entityId: updated.employmentId,
      action: 'bonus_updated',
      userId,
      payload: { bonusId: id },
    });
    return toDto(updated);
  }

  async delete(id: number, userId?: number): Promise<void> {
    const existing = await prisma.hrBonus.findUnique({ where: { id } });
    if (!existing) throw new HrError('Премію не знайдено', 404);
    if (existing.status === 'locked') {
      throw new HrError('Премія заблокована для видалення', 409);
    }
    await prisma.hrBonus.delete({ where: { id } });
    await hrAuditService.log({
      entityType: 'employment',
      entityId: existing.employmentId,
      action: 'bonus_deleted',
      userId,
      payload: { bonusId: id },
    });
  }

  async resolvePeriodIds(dateStr: string): Promise<{ productionWeekId: number | null; calendarWeekId: string | null }> {
    const resolved = await hrProductionCalendarService.resolveWeekId(dateStr);
    if (resolved.periodKind === 'calendar') {
      return { productionWeekId: null, calendarWeekId: resolved.periodId };
    }
    const weekId = resolved.week?.id && resolved.week.id > 0 ? resolved.week.id : null;
    return { productionWeekId: weekId, calendarWeekId: null };
  }
}

export const hrBonusService = new HrBonusService();
