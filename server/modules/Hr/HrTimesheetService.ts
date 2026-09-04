import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  HR_PAY_GROUPS,
  HR_TIMESHEET_STATUSES,
  type HrPayGroup,
  type HrTimesheetEntryDto,
  type HrTimesheetEntryWrite,
  type HrTimesheetKind,
  type HrTimesheetLoadDto,
  type HrTimesheetMonthDto,
  type HrTimesheetSaveDto,
} from '../../../shared/types/hr.js';
import {
  buildTimesheetMonthMeta,
  parseYearMonth,
  toDateOnlyUtc,
  utcDate,
} from '../../../shared/utils/hrTimesheetCalendar.js';
import { isTimesheetKind, parseTimesheetHours } from '../../../shared/utils/hrTimesheetCell.js';
import {
  dedupeEmploymentsByEmployeePayGroup,
  remapEmploymentId,
} from '../../../shared/utils/hrEmploymentDedupe.js';
import { HrError } from './HrService.js';

const LOCK_TTL_MS = 15 * 60 * 1000;

function isPayGroup(value: string): value is HrPayGroup {
  return (HR_PAY_GROUPS as readonly string[]).includes(value);
}

function isStatus(value: string): value is HrTimesheetMonthDto['status'] {
  return (HR_TIMESHEET_STATUSES as readonly string[]).includes(value);
}

function formatHours(value: Prisma.Decimal | null): string | null {
  if (value == null) return null;
  return value.toFixed(2);
}

function toMonthDto(row: {
  id: number;
  year: number;
  month: number;
  status: string;
  version: number;
  normWorkDays: number;
  normHours: Prisma.Decimal;
  lockedByUserId: number | null;
  lockedUntil: Date | null;
  lockedByUser?: { name: string | null; email: string } | null;
}): HrTimesheetMonthDto {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    status: isStatus(row.status) ? row.status : 'draft',
    version: row.version,
    normWorkDays: row.normWorkDays,
    normHours: row.normHours.toFixed(2),
    lockedByUserId: row.lockedByUserId,
    lockedByName: row.lockedByUser?.name || row.lockedByUser?.email || null,
    lockedUntil: row.lockedUntil ? row.lockedUntil.toISOString() : null,
  };
}

function toEntryDto(row: {
  employmentId: number;
  date: Date;
  kind: string;
  hours: Prisma.Decimal | null;
}): HrTimesheetEntryDto {
  return {
    employmentId: row.employmentId,
    date: toDateOnlyUtc(row.date),
    kind: (isTimesheetKind(row.kind) ? row.kind : 'work') as HrTimesheetKind,
    hours: formatHours(row.hours),
  };
}

function parseEntryKind(payload: HrTimesheetEntryWrite): {
  kind: HrTimesheetKind;
  hours: Prisma.Decimal | null;
} | null {
  if (payload.kind == null) return null;
  if (!isTimesheetKind(payload.kind)) {
    throw new HrError('Невідомий код дня');
  }
  if (payload.kind === 'work') {
    const hoursRaw = parseTimesheetHours(String(payload.hours ?? ''));
    if (!hoursRaw) throw new HrError('Вкажіть години (0.1–24, 1 знак після коми)');
    return { kind: 'work', hours: new Prisma.Decimal(Number(hoursRaw).toFixed(2)) };
  }
  return { kind: payload.kind, hours: null };
}

export class HrTimesheetService {
  async loadMonth(monthParam: string | undefined, userId: number | undefined): Promise<HrTimesheetLoadDto> {
    const { year, month } = (() => {
      try {
        return parseYearMonth(monthParam);
      } catch (error) {
        throw new HrError(error instanceof Error ? error.message : 'Некоректний місяць');
      }
    })();

    const meta = buildTimesheetMonthMeta(year, month);
    const monthStart = utcDate(year, month, 1);
    const monthEnd = utcDate(year, month, meta.days.length);

    const row = await prisma.$transaction(async (tx) => {
      let existing = await tx.hrTimesheetMonth.findUnique({
        where: { year_month: { year, month } },
        include: { lockedByUser: { select: { name: true, email: true } } },
      });

      if (!existing) {
        let createdNow = false;
        try {
          existing = await tx.hrTimesheetMonth.create({
            data: {
              year,
              month,
              status: 'draft',
              version: 1,
              normWorkDays: meta.normWorkDays,
              normHours: new Prisma.Decimal(meta.normHours),
            },
            include: { lockedByUser: { select: { name: true, email: true } } },
          });
          createdNow = true;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            existing = await tx.hrTimesheetMonth.findUniqueOrThrow({
              where: { year_month: { year, month } },
              include: { lockedByUser: { select: { name: true, email: true } } },
            });
          } else {
            throw error;
          }
        }

        if (createdNow) {
          const employments = await tx.hrEmployment.findMany({
            where: {
              validFrom: { lte: monthEnd },
              OR: [{ validTo: null }, { validTo: { gte: monthStart } }],
              employee: { deletedAt: null },
            },
            select: { id: true },
          });

          const weekendDates = meta.days.filter((day) => day.isWeekend).map((day) => day.date);
          if (employments.length > 0 && weekendDates.length > 0) {
            await tx.hrTimesheetEntry.createMany({
              data: employments.flatMap((employment) =>
                weekendDates.map((date) => ({
                  monthId: existing!.id,
                  employmentId: employment.id,
                  date: new Date(`${date}T00:00:00.000Z`),
                  kind: 'В',
                  hours: null,
                })),
              ),
            });
          }
        }
      }

      if (userId && existing.status === 'draft') {
        const now = new Date();
        const lockExpired = !existing.lockedUntil || existing.lockedUntil <= now;
        const heldByMe = existing.lockedByUserId === userId;
        if (lockExpired || heldByMe) {
          existing = await tx.hrTimesheetMonth.update({
            where: { id: existing.id },
            data: {
              lockedByUserId: userId,
              lockedUntil: new Date(now.getTime() + LOCK_TTL_MS),
            },
            include: { lockedByUser: { select: { name: true, email: true } } },
          });
        }
      }

      return existing;
    });

    const [employments, entries] = await Promise.all([
      prisma.hrEmployment.findMany({
        where: {
          validFrom: { lte: monthEnd },
          OR: [{ validTo: null }, { validTo: { gte: monthStart } }],
          employee: { deletedAt: null },
        },
        include: {
          employee: { select: { id: true, displayName: true, status: true } },
          legalEntity: { select: { name: true, code: true } },
        },
        orderBy: [{ payGroup: 'asc' }, { id: 'asc' }],
      }),
      prisma.hrTimesheetEntry.findMany({
        where: { monthId: row.id },
      }),
    ]);

    const { employments: dedupedEmployments, idRemap } = dedupeEmploymentsByEmployeePayGroup(employments);

    const entriesByEmployment = new Map<number, HrTimesheetEntryDto[]>();
    for (const entry of entries) {
      const dto = toEntryDto(entry);
      const canonicalId = remapEmploymentId(idRemap, entry.employmentId);
      const list = entriesByEmployment.get(canonicalId) ?? [];
      const existingIdx = list.findIndex((item) => item.date === dto.date);
      if (existingIdx >= 0) list[existingIdx] = dto;
      else list.push(dto);
      entriesByEmployment.set(canonicalId, list);
    }

    const groupOrder = new Map(HR_PAY_GROUPS.map((group, index) => [group, index]));
    const rows = dedupedEmployments
      .map((employment) => ({
        employmentId: employment.id,
        employeeId: employment.employee.id,
        displayName: employment.employee.displayName,
        payGroup: isPayGroup(employment.payGroup) ? employment.payGroup : 'official_salary',
        legalEntityName: employment.legalEntity.name,
        entries: entriesByEmployment.get(employment.id) ?? [],
      }))
      .sort((a, b) => {
        const ga = groupOrder.get(a.payGroup) ?? 99;
        const gb = groupOrder.get(b.payGroup) ?? 99;
        if (ga !== gb) return ga - gb;
        return a.displayName.localeCompare(b.displayName, 'uk');
      });

    return {
      month: toMonthDto(row),
      days: meta.days,
      weeks: meta.weeks,
      rows,
    };
  }

  async saveMonth(
    monthId: number,
    payload: { version: number; entries: HrTimesheetEntryWrite[] },
    userId: number | undefined,
  ): Promise<HrTimesheetSaveDto> {
    const version = Number(payload.version);
    if (!Number.isInteger(version) || version < 1) {
      throw new HrError('Некоректна версія табеля');
    }
    const writes = Array.isArray(payload.entries) ? payload.entries : [];

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.hrTimesheetMonth.findUnique({
        where: { id: monthId },
        include: { lockedByUser: { select: { name: true, email: true } } },
      });
      if (!current) throw new HrError('Місяць табеля не знайдено', 404);
      if (current.status === 'closed') {
        throw new HrError('Місяць закрито', 409, 'TIMESHEET_CLOSED');
      }
      if (current.version !== version) {
        throw new HrError('Табель змінено іншим користувачем. Оновіть дані.', 409, 'TIMESHEET_VERSION');
      }

      const now = new Date();
      const updated = await tx.hrTimesheetMonth.updateMany({
        where: { id: monthId, version, status: 'draft' },
        data: {
          version: { increment: 1 },
          lockedByUserId: userId ?? current.lockedByUserId,
          lockedUntil: new Date(now.getTime() + LOCK_TTL_MS),
        },
      });
      if (updated.count !== 1) {
        throw new HrError('Табель змінено іншим користувачем. Оновіть дані.', 409, 'TIMESHEET_VERSION');
      }

      const meta = buildTimesheetMonthMeta(current.year, current.month);
      const allowedDates = new Set(meta.days.map((day) => day.date));
      const employmentIds = [...new Set(writes.map((item) => Number(item.employmentId)))];
      if (employmentIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw new HrError('Некоректна зайнятість');
      }
      if (employmentIds.length > 0) {
        const found = await tx.hrEmployment.findMany({
          where: { id: { in: employmentIds } },
          select: { id: true },
        });
        if (found.length !== employmentIds.length) {
          throw new HrError('Зайнятість не знайдено');
        }
      }

      for (const item of writes) {
        const date = String(item.date ?? '');
        if (!allowedDates.has(date)) {
          throw new HrError('Дата не належить до цього місяця');
        }
        const dateValue = new Date(`${date}T00:00:00.000Z`);
        const parsed = parseEntryKind(item);
        if (!parsed) {
          await tx.hrTimesheetEntry.deleteMany({
            where: { monthId, employmentId: Number(item.employmentId), date: dateValue },
          });
          continue;
        }
        await tx.hrTimesheetEntry.upsert({
          where: {
            monthId_employmentId_date: {
              monthId,
              employmentId: Number(item.employmentId),
              date: dateValue,
            },
          },
          create: {
            monthId,
            employmentId: Number(item.employmentId),
            date: dateValue,
            kind: parsed.kind,
            hours: parsed.hours,
          },
          update: {
            kind: parsed.kind,
            hours: parsed.hours,
          },
        });
      }

      const monthRow = await tx.hrTimesheetMonth.findUniqueOrThrow({
        where: { id: monthId },
        include: { lockedByUser: { select: { name: true, email: true } } },
      });
      const savedEntries = writes.length
        ? await tx.hrTimesheetEntry.findMany({
            where: {
              monthId,
              employmentId: { in: employmentIds },
            },
          })
        : [];
      return { monthRow, savedEntries };
    });

    logServer(`[hr] timesheet saved monthId=${monthId} entries=${writes.length}`);
    return {
      month: toMonthDto(result.monthRow),
      entries: result.savedEntries.map(toEntryDto),
    };
  }
}

export const hrTimesheetService = new HrTimesheetService();
