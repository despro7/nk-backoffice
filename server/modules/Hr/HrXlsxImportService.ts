import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { prisma, logServer } from '../../lib/utils.js';
import {
  hrEmployeeImportKeyCandidates,
  type HrLegalEntityKind,
  type HrXlsxImportCommitDto,
  type HrXlsxImportPreviewDto,
} from '../../../shared/types/hr.js';
import { buildTimesheetMonthMeta, daysInMonth, formatYearMonth } from '../../../shared/utils/hrTimesheetCalendar.js';
import { mergeEmploymentRecords } from './HrEmploymentMerge.js';
import { HR_SEED_LEGAL_ENTITY_CODES } from '../../../shared/utils/hrEmploymentDedupe.js';
import { parseHrTimesheetWorkbook } from '../../../shared/utils/hrXlsxImport.js';
import { cardLast4FromDigits, encryptCardNumber } from './HrCardCrypto.js';
import { HrError } from './HrService.js';

function buildDisplayName(lastName: string, firstName: string, middleName?: string | null): string {
  return [lastName, firstName, middleName].map((part) => part?.trim()).filter(Boolean).join(' ');
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function lastDayOfMonth(year: number, month: number): string {
  const day = daysInMonth(year, month);
  return `${formatYearMonth(year, month)}-${String(day).padStart(2, '0')}`;
}

function previousMonthEnd(year: number, month: number): string {
  if (month === 1) return lastDayOfMonth(year - 1, 12);
  return lastDayOfMonth(year, month - 1);
}

export class HrXlsxImportService {
  preview(fileBuffer: Buffer): HrXlsxImportPreviewDto {
    return this.parseWorkbook(fileBuffer).preview;
  }

  async commit(fileBuffer: Buffer, options: { importPayTerms: boolean }): Promise<HrXlsxImportCommitDto> {
    const parsed = this.parseWorkbook(fileBuffer);
    const preview = parsed.preview;
    const entities = await prisma.hrLegalEntity.findMany({ orderBy: { id: 'asc' } });
    const entityByCode = new Map(entities.map((row) => [row.code, row]));
    const entityByKind = new Map<string, (typeof entities)[number]>();
    for (const row of entities) {
      if (row.isActive && !entityByKind.has(row.kind)) entityByKind.set(row.kind, row);
    }

    let createdLegalEntities = 0;

    const resolveEntity = async (item: {
      legalEntityCode: string;
      legalEntityName: string;
      legalEntityKind: HrLegalEntityKind;
    }) => {
      const cached = entityByCode.get(item.legalEntityCode);
      if (cached) return cached;

      const legacyCodes = ['fop', 'tov', 'unofficial_cash'] as const;
      if (legacyCodes.includes(item.legalEntityCode as (typeof legacyCodes)[number])) {
        const legacy = entityByCode.get(item.legalEntityCode) ?? entityByKind.get(item.legalEntityCode);
        if (legacy) {
          entityByCode.set(item.legalEntityCode, legacy);
          return legacy;
        }
      }

      const byName = await prisma.hrLegalEntity.findFirst({
        where: { name: item.legalEntityName, isActive: true },
      });
      if (byName) {
        entityByCode.set(byName.code, byName);
        entityByCode.set(item.legalEntityCode, byName);
        return byName;
      }

      const byCode = await prisma.hrLegalEntity.findUnique({ where: { code: item.legalEntityCode } });
      if (byCode) {
        entityByCode.set(byCode.code, byCode);
        return byCode;
      }

      try {
        const created = await prisma.hrLegalEntity.create({
          data: {
            code: item.legalEntityCode,
            name: item.legalEntityName,
            kind: item.legalEntityKind,
            isActive: true,
          },
        });
        entityByCode.set(created.code, created);
        createdLegalEntities += 1;
        logServer(`[hr-import] created legal entity id=${created.id} code=${created.code} name=${created.name}`);
        return created;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const again = await prisma.hrLegalEntity.findUnique({ where: { code: item.legalEntityCode } });
          if (again) {
            entityByCode.set(again.code, again);
            return again;
          }
        }
        throw error;
      }
    };

    for (const code of ['fop', 'tov', 'unofficial_cash'] as const) {
      const fallback = entityByCode.get(code) ?? entityByKind.get(code);
      if (!fallback) {
        throw new HrError(`Немає активного роботодавця типу ${code}. Додайте або активуйте запис у довіднику.`);
      }
    }

    const existingEmployees = await prisma.hrEmployee.findMany({ where: { deletedAt: null } });
    const employeeByKey = new Map<number, (typeof existingEmployees)[number]>();
    const keyToId = new Map<string, number>();
    for (const row of existingEmployees) {
      employeeByKey.set(row.id, row);
      for (const key of hrEmployeeImportKeyCandidates(row.lastName, row.firstName, row.middleName)) {
        if (!keyToId.has(key)) keyToId.set(key, row.id);
      }
    }

    let createdEmployees = 0;
    let updatedEmployees = 0;
    const idByImportKey = new Map<string, number>();

    for (const person of preview.employees) {
      let existingId: number | undefined;
      for (const key of hrEmployeeImportKeyCandidates(person.lastName, person.firstName, person.middleName)) {
        existingId = keyToId.get(key);
        if (existingId) break;
      }

      const digits = this.cardDigitsForKey(parsed.byEmployeeKey.get(person.employeeKey) ?? []);
      const notes = person.notes;

      if (!existingId) {
        const created = await prisma.hrEmployee.create({
          data: {
            lastName: person.lastName,
            firstName: person.firstName,
            middleName: person.middleName,
            displayName: buildDisplayName(person.lastName, person.firstName, person.middleName),
            status: 'active',
            notes,
            ...(digits
              ? { cardLast4: cardLast4FromDigits(digits), cardNumberEncrypted: encryptCardNumber(digits) }
              : {}),
          },
        });
        createdEmployees += 1;
        existingId = created.id;
        logServer(`[hr-import] created employee id=${created.id} key=${person.employeeKey}`);
      } else {
        const current = employeeByKey.get(existingId);
        const cardUpdate =
          digits && current && !current.cardLast4
            ? { cardLast4: cardLast4FromDigits(digits), cardNumberEncrypted: encryptCardNumber(digits) }
            : {};
        const mergedNotes = mergeNotes(current?.notes ?? null, notes);
        await prisma.hrEmployee.update({
          where: { id: existingId },
          data: {
            notes: mergedNotes,
            ...cardUpdate,
          },
        });
        updatedEmployees += 1;
      }

      idByImportKey.set(person.employeeKey, existingId);
      for (const key of hrEmployeeImportKeyCandidates(person.lastName, person.firstName, person.middleName)) {
        keyToId.set(key, existingId);
      }
    }

    let createdEmployments = 0;
    let reusedEmployments = 0;
    const importEmploymentIds = new Map<string, number>();

    for (const item of preview.employments) {
      const employeeId = idByImportKey.get(item.employeeKey);
      const entity = employeeId
        ? await resolveEntity({
            legalEntityCode: item.legalEntityCode,
            legalEntityName: item.legalEntityName,
            legalEntityKind: item.legalEntityKind,
          })
        : null;
      if (!employeeId || !entity) continue;

      const { employmentId, created } = await this.resolveEmploymentForImport(employeeId, entity, item);
      if (created) createdEmployments += 1;
      else reusedEmployments += 1;
      importEmploymentIds.set(item.employmentImportKey, employmentId);
    }

    await this.closeSupersededEmployments(parsed.byEmployeeKey, preview.employments, importEmploymentIds);

    let createdPayTerms = 0;
    if (options.importPayTerms) {
      for (const item of preview.employments) {
        if (!item.rateAmount || !item.rateKind) continue;
        const employmentId = importEmploymentIds.get(item.employmentImportKey);
        if (!employmentId) continue;
        const existingTerms = await prisma.hrPayTerms.findMany({ where: { employmentId } });
        const duplicate = existingTerms.some(
          (row) =>
            row.kind === item.rateKind &&
            row.amount.toFixed(2) === item.rateAmount &&
            row.effectiveFrom.toISOString().slice(0, 10) === item.validFrom,
        );
        if (duplicate) continue;
        await prisma.hrPayTerms.create({
          data: {
            employmentId,
            kind: item.rateKind,
            amount: new Prisma.Decimal(item.rateAmount),
            currency: 'UAH',
            effectiveFrom: toDate(item.validFrom),
          },
        });
        createdPayTerms += 1;
      }
    }

    const skippedClosedMonths: string[] = [];
    let upsertedEntries = 0;
    const months = this.collectMonths(parsed.byEmployeeKey);

    for (const { year, month } of months) {
      const meta = buildTimesheetMonthMeta(year, month);
      const monthKey = formatYearMonth(year, month);
      let monthRow = await prisma.hrTimesheetMonth.findUnique({
        where: { year_month: { year, month } },
      });
      if (!monthRow) {
        monthRow = await prisma.hrTimesheetMonth.create({
          data: {
            year,
            month,
            status: 'draft',
            version: 1,
            normWorkDays: meta.normWorkDays,
            normHours: new Prisma.Decimal(meta.normHours),
          },
        });
      }
      if (monthRow.status === 'closed') {
        skippedClosedMonths.push(monthKey);
        continue;
      }

      const writes: {
        employmentId: number;
        date: Date;
        kind: string;
        hours: Prisma.Decimal | null;
      }[] = [];

      for (const item of preview.employments) {
        const employmentId = importEmploymentIds.get(item.employmentImportKey);
        if (!employmentId) continue;
        const rows = parsed.byEmployeeKey.get(item.employeeKey) ?? [];
        for (const row of rows) {
          if (row.year !== year || row.month !== month) continue;
          if (row.legalEntityCode !== item.legalEntityCode || row.payGroup !== item.payGroup) continue;
          for (const entry of row.entries) {
            writes.push({
              employmentId,
              date: toDate(entry.date),
              kind: entry.kind,
              hours: entry.hours != null ? new Prisma.Decimal(entry.hours) : null,
            });
          }
        }
      }

      for (const write of writes) {
        await prisma.hrTimesheetEntry.upsert({
          where: {
            monthId_employmentId_date: {
              monthId: monthRow.id,
              employmentId: write.employmentId,
              date: write.date,
            },
          },
          create: {
            monthId: monthRow.id,
            employmentId: write.employmentId,
            date: write.date,
            kind: write.kind,
            hours: write.hours,
          },
          update: {
            kind: write.kind,
            hours: write.hours,
          },
        });
        upsertedEntries += 1;
      }

      if (writes.length > 0) {
        await prisma.hrTimesheetMonth.update({
          where: { id: monthRow.id },
          data: { version: { increment: 1 } },
        });
      }
    }

    logServer(
      `[hr-import] commit employees +${createdEmployees}/~${updatedEmployees} employments +${createdEmployments} entries=${upsertedEntries} payTerms=${createdPayTerms}`,
    );

    return {
      preview,
      createdEmployees,
      updatedEmployees,
      createdLegalEntities,
      createdEmployments,
      reusedEmployments,
      upsertedEntries,
      createdPayTerms,
      skippedClosedMonths,
    };
  }

  private async resolveEmploymentForImport(
    employeeId: number,
    entity: { id: number; code: string },
    item: { payGroup: string; validFrom: string },
  ): Promise<{ employmentId: number; created: boolean }> {
    const validFromDate = toDate(item.validFrom);
    const uniqueWhere = {
      employeeId_legalEntityId_validFrom: {
        employeeId,
        legalEntityId: entity.id,
        validFrom: validFromDate,
      },
    };

    const exact = await prisma.hrEmployment.findUnique({ where: uniqueWhere });
    if (exact) {
      await this.mergeDuplicateEmployments(employeeId, item.payGroup, validFromDate, entity, exact.id);
      return { employmentId: exact.id, created: false };
    }

    const overlapping = await prisma.hrEmployment.findMany({
      where: {
        employeeId,
        payGroup: item.payGroup,
        validFrom: { lte: validFromDate },
        OR: [{ validTo: null }, { validTo: { gte: validFromDate } }],
      },
      include: { legalEntity: true },
      orderBy: { id: 'asc' },
    });

    if (overlapping.length > 0) {
      const sorted = [...overlapping].sort((a, b) => {
        const aSeed = HR_SEED_LEGAL_ENTITY_CODES.has(a.legalEntity.code) ? 1 : 0;
        const bSeed = HR_SEED_LEGAL_ENTITY_CODES.has(b.legalEntity.code) ? 1 : 0;
        if (aSeed !== bSeed) return aSeed - bSeed;
        return a.id - b.id;
      });
      let canonical = sorted[0];

      if (
        HR_SEED_LEGAL_ENTITY_CODES.has(canonical.legalEntity.code) &&
        !HR_SEED_LEGAL_ENTITY_CODES.has(entity.code) &&
        canonical.legalEntityId !== entity.id
      ) {
        try {
          canonical = await prisma.hrEmployment.update({
            where: { id: canonical.id },
            data: { legalEntityId: entity.id },
            include: { legalEntity: true },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const existing = await prisma.hrEmployment.findUnique({
              where: uniqueWhere,
              include: { legalEntity: true },
            });
            if (existing) {
              for (const dup of sorted) {
                if (dup.id === existing.id) continue;
                await mergeEmploymentRecords(prisma, dup.id, existing.id);
              }
              return { employmentId: existing.id, created: false };
            }
          }
          throw error;
        }
      }

      for (const dup of sorted) {
        if (dup.id === canonical.id) continue;
        await mergeEmploymentRecords(prisma, dup.id, canonical.id);
      }

      return { employmentId: canonical.id, created: false };
    }

    try {
      const created = await prisma.hrEmployment.create({
        data: {
          employeeId,
          legalEntityId: entity.id,
          payGroup: item.payGroup,
          validFrom: validFromDate,
        },
      });
      return { employmentId: created.id, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const again = await prisma.hrEmployment.findUnique({ where: uniqueWhere });
        if (again) return { employmentId: again.id, created: false };
      }
      throw error;
    }
  }

  private async mergeDuplicateEmployments(
    employeeId: number,
    payGroup: string,
    validFromDate: Date,
    entity: { id: number; code: string },
    canonicalId: number,
  ): Promise<void> {
    const overlapping = await prisma.hrEmployment.findMany({
      where: {
        employeeId,
        payGroup,
        validFrom: { lte: validFromDate },
        OR: [{ validTo: null }, { validTo: { gte: validFromDate } }],
        NOT: { id: canonicalId },
      },
      include: { legalEntity: true },
    });

    if (
      overlapping.some((row) => HR_SEED_LEGAL_ENTITY_CODES.has(row.legalEntity.code)) &&
      !HR_SEED_LEGAL_ENTITY_CODES.has(entity.code)
    ) {
      const canonical = await prisma.hrEmployment.findUnique({ where: { id: canonicalId } });
      if (canonical && HR_SEED_LEGAL_ENTITY_CODES.has(
        (await prisma.hrLegalEntity.findUnique({ where: { id: canonical.legalEntityId } }))?.code ?? '',
      )) {
        try {
          await prisma.hrEmployment.update({
            where: { id: canonicalId },
            data: { legalEntityId: entity.id },
          });
        } catch {
          // ignore unique conflict — canonical already on target entity
        }
      }
    }

    for (const dup of overlapping) {
      await mergeEmploymentRecords(prisma, dup.id, canonicalId);
    }
  }

  private parseWorkbook(fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: true });
    if (!workbook.SheetNames.length) {
      throw new HrError('Файл не містить аркушів');
    }
    const sheets = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: null,
        raw: true,
      }) as unknown[][],
    }));
    return parseHrTimesheetWorkbook(sheets);
  }

  private cardDigitsForKey(rows: { cardDigits: string | null }[]): string | null {
    return rows.map((row) => row.cardDigits).find((value): value is string => Boolean(value)) ?? null;
  }

  private collectMonths(byEmployeeKey: Map<string, { year: number; month: number }[]>): { year: number; month: number }[] {
    const set = new Map<string, { year: number; month: number }>();
    for (const rows of byEmployeeKey.values()) {
      for (const row of rows) {
        set.set(formatYearMonth(row.year, row.month), { year: row.year, month: row.month });
      }
    }
    return [...set.values()].sort((a, b) => a.year - b.year || a.month - b.month);
  }

  private async closeSupersededEmployments(
    byEmployeeKey: Map<string, { year: number; month: number; legalEntityCode: string; payGroup: string }[]>,
    employments: { employmentImportKey: string; employeeKey: string; legalEntityCode: string; payGroup: string; validFrom: string }[],
    importEmploymentIds: Map<string, number>,
  ): Promise<void> {
    for (const [employeeKey, rows] of byEmployeeKey) {
      const months = [...new Set(rows.map((row) => formatYearMonth(row.year, row.month)))].sort();
      const combos = employments.filter((item) => item.employeeKey === employeeKey);
      for (const monthKey of months) {
        const [yearS, monthS] = monthKey.split('-').map(Number);
        const seen = new Set(
          rows
            .filter((row) => row.year === yearS && row.month === monthS)
            .map((row) => `${row.legalEntityCode}::${row.payGroup}`),
        );
        if (seen.size === 0) continue;
        for (const combo of combos) {
          const token = `${combo.legalEntityCode}::${combo.payGroup}`;
          if (seen.has(token)) continue;
          if (combo.validFrom >= `${monthKey}-01`) continue;
          const id = importEmploymentIds.get(combo.employmentImportKey);
          if (!id) continue;
          const row = await prisma.hrEmployment.findUnique({ where: { id } });
          if (!row || row.validTo) continue;
          const validTo = previousMonthEnd(yearS, monthS);
          if (validTo < combo.validFrom) continue;
          await prisma.hrEmployment.update({
            where: { id },
            data: { validTo: toDate(validTo) },
          });
        }
      }
    }
  }
}

function mergeNotes(existing: string | null, incoming: string | null): string | null {
  const parts = new Set(
    [existing, incoming]
      .filter((value): value is string => Boolean(value && value.trim()))
      .flatMap((value) => value.split(';').map((part) => part.trim()).filter(Boolean)),
  );
  if (parts.size === 0) return existing;
  return [...parts].join('; ');
}

export const hrXlsxImportService = new HrXlsxImportService();
