import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  HR_EMPLOYEE_STATUSES,
  HR_PAY_GROUPS,
  HR_PAY_TERMS_KINDS,
  type HrEmployeeDetailDto,
  type HrEmployeeListItemDto,
  type HrEmployeeStatus,
  type HrEmployeeWritePayload,
  type HrEmploymentDto,
  type HrEmploymentWritePayload,
  type HrLegalEntityDto,
  type HrPayGroup,
  type HrPayTermsDto,
  type HrPayTermsKind,
  type HrPayTermsWritePayload,
  type HrUserOptionDto,
} from '../../../shared/types/hr.js';
import {
  cardLast4FromDigits,
  decryptCardNumber,
  encryptCardNumber,
  maskCardLast4,
  normalizeCardDigits,
} from './HrCardCrypto.js';

export class HrError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'HrError';
    this.status = status;
    this.code = code;
  }
}

const employeeInclude = {
  user: { select: { id: true, name: true, email: true } },
  employments: {
    include: { legalEntity: true, payTerms: { orderBy: { effectiveFrom: 'desc' as const } } },
    orderBy: { validFrom: 'desc' as const },
  },
} satisfies Prisma.HrEmployeeInclude;

type EmployeeRecord = Prisma.HrEmployeeGetPayload<{ include: typeof employeeInclude }>;

function isPayGroup(value: string): value is HrPayGroup {
  return (HR_PAY_GROUPS as readonly string[]).includes(value);
}

function isPayKind(value: string): value is HrPayTermsKind {
  return (HR_PAY_TERMS_KINDS as readonly string[]).includes(value);
}

function isStatus(value: string): value is HrEmployeeStatus {
  return (HR_EMPLOYEE_STATUSES as readonly string[]).includes(value);
}

function parseDateOnly(value: string | null | undefined, field: string): Date | null {
  if (value == null || value === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!m) throw new HrError(`Некоректна дата (${field})`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function requireDateOnly(value: string | null | undefined, field: string): Date {
  const parsed = parseDateOnly(value, field);
  if (!parsed) throw new HrError(`Вкажіть дату (${field})`);
  return parsed;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function buildDisplayName(lastName: string, firstName: string, middleName?: string | null): string {
  return [lastName, firstName, middleName].map((p) => p?.trim()).filter(Boolean).join(' ');
}

function toLegalEntityDto(row: { id: number; code: string; name: string; kind: string; isActive: boolean }): HrLegalEntityDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    isActive: row.isActive,
  };
}

function toPayTermsDto(row: {
  id: number;
  employmentId: number;
  kind: string;
  amount: Prisma.Decimal;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}): HrPayTermsDto {
  return {
    id: row.id,
    employmentId: row.employmentId,
    kind: isPayKind(row.kind) ? row.kind : 'salary',
    amount: row.amount.toFixed(2),
    currency: row.currency,
    effectiveFrom: toDateOnly(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? toDateOnly(row.effectiveTo) : null,
  };
}

function pickCurrentEmployment(employments: EmployeeRecord['employments']) {
  const today = todayUtcDate();
  const open = employments.filter((item) => !item.validTo || item.validTo >= today);
  return (open[0] ?? employments[0] ?? null);
}

function toEmploymentDto(row: EmployeeRecord['employments'][number]): HrEmploymentDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    legalEntityId: row.legalEntityId,
    payGroup: isPayGroup(row.payGroup) ? row.payGroup : 'official_salary',
    validFrom: toDateOnly(row.validFrom),
    validTo: row.validTo ? toDateOnly(row.validTo) : null,
    legalEntity: toLegalEntityDto(row.legalEntity),
    payTerms: row.payTerms.map(toPayTermsDto),
  };
}

function toListItem(row: EmployeeRecord): HrEmployeeListItemDto {
  const current = pickCurrentEmployment(row.employments);
  return {
    id: row.id,
    lastName: row.lastName,
    firstName: row.firstName,
    middleName: row.middleName,
    displayName: row.displayName,
    status: isStatus(row.status) ? row.status : 'inactive',
    userId: row.userId,
    userName: row.user?.name || row.user?.email || null,
    notes: row.notes,
    cardMasked: maskCardLast4(row.cardLast4),
    currentLegalEntityName: current?.legalEntity.name ?? null,
    currentPayGroup: current && isPayGroup(current.payGroup) ? current.payGroup : null,
  };
}

function toDetail(row: EmployeeRecord, revealCard: boolean): HrEmployeeDetailDto {
  let cardNumber: string | null = null;
  if (revealCard && row.cardNumberEncrypted) {
    cardNumber = decryptCardNumber(row.cardNumberEncrypted);
  }
  return {
    ...toListItem(row),
    cardLast4: row.cardLast4,
    cardNumber,
    employments: row.employments.map(toEmploymentDto),
  };
}

function parseAmount(raw: string): Prisma.Decimal {
  const normalized = String(raw).trim().replace(',', '.').replace(/\s/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new HrError('Некоректна сума ставки');
  }
  return new Prisma.Decimal(normalized);
}

function applyCardUpdate(payload: HrEmployeeWritePayload): {
  cardLast4: string | null;
  cardNumberEncrypted: string | null;
} | undefined {
  if (payload.cardNumber === undefined) return undefined;
  const raw = payload.cardNumber;
  if (raw == null || String(raw).trim() === '') {
    return { cardLast4: null, cardNumberEncrypted: null };
  }
  const digits = normalizeCardDigits(String(raw));
  if (digits.length < 4 || digits.length > 19) {
    throw new HrError('Номер картки має містити від 4 до 19 цифр');
  }
  return {
    cardLast4: cardLast4FromDigits(digits),
    cardNumberEncrypted: encryptCardNumber(digits),
  };
}

export class HrService {
  async listLegalEntities(): Promise<HrLegalEntityDto[]> {
    const rows = await prisma.hrLegalEntity.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    return rows.map(toLegalEntityDto);
  }

  async listUserOptions(excludeEmployeeId?: number): Promise<HrUserOptionDto[]> {
    const linked = await prisma.hrEmployee.findMany({
      where: {
        userId: { not: null },
        deletedAt: null,
        ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
      },
      select: { userId: true },
    });
    const taken = linked.map((row) => row.userId).filter((id): id is number => id != null);
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(taken.length ? { id: { notIn: taken } } : {}),
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name || user.email,
      email: user.email,
    }));
  }

  async listEmployees(search?: string, includeInactive = true): Promise<HrEmployeeListItemDto[]> {
    const q = search?.trim();
    const rows = await prisma.hrEmployee.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { status: 'active' }),
        ...(q
          ? {
              OR: [
                { displayName: { contains: q } },
                { lastName: { contains: q } },
                { firstName: { contains: q } },
                { notes: { contains: q } },
              ],
            }
          : {}),
      },
      include: employeeInclude,
      orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
    });
    return rows.map(toListItem);
  }

  async getEmployee(id: number, revealCard: boolean): Promise<HrEmployeeDetailDto> {
    const row = await prisma.hrEmployee.findFirst({
      where: { id, deletedAt: null },
      include: employeeInclude,
    });
    if (!row) throw new HrError('Співробітника не знайдено', 404);
    return toDetail(row, revealCard);
  }

  async createEmployee(payload: HrEmployeeWritePayload, revealCard: boolean): Promise<HrEmployeeDetailDto> {
    const lastName = payload.lastName?.trim();
    const firstName = payload.firstName?.trim();
    if (!lastName || !firstName) throw new HrError('Вкажіть прізвище та імʼя');
    const middleName = payload.middleName?.trim() || null;
    const status = payload.status && isStatus(payload.status) ? payload.status : 'active';
    const card = applyCardUpdate(payload);
    await this.assertUserAvailable(payload.userId ?? null);

    const created = await prisma.hrEmployee.create({
      data: {
        lastName,
        firstName,
        middleName,
        displayName: buildDisplayName(lastName, firstName, middleName),
        status,
        userId: payload.userId ?? null,
        notes: payload.notes?.trim() || null,
        ...(card ?? {}),
      },
      include: employeeInclude,
    });
    logServer('[hr] created employee', { id: created.id });
    return toDetail(created, revealCard);
  }

  async updateEmployee(id: number, payload: HrEmployeeWritePayload, revealCard: boolean): Promise<HrEmployeeDetailDto> {
    const existing = await prisma.hrEmployee.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new HrError('Співробітника не знайдено', 404);

    const lastName = payload.lastName?.trim() ?? existing.lastName;
    const firstName = payload.firstName?.trim() ?? existing.firstName;
    const middleName =
      payload.middleName === undefined ? existing.middleName : payload.middleName?.trim() || null;
    const status =
      payload.status && isStatus(payload.status) ? payload.status : (existing.status as HrEmployeeStatus);
    const card = applyCardUpdate(payload);
    if (payload.userId !== undefined) {
      await this.assertUserAvailable(payload.userId, id);
    }

    const updated = await prisma.hrEmployee.update({
      where: { id },
      data: {
        lastName,
        firstName,
        middleName,
        displayName: buildDisplayName(lastName, firstName, middleName),
        status,
        userId: payload.userId === undefined ? existing.userId : payload.userId,
        notes: payload.notes === undefined ? existing.notes : payload.notes?.trim() || null,
        ...(card ?? {}),
      },
      include: employeeInclude,
    });
    return toDetail(updated, revealCard);
  }

  async deleteEmployee(id: number): Promise<{ soft: boolean }> {
    const existing = await prisma.hrEmployee.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new HrError('Співробітника не знайдено', 404);

    // Табель ще не в PR1: фізичне видалення. Soft-delete — коли з’являться записи табеля.
    await prisma.hrEmployee.delete({ where: { id } });
    logServer('[hr] deleted employee', { id });
    return { soft: false };
  }

  async createEmployment(employeeId: number, payload: HrEmploymentWritePayload): Promise<HrEmploymentDto> {
    await this.requireEmployee(employeeId);
    const data = await this.normalizeEmploymentPayload(payload);
    try {
      const created = await prisma.hrEmployment.create({
        data: { employeeId, ...data },
        include: { legalEntity: true, payTerms: { orderBy: { effectiveFrom: 'desc' } } },
      });
      return toEmploymentDto(created);
    } catch (error) {
      this.rethrowUniqueEmployment(error);
      throw error;
    }
  }

  async updateEmployment(id: number, payload: HrEmploymentWritePayload): Promise<HrEmploymentDto> {
    const existing = await prisma.hrEmployment.findUnique({ where: { id } });
    if (!existing) throw new HrError('Зайнятість не знайдено', 404);
    const data = await this.normalizeEmploymentPayload(payload);
    try {
      const updated = await prisma.hrEmployment.update({
        where: { id },
        data,
        include: { legalEntity: true, payTerms: { orderBy: { effectiveFrom: 'desc' } } },
      });
      return toEmploymentDto(updated);
    } catch (error) {
      this.rethrowUniqueEmployment(error);
      throw error;
    }
  }

  async deleteEmployment(id: number): Promise<void> {
    const existing = await prisma.hrEmployment.findUnique({ where: { id } });
    if (!existing) throw new HrError('Зайнятість не знайдено', 404);
    const hasTimesheet = await prisma.hrTimesheetEntry.count({ where: { employmentId: id } });
    if (hasTimesheet > 0) {
      throw new HrError('Неможливо видалити зайнятість: є записи табеля');
    }
    await prisma.hrEmployment.delete({ where: { id } });
  }

  async createPayTerms(employmentId: number, payload: HrPayTermsWritePayload): Promise<HrPayTermsDto> {
    const employment = await prisma.hrEmployment.findUnique({ where: { id: employmentId } });
    if (!employment) throw new HrError('Зайнятість не знайдено', 404);
    const data = this.normalizePayTermsPayload(payload);
    const created = await prisma.hrPayTerms.create({
      data: { employmentId, ...data },
    });
    return toPayTermsDto(created);
  }

  async updatePayTerms(id: number, payload: HrPayTermsWritePayload): Promise<HrPayTermsDto> {
    const existing = await prisma.hrPayTerms.findUnique({ where: { id } });
    if (!existing) throw new HrError('Ставку не знайдено', 404);
    const data = this.normalizePayTermsPayload(payload);
    const updated = await prisma.hrPayTerms.update({ where: { id }, data });
    return toPayTermsDto(updated);
  }

  async deletePayTerms(id: number): Promise<void> {
    const existing = await prisma.hrPayTerms.findUnique({ where: { id } });
    if (!existing) throw new HrError('Ставку не знайдено', 404);
    await prisma.hrPayTerms.delete({ where: { id } });
  }

  private async requireEmployee(id: number): Promise<void> {
    const row = await prisma.hrEmployee.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!row) throw new HrError('Співробітника не знайдено', 404);
  }

  private async assertUserAvailable(userId: number | null, excludeEmployeeId?: number): Promise<void> {
    if (userId == null) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new HrError('Користувача не знайдено');
    const taken = await prisma.hrEmployee.findFirst({
      where: {
        userId,
        deletedAt: null,
        ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
      },
      select: { id: true },
    });
    if (taken) throw new HrError('Цей обліковий запис уже привʼязано до іншого співробітника');
  }

  private async normalizeEmploymentPayload(payload: HrEmploymentWritePayload) {
    if (!isPayGroup(payload.payGroup)) throw new HrError('Невідома група оплати');
    const legalEntity = await prisma.hrLegalEntity.findUnique({ where: { id: Number(payload.legalEntityId) } });
    if (!legalEntity || !legalEntity.isActive) throw new HrError('Юрособу не знайдено');
    const validFrom = requireDateOnly(payload.validFrom, 'validFrom');
    const validTo = parseDateOnly(payload.validTo, 'validTo');
    if (validTo && validTo < validFrom) throw new HrError('Дата завершення не може бути раніше початку');
    return {
      legalEntityId: legalEntity.id,
      payGroup: payload.payGroup,
      validFrom,
      validTo,
    };
  }

  private normalizePayTermsPayload(payload: HrPayTermsWritePayload) {
    if (!isPayKind(payload.kind)) throw new HrError('Невідомий тип ставки');
    const effectiveFrom = requireDateOnly(payload.effectiveFrom, 'effectiveFrom');
    const effectiveTo = parseDateOnly(payload.effectiveTo, 'effectiveTo');
    if (effectiveTo && effectiveTo < effectiveFrom) throw new HrError('Дата завершення ставки не може бути раніше початку');
    return {
      kind: payload.kind,
      amount: parseAmount(payload.amount),
      currency: payload.currency?.trim() || 'UAH',
      effectiveFrom,
      effectiveTo,
    };
  }

  private rethrowUniqueEmployment(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HrError('Зайнятість з такою юрособою і датою початку вже існує');
    }
  }
}

export const hrService = new HrService();
