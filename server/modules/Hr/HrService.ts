import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  HR_EMPLOYEE_STATUSES,
  HR_LEGAL_ENTITY_KINDS,
  HR_PAY_GROUPS,
  HR_PAY_TERMS_KINDS,
  type HrEmployeeDetailDto,
  type HrEmployeeListItemDto,
  type HrEmployeeStatus,
  type HrEmployeeWritePayload,
  type HrEmploymentDto,
  type HrEmploymentWritePayload,
  type HrLegalEntityDto,
  type HrLegalEntityKind,
  type HrLegalEntityWritePayload,
  type HrPayGroup,
  type HrPayTermsDto,
  type HrPayTermsKind,
  type HrPayTermsWritePayload,
  type HrStaffOrderDto,
  type HrUserOptionDto,
} from '../../../shared/types/hr.js';
import { buildEmploymentAuditLabel } from '../../../shared/utils/hrAuditFormat.js';
import { HR_SEED_LEGAL_ENTITY_CODES } from '../../../shared/utils/hrEmploymentDedupe.js';
import { collectHrPayWarnings } from '../../../shared/utils/hrPayHealth.js';
import { hrAuditService } from './HrAuditService.js';
import { mergeEmploymentRecords } from './HrEmploymentMerge.js';
import { hrPayGroupService } from './HrPayGroupService.js';
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

const employmentInclude = {
  legalEntity: true,
  payGroup: true,
  payTerms: { orderBy: { effectiveFrom: 'desc' as const } },
  staffOrders: { orderBy: { orderDate: 'desc' as const } },
} satisfies Prisma.HrEmploymentInclude;

const employeeInclude = {
  user: { select: { id: true, name: true, email: true } },
  person: { select: { id: true, displayName: true, taxCode: true, phone: true } },
  employments: {
    include: employmentInclude,
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

function parseUaDisplayName(displayName: string): {
  lastName: string;
  firstName: string;
  middleName: string | null;
} {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { lastName: '', firstName: '', middleName: null };
  }
  if (parts.length === 1) {
    return { lastName: parts[0], firstName: '', middleName: null };
  }
  if (parts.length === 2) {
    return { lastName: parts[0], firstName: parts[1], middleName: null };
  }
  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.slice(2).join(' ') || null,
  };
}

function isLegalEntityKind(value: string): value is HrLegalEntityKind {
  return (HR_LEGAL_ENTITY_KINDS as readonly string[]).includes(value);
}

function toLegalEntityDto(row: {
  id: number;
  code: string;
  name: string;
  kind: string;
  dilovodFirmId?: string | null;
  isActive: boolean;
}): HrLegalEntityDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: isLegalEntityKind(row.kind) ? row.kind : 'fop',
    dilovodFirmId: row.dilovodFirmId ?? null,
    isActive: row.isActive,
  };
}

function payGroupSlugFromRow(row: { payGroup: { slug: string } }): HrPayGroup {
  return isPayGroup(row.payGroup.slug) ? row.payGroup.slug : 'official_salary';
}

function toStaffOrderDto(row: {
  id: number;
  employmentId: number;
  kind: string;
  position: string | null;
  orderDate: Date;
  orderNumber: string | null;
  hireDate: Date | null;
  dismissDate: Date | null;
  dilovodDocId: string | null;
}): HrStaffOrderDto {
  return {
    id: row.id,
    employmentId: row.employmentId,
    kind: row.kind,
    position: row.position,
    orderDate: toDateOnly(row.orderDate),
    orderNumber: row.orderNumber,
    hireDate: row.hireDate ? toDateOnly(row.hireDate) : null,
    dismissDate: row.dismissDate ? toDateOnly(row.dismissDate) : null,
    dilovodDocId: row.dilovodDocId,
  };
}

function slugifyLegalEntityCode(name: string, kind: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const suffix = Date.now().toString(36).slice(-4);
  return `${kind}_${normalized || 'entity'}_${suffix}`.slice(0, 32);
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

function toEmploymentDto(
  row: Prisma.HrEmploymentGetPayload<{ include: typeof employmentInclude }>,
): HrEmploymentDto {
  const payGroupSlug = payGroupSlugFromRow(row);
  return {
    id: row.id,
    employeeId: row.employeeId,
    legalEntityId: row.legalEntityId,
    payGroupId: row.payGroupId,
    payGroupSlug,
    payGroup: payGroupSlug,
    personnelNumber: row.personnelNumber,
    dilovodEmployeeId: row.dilovodEmployeeId,
    officialPosition: row.officialPosition,
    unofficialPosition: row.unofficialPosition,
    employeeCategory: row.employeeCategory,
    benefitCode: row.benefitCode,
    validFrom: toDateOnly(row.validFrom),
    validTo: row.validTo ? toDateOnly(row.validTo) : null,
    legalEntity: toLegalEntityDto(row.legalEntity),
    payTerms: row.payTerms.map(toPayTermsDto),
    staffOrders: row.staffOrders.map(toStaffOrderDto),
  };
}

function toListItem(row: EmployeeRecord): HrEmployeeListItemDto {
  const current = pickCurrentEmployment(row.employments);
  const payWarnings = collectHrPayWarnings(
    row.employments.map((item) => ({
      payGroup: payGroupSlugFromRow(item),
      validFrom: toDateOnly(item.validFrom),
      validTo: item.validTo ? toDateOnly(item.validTo) : null,
      legalEntityName: item.legalEntity.name,
      payTerms: item.payTerms.map((term) => ({
        effectiveFrom: toDateOnly(term.effectiveFrom),
        effectiveTo: term.effectiveTo ? toDateOnly(term.effectiveTo) : null,
      })),
    })),
    undefined,
    isStatus(row.status) ? row.status : 'inactive',
  );
  return {
    id: row.id,
    lastName: row.lastName,
    firstName: row.firstName,
    middleName: row.middleName,
    displayName: row.displayName,
    status: isStatus(row.status) ? row.status : 'inactive',
    personId: row.personId,
    userId: row.userId,
    userName: row.user?.name || row.user?.email || null,
    notes: row.notes,
    cardMasked: maskCardLast4(row.cardLast4),
    currentLegalEntityName: current?.legalEntity.name ?? null,
    currentPayGroup: current ? payGroupSlugFromRow(current) : null,
    hasPayWarning: payWarnings.length > 0,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
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
    person: row.person
      ? {
          id: row.person.id,
          displayName: row.person.displayName,
          taxCode: row.person.taxCode,
          phone: row.person.phone,
        }
      : null,
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
  async listLegalEntities(includeInactive = false): Promise<HrLegalEntityDto[]> {
    const rows = await prisma.hrLegalEntity.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toLegalEntityDto);
  }

  async createLegalEntity(payload: HrLegalEntityWritePayload, userId?: number): Promise<HrLegalEntityDto> {
    const name = payload.name?.trim();
    if (!name) throw new HrError('Вкажіть назву роботодавця');
    if (!isLegalEntityKind(payload.kind)) throw new HrError('Невідомий тип роботодавця');

    let code = slugifyLegalEntityCode(name, payload.kind);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await prisma.hrLegalEntity.findUnique({ where: { code } });
      if (!exists) break;
      code = slugifyLegalEntityCode(name, payload.kind);
    }

    const created = await prisma.hrLegalEntity.create({
      data: {
        code,
        name,
        kind: payload.kind,
        isActive: payload.isActive ?? true,
      },
    });
    await hrAuditService.log({
      entityType: 'legal_entity',
      entityId: created.id,
      action: 'created',
      userId,
      payload: { code: created.code, name: created.name },
    });
    logServer('[hr] created legal entity', { id: created.id, code: created.code });
    return toLegalEntityDto(created);
  }

  async updateLegalEntity(id: number, payload: HrLegalEntityWritePayload, userId?: number): Promise<HrLegalEntityDto> {
    const existing = await prisma.hrLegalEntity.findUnique({ where: { id } });
    if (!existing) throw new HrError('Роботодавця не знайдено', 404);

    const name = payload.name?.trim();
    if (!name) throw new HrError('Вкажіть назву роботодавця');
    if (!isLegalEntityKind(payload.kind)) throw new HrError('Невідомий тип роботодавця');

    const nextActive = payload.isActive ?? existing.isActive;
    if (!nextActive) {
      const activeCount = await prisma.hrLegalEntity.count({
        where: { kind: existing.kind, isActive: true, id: { not: id } },
      });
      if (activeCount === 0) {
        throw new HrError('Не можна деактивувати останнього активного роботодавця цього типу');
      }
    }

    const updated = await prisma.hrLegalEntity.update({
      where: { id },
      data: {
        name,
        kind: payload.kind,
        isActive: nextActive,
      },
    });
    await hrAuditService.log({
      entityType: 'legal_entity',
      entityId: id,
      action: 'updated',
      userId,
      payload: { name: updated.name, isActive: updated.isActive },
    });
    return toLegalEntityDto(updated);
  }

  async deleteLegalEntity(sourceId: number, targetLegalEntityId: number, userId?: number): Promise<void> {
    if (sourceId === targetLegalEntityId) {
      throw new HrError('Оберіть іншого роботодавця для перенесення даних');
    }

    const source = await prisma.hrLegalEntity.findUnique({ where: { id: sourceId } });
    if (!source) throw new HrError('Роботодавця не знайдено', 404);
    if (HR_SEED_LEGAL_ENTITY_CODES.has(source.code)) {
      throw new HrError('Не можна видалити базового роботодавця системи');
    }

    const target = await prisma.hrLegalEntity.findUnique({ where: { id: targetLegalEntityId } });
    if (!target) throw new HrError('Роботодавця для перенесення не знайдено', 404);
    if (!target.isActive) throw new HrError('Роботодавець для перенесення має бути активним');

    await prisma.$transaction(
      async (tx) => {
        const employments = await tx.hrEmployment.findMany({ where: { legalEntityId: sourceId } });
        for (const employment of employments) {
          const existing = await tx.hrEmployment.findUnique({
            where: {
              employeeId_legalEntityId_validFrom: {
                employeeId: employment.employeeId,
                legalEntityId: targetLegalEntityId,
                validFrom: employment.validFrom,
              },
            },
          });

          if (existing) {
            await mergeEmploymentRecords(tx, employment.id, existing.id);
            continue;
          }

          try {
            await tx.hrEmployment.update({
              where: { id: employment.id },
              data: { legalEntityId: targetLegalEntityId },
            });
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              const conflict = await tx.hrEmployment.findFirst({
                where: {
                  employeeId: employment.employeeId,
                  legalEntityId: targetLegalEntityId,
                  payGroupId: employment.payGroupId,
                  validFrom: employment.validFrom,
                },
              });
              if (!conflict) throw error;
              await mergeEmploymentRecords(tx, employment.id, conflict.id);
            } else {
              throw error;
            }
          }
        }

        await tx.hrLegalEntity.delete({ where: { id: sourceId } });
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    await hrAuditService.log({
      entityType: 'legal_entity',
      entityId: targetLegalEntityId,
      action: 'deleted',
      userId,
      payload: { sourceId, targetLegalEntityId, sourceCode: source.code },
    });

    logServer('[hr] deleted legal entity with merge', {
      sourceId,
      targetLegalEntityId,
      sourceCode: source.code,
    });
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

  private buildEmployeeSearchWhere(q: string | undefined, deleted: boolean): Prisma.HrEmployeeWhereInput {
    const trimmed = q?.trim();
    const base: Prisma.HrEmployeeWhereInput = {
      deletedAt: deleted ? { not: null } : null,
    };
    if (!trimmed) return base;

    const tokens = trimmed.split(/\s+/).filter((token) => token.length >= 2);
    const orConditions: Prisma.HrEmployeeWhereInput[] = [
      { displayName: { contains: trimmed } },
      { lastName: { contains: trimmed } },
      { firstName: { contains: trimmed } },
      { notes: { contains: trimmed } },
    ];

    if (tokens.length > 1) {
      orConditions.push({
        AND: tokens.map((token) => ({
          OR: [
            { displayName: { contains: token } },
            { lastName: { contains: token } },
            { firstName: { contains: token } },
          ],
        })),
      });
    }

    return { ...base, OR: orConditions };
  }

  async listEmployees(search?: string, includeInactive = true): Promise<HrEmployeeListItemDto[]> {
    const rows = await prisma.hrEmployee.findMany({
      where: {
        ...this.buildEmployeeSearchWhere(search, false),
        ...(includeInactive ? {} : { status: 'active' }),
      },
      include: employeeInclude,
      orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
    });
    return rows.map(toListItem);
  }

  async listArchivedEmployees(search?: string): Promise<HrEmployeeListItemDto[]> {
    const rows = await prisma.hrEmployee.findMany({
      where: this.buildEmployeeSearchWhere(search, true),
      include: employeeInclude,
      orderBy: [{ deletedAt: 'desc' }, { displayName: 'asc' }],
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

  async createEmployee(
    payload: HrEmployeeWritePayload,
    revealCard: boolean,
    userId?: number,
  ): Promise<HrEmployeeDetailDto> {
    if (!payload.personId) throw new HrError('Оберіть фізичну особу');

    let lastName = payload.lastName?.trim() ?? '';
    let firstName = payload.firstName?.trim() ?? '';
    let middleName = payload.middleName?.trim() || null;

    if (!lastName || !firstName) {
      const person = await prisma.hrPerson.findUnique({
        where: { id: payload.personId },
        select: { displayName: true },
      });
      if (!person) throw new HrError('Фізичну особу не знайдено');
      const parsed = parseUaDisplayName(person.displayName);
      lastName = parsed.lastName;
      firstName = parsed.firstName;
      middleName = parsed.middleName;
    }

    if (!lastName || !firstName) throw new HrError('Не вдалося визначити ПІБ з обраної фізичної особи');
    const status = payload.status && isStatus(payload.status) ? payload.status : 'active';
    const card = applyCardUpdate(payload);
    await this.assertUserAvailable(payload.userId ?? null);
    await this.assertPersonAvailable(payload.personId ?? null);

    const created = await prisma.hrEmployee.create({
      data: {
        lastName,
        firstName,
        middleName,
        displayName: buildDisplayName(lastName, firstName, middleName),
        status,
        personId: payload.personId ?? null,
        userId: payload.userId ?? null,
        notes: payload.notes?.trim() || null,
        ...(card ?? {}),
      },
      include: employeeInclude,
    });
    await hrAuditService.log({
      entityType: 'employee',
      entityId: created.id,
      action: 'created',
      userId,
      payload: { displayName: created.displayName },
    });
    logServer('[hr] created employee', { id: created.id });
    return toDetail(created, revealCard);
  }

  async updateEmployee(
    id: number,
    payload: HrEmployeeWritePayload,
    revealCard: boolean,
    userId?: number,
  ): Promise<HrEmployeeDetailDto> {
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
    if (payload.personId !== undefined) {
      await this.assertPersonAvailable(payload.personId, id);
    }

    const updated = await prisma.hrEmployee.update({
      where: { id },
      data: {
        lastName,
        firstName,
        middleName,
        displayName: buildDisplayName(lastName, firstName, middleName),
        status,
        personId: payload.personId === undefined ? existing.personId : payload.personId,
        userId: payload.userId === undefined ? existing.userId : payload.userId,
        notes: payload.notes === undefined ? existing.notes : payload.notes?.trim() || null,
        ...(card ?? {}),
      },
      include: employeeInclude,
    });
    await hrAuditService.log({
      entityType: 'employee',
      entityId: id,
      action: 'updated',
      userId,
    });
    return toDetail(updated, revealCard);
  }

  async deleteEmployee(id: number, userId?: number): Promise<void> {
    const existing = await prisma.hrEmployee.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new HrError('Співробітника не знайдено', 404);

    await prisma.hrEmployee.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'inactive',
      },
    });
    await hrAuditService.log({
      entityType: 'employee',
      entityId: id,
      action: 'deleted',
      userId,
    });
    logServer('[hr] deleted employee', { id });
  }

  async restoreEmployee(id: number, userId?: number): Promise<HrEmployeeListItemDto> {
    const existing = await prisma.hrEmployee.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) throw new HrError('Архівний запис не знайдено', 404);

    const restored = await prisma.hrEmployee.update({
      where: { id },
      data: {
        deletedAt: null,
        status: 'active',
      },
      include: employeeInclude,
    });
    await hrAuditService.log({
      entityType: 'employee',
      entityId: id,
      action: 'restored',
      userId,
    });
    logServer('[hr] restored employee', { id });
    return toListItem(restored);
  }

  async mergeEmployment(fromId: number, toId: number, userId?: number): Promise<void> {
    if (fromId === toId) throw new HrError('Оберіть іншу зайнятість для об\'єднання');
    const [from, to] = await Promise.all([
      prisma.hrEmployment.findUnique({ where: { id: fromId }, include: employmentInclude }),
      prisma.hrEmployment.findUnique({ where: { id: toId }, include: employmentInclude }),
    ]);
    if (!from || !to) throw new HrError('Зайнятість не знайдено', 404);
    if (from.employeeId !== to.employeeId) {
      throw new HrError('Зайнятості належать різним співробітникам');
    }
    if (from.payGroupId !== to.payGroupId) {
      throw new HrError('Об\'єднувати можна лише зайнятості з однаковою групою оплати');
    }

    const mergeStats = await prisma.$transaction(
      async (tx) => mergeEmploymentRecords(tx, fromId, toId),
      { maxWait: 10_000, timeout: 60_000 },
    );

    const toEmploymentLabel = (row: typeof from) => {
      const payGroupSlug = row.payGroup.slug;
      if (!isPayGroup(payGroupSlug)) {
        throw new HrError('Некоректна група оплати');
      }
      return buildEmploymentAuditLabel({
        legalEntityName: row.legalEntity.name,
        payGroupSlug,
        validFrom: row.validFrom.toISOString().slice(0, 10),
        validTo: row.validTo ? row.validTo.toISOString().slice(0, 10) : null,
        personnelNumber: row.personnelNumber,
      });
    };

    await hrAuditService.log({
      entityType: 'employee',
      entityId: from.employeeId,
      action: 'employment_merged',
      userId,
      payload: {
        fromId,
        toId,
        removed: {
          id: fromId,
          label: toEmploymentLabel(from),
          legalEntity: from.legalEntity.name,
          payGroup: from.payGroup.label,
          period: `${from.validFrom.toISOString().slice(0, 10)} – ${from.validTo ? from.validTo.toISOString().slice(0, 10) : 'досі'}`,
          personnelNumber: from.personnelNumber,
        },
        kept: {
          id: toId,
          label: toEmploymentLabel(to),
          legalEntity: to.legalEntity.name,
          payGroup: to.payGroup.label,
          period: `${to.validFrom.toISOString().slice(0, 10)} – ${to.validTo ? to.validTo.toISOString().slice(0, 10) : 'досі'}`,
          personnelNumber: to.personnelNumber,
        },
        transferred: {
          timesheetEntries: mergeStats.timesheetEntriesMoved,
          payrollLines: mergeStats.payrollLinesMoved,
          payTerms: mergeStats.payTermsMoved,
        },
        deletedDuplicates: {
          timesheetEntries: mergeStats.timesheetEntriesDeleted,
          payrollLines: mergeStats.payrollLinesDeleted,
          payTerms: mergeStats.payTermsDeleted,
        },
      },
    });
  }

  async createEmployment(
    employeeId: number,
    payload: HrEmploymentWritePayload,
    userId?: number,
  ): Promise<HrEmploymentDto> {
    await this.requireEmployee(employeeId);
    const data = await this.normalizeEmploymentPayload(payload);
    try {
      const created = await prisma.hrEmployment.create({
        data: { employeeId, ...data },
        include: employmentInclude,
      });
      await hrAuditService.log({
        entityType: 'employment',
        entityId: created.id,
        action: 'created',
        userId,
        payload: { employeeId, payGroupId: created.payGroupId },
      });
      return toEmploymentDto(created);
    } catch (error) {
      this.rethrowUniqueEmployment(error);
      throw error;
    }
  }

  async updateEmployment(
    id: number,
    payload: HrEmploymentWritePayload,
    userId?: number,
  ): Promise<HrEmploymentDto> {
    const existing = await prisma.hrEmployment.findUnique({ where: { id } });
    if (!existing) throw new HrError('Зайнятість не знайдено', 404);
    const data = await this.normalizeEmploymentPayload(payload);
    try {
      const updated = await prisma.hrEmployment.update({
        where: { id },
        data,
        include: employmentInclude,
      });
      await hrAuditService.log({
        entityType: 'employment',
        entityId: id,
        action: 'updated',
        userId,
      });
      return toEmploymentDto(updated);
    } catch (error) {
      this.rethrowUniqueEmployment(error);
      throw error;
    }
  }

  async deleteEmployment(id: number, userId?: number): Promise<void> {
    const existing = await prisma.hrEmployment.findUnique({ where: { id } });
    if (!existing) throw new HrError('Зайнятість не знайдено', 404);
    const hasTimesheet = await prisma.hrTimesheetEntry.count({ where: { employmentId: id } });
    if (hasTimesheet > 0) {
      throw new HrError('Неможливо видалити зайнятість: є записи табеля');
    }
    await prisma.hrEmployment.delete({ where: { id } });
    await hrAuditService.log({
      entityType: 'employment',
      entityId: id,
      action: 'deleted',
      userId,
    });
  }

  async createPayTerms(
    employmentId: number,
    payload: HrPayTermsWritePayload,
    userId?: number,
  ): Promise<HrPayTermsDto> {
    const employment = await prisma.hrEmployment.findUnique({ where: { id: employmentId } });
    if (!employment) throw new HrError('Зайнятість не знайдено', 404);
    const data = this.normalizePayTermsPayload(payload);
    const created = await prisma.$transaction(async (tx) => {
      if (payload.closePrevious) {
        const terms = await tx.hrPayTerms.findMany({ where: { employmentId } });
        const closeDate = new Date(data.effectiveFrom);
        closeDate.setUTCDate(closeDate.getUTCDate() - 1);
        for (const term of terms) {
          const termEnd = term.effectiveTo ?? new Date(Date.UTC(9999, 11, 31));
          const newEnd = data.effectiveTo ?? new Date(Date.UTC(9999, 11, 31));
          if (term.effectiveFrom > newEnd || data.effectiveFrom > termEnd) continue;
          const effectiveTo = closeDate < term.effectiveFrom ? term.effectiveFrom : closeDate;
          await tx.hrPayTerms.update({ where: { id: term.id }, data: { effectiveTo } });
        }
      }
      return tx.hrPayTerms.create({
        data: { employmentId, ...data },
      });
    });
    await hrAuditService.log({
      entityType: 'pay_terms',
      entityId: created.id,
      action: 'created',
      userId,
      payload: { employmentId },
    });
    return toPayTermsDto(created);
  }

  async updatePayTerms(id: number, payload: HrPayTermsWritePayload, userId?: number): Promise<HrPayTermsDto> {
    const existing = await prisma.hrPayTerms.findUnique({ where: { id } });
    if (!existing) throw new HrError('Ставку не знайдено', 404);
    const data = this.normalizePayTermsPayload(payload);
    const updated = await prisma.hrPayTerms.update({ where: { id }, data });
    await hrAuditService.log({
      entityType: 'pay_terms',
      entityId: id,
      action: 'updated',
      userId,
    });
    return toPayTermsDto(updated);
  }

  async deletePayTerms(id: number, userId?: number): Promise<void> {
    const existing = await prisma.hrPayTerms.findUnique({ where: { id } });
    if (!existing) throw new HrError('Ставку не знайдено', 404);
    await prisma.hrPayTerms.delete({ where: { id } });
    await hrAuditService.log({
      entityType: 'pay_terms',
      entityId: id,
      action: 'deleted',
      userId,
    });
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

  private async assertPersonAvailable(personId: number | null, excludeEmployeeId?: number): Promise<void> {
    if (personId == null) return;
    const person = await prisma.hrPerson.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) throw new HrError('Фізичну особу не знайдено');
    const taken = await prisma.hrEmployee.findFirst({
      where: {
        personId,
        deletedAt: null,
        ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
      },
      select: { id: true },
    });
    if (taken) throw new HrError('Цю фізичну особу уже привʼязано до іншого співробітника');
  }

  private async normalizeEmploymentPayload(payload: HrEmploymentWritePayload) {
    if (!isPayGroup(payload.payGroup)) throw new HrError('Невідома група оплати');
    const payGroupId = await hrPayGroupService.resolveId(payload.payGroup);
    const legalEntity = await prisma.hrLegalEntity.findUnique({ where: { id: Number(payload.legalEntityId) } });
    if (!legalEntity || !legalEntity.isActive) throw new HrError('Юрособу не знайдено');
    const validFrom = requireDateOnly(payload.validFrom, 'validFrom');
    const validTo = parseDateOnly(payload.validTo, 'validTo');
    if (validTo && validTo < validFrom) throw new HrError('Дата завершення не може бути раніше початку');
    return {
      legalEntityId: legalEntity.id,
      payGroupId,
      personnelNumber: payload.personnelNumber?.trim() || null,
      officialPosition: payload.officialPosition?.trim() || null,
      unofficialPosition: payload.unofficialPosition?.trim() || null,
      employeeCategory: payload.employeeCategory?.trim() || null,
      benefitCode: payload.benefitCode?.trim() || null,
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
