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
import { countCalendarWorkDays } from '../../../shared/utils/hrWorkWeekPeriods.js';
import { roundMoney } from './payrollCalc.js';
import { hrAuditService } from './HrAuditService.js';
import { HrError } from './HrService.js';

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

function parsePeriodYearMonth(year?: number, month?: number): { year: number; month: number } {
  const now = new Date();
  const periodYear = year ?? now.getFullYear();
  const periodMonth = month ?? now.getMonth() + 1;
  if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) {
    throw new HrError('Некоректний рік періоду');
  }
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    throw new HrError('Некоректний місяць періоду');
  }
  return { year: periodYear, month: periodMonth };
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start: monthStart, end: monthEnd };
}

function toDto(row: {
  id: number;
  employmentId: number;
  periodYear: number;
  periodMonth: number;
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
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
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
    year?: number;
    month?: number;
    employmentId?: number;
  }): Promise<HrBonusDto[]> {
    const { year, month } = parsePeriodYearMonth(params.year, params.month);
    const rows = await prisma.hrBonus.findMany({
      where: {
        periodYear: year,
        periodMonth: month,
        ...(params.employmentId != null ? { employmentId: params.employmentId } : {}),
      },
      include: bonusInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map(toDto);
  }

  async sumByEmploymentForMonth(year: number, month: number): Promise<Map<number, number>> {
    const rows = await prisma.hrBonus.findMany({
      where: {
        periodYear: year,
        periodMonth: month,
        status: { in: ['approved', 'locked'] },
      },
      select: { employmentId: true, amount: true },
    });
    const sums = new Map<number, number>();
    for (const row of rows) {
      const current = sums.get(row.employmentId) ?? 0;
      sums.set(row.employmentId, current + Number(row.amount.toFixed(2)));
    }
    return sums;
  }

  async sumProportionalByEmploymentForRange(
    year: number,
    month: number,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<Map<number, number>> {
    const monthly = await this.sumByEmploymentForMonth(year, month);
    const { start: monthStart, end: monthEnd } = monthBounds(year, month);
    const monthWorkDays = countCalendarWorkDays(monthStart, monthEnd);
    const periodWorkDays = countCalendarWorkDays(rangeStart, rangeEnd);
    if (monthWorkDays <= 0 || periodWorkDays <= 0) return new Map();

    const ratio = periodWorkDays / monthWorkDays;
    const result = new Map<number, number>();
    for (const [employmentId, amount] of monthly) {
      result.set(employmentId, roundMoney(amount * ratio));
    }
    return result;
  }

  async countDraftForMonth(year: number, month: number): Promise<number> {
    return prisma.hrBonus.count({
      where: { periodYear: year, periodMonth: month, status: 'draft' },
    });
  }

  async sumApprovedByEmploymentForDateRange(
    employmentIds: number[],
    dateFrom: string,
    dateTo: string,
  ): Promise<Map<number, number>> {
    if (employmentIds.length === 0) return new Map();
    const year = Number(dateFrom.slice(0, 4));
    const month = Number(dateFrom.slice(5, 7));
    const all = await this.sumProportionalByEmploymentForRange(year, month, dateFrom, dateTo);
    const filtered = new Map<number, number>();
    for (const id of employmentIds) {
      const value = all.get(id);
      if (value != null) filtered.set(id, value);
    }
    return filtered;
  }

  async countDraftOverlappingRange(dateFrom: string, dateTo: string): Promise<number> {
    const startYear = Number(dateFrom.slice(0, 4));
    const startMonth = Number(dateFrom.slice(5, 7));
    const endYear = Number(dateTo.slice(0, 4));
    const endMonth = Number(dateTo.slice(5, 7));
    let count = 0;
    let year = startYear;
    let month = startMonth;
    while (year < endYear || (year === endYear && month <= endMonth)) {
      count += await this.countDraftForMonth(year, month);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return count;
  }

  async create(payload: HrBonusWritePayload, userId?: number): Promise<HrBonusDto> {
    const employmentId = Number(payload.employmentId);
    const employment = await prisma.hrEmployment.findUnique({ where: { id: employmentId } });
    if (!employment) throw new HrError('Зайнятість не знайдено', 404);
    const { year, month } = parsePeriodYearMonth(payload.periodYear, payload.periodMonth);

    const created = await prisma.hrBonus.create({
      data: {
        employmentId,
        periodYear: year,
        periodMonth: month,
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
      payload: { bonusId: created.id, amount: created.amount.toFixed(2), periodYear: year, periodMonth: month },
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
        ...(payload.periodYear != null && payload.periodMonth != null
          ? parsePeriodYearMonth(payload.periodYear, payload.periodMonth)
          : {}),
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
}

export const hrBonusService = new HrBonusService();
