import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  HR_PAY_GROUPS,
  type HrPayGroup,
  type HrTaxBase,
  type HrTaxPayer,
  type HrTaxRuleDto,
  type HrTaxRuleWritePayload,
} from '../../../shared/types/hr.js';
import { HrError } from './HrService.js';

export interface TaxRuleCalc {
  code: string;
  label: string;
  rate: number;
  payer: HrTaxPayer;
  base: HrTaxBase;
  sortOrder: number;
}

function isPayGroup(value: string): value is HrPayGroup {
  return (HR_PAY_GROUPS as readonly string[]).includes(value);
}

function isPayer(value: string): value is HrTaxPayer {
  return value === 'employer' || value === 'employee';
}

function isBase(value: string): value is HrTaxBase {
  return value === 'gross' || value === 'accrued';
}

function parsePayGroups(raw: Prisma.JsonValue): HrPayGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is HrPayGroup => typeof item === 'string' && isPayGroup(item));
}

function toDto(row: {
  id: number;
  code: string;
  label: string;
  rate: Prisma.Decimal;
  payer: string;
  base: string;
  payGroups: Prisma.JsonValue;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sortOrder: number;
  isActive: boolean;
}): HrTaxRuleDto {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    rate: row.rate.toFixed(6),
    payer: isPayer(row.payer) ? row.payer : 'employee',
    base: isBase(row.base) ? row.base : 'gross',
    payGroups: parsePayGroups(row.payGroups),
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function utcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export class HrTaxRuleService {
  async list(includeInactive = false): Promise<HrTaxRuleDto[]> {
    const rows = await prisma.hrTaxRule.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map(toDto);
  }

  async getActiveForDate(payGroup: HrPayGroup, date: Date): Promise<TaxRuleCalc[]> {
    const rows = await prisma.hrTaxRule.findMany({
      where: {
        isActive: true,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows
      .filter((row) => parsePayGroups(row.payGroups).includes(payGroup))
      .map((row) => ({
        code: row.code,
        label: row.label,
        rate: Number(row.rate),
        payer: isPayer(row.payer) ? row.payer : 'employee',
        base: isBase(row.base) ? row.base : 'gross',
        sortOrder: row.sortOrder,
      }));
  }

  async create(payload: HrTaxRuleWritePayload): Promise<HrTaxRuleDto> {
    const code = payload.code?.trim();
    const label = payload.label?.trim();
    if (!code) throw new HrError('Вкажіть код правила');
    if (!label) throw new HrError('Вкажіть назву правила');
    if (!payload.rate) throw new HrError('Вкажіть ставку');
    if (!payload.payer || !isPayer(payload.payer)) throw new HrError('Некоректний платник');
    if (!payload.base || !isBase(payload.base)) throw new HrError('Некоректна база');
    if (!payload.effectiveFrom) throw new HrError('Вкажіть дату початку дії');

    const created = await prisma.hrTaxRule.create({
      data: {
        code,
        label,
        rate: new Prisma.Decimal(payload.rate),
        payer: payload.payer,
        base: payload.base,
        payGroups: (payload.payGroups ?? ['official_salary']) as unknown as Prisma.InputJsonValue,
        effectiveFrom: utcDate(payload.effectiveFrom),
        effectiveTo: payload.effectiveTo ? utcDate(payload.effectiveTo) : null,
        sortOrder: payload.sortOrder ?? 0,
        isActive: payload.isActive ?? true,
      },
    });
    logServer('[hr] created tax rule', { id: created.id, code });
    return toDto(created);
  }

  async update(id: number, payload: HrTaxRuleWritePayload): Promise<HrTaxRuleDto> {
    const existing = await prisma.hrTaxRule.findUnique({ where: { id } });
    if (!existing) throw new HrError('Правило не знайдено', 404);

    const updated = await prisma.hrTaxRule.update({
      where: { id },
      data: {
        ...(payload.label ? { label: payload.label.trim() } : {}),
        ...(payload.rate ? { rate: new Prisma.Decimal(payload.rate) } : {}),
        ...(payload.payer && isPayer(payload.payer) ? { payer: payload.payer } : {}),
        ...(payload.base && isBase(payload.base) ? { base: payload.base } : {}),
        ...(payload.payGroups ? { payGroups: payload.payGroups as unknown as Prisma.InputJsonValue } : {}),
        ...(payload.effectiveFrom ? { effectiveFrom: utcDate(payload.effectiveFrom) } : {}),
        ...(payload.effectiveTo !== undefined
          ? { effectiveTo: payload.effectiveTo ? utcDate(payload.effectiveTo) : null }
          : {}),
        ...(payload.sortOrder !== undefined ? { sortOrder: payload.sortOrder } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
    });
    return toDto(updated);
  }

  async deactivate(id: number): Promise<void> {
    const existing = await prisma.hrTaxRule.findUnique({ where: { id } });
    if (!existing) throw new HrError('Правило не знайдено', 404);
    await prisma.hrTaxRule.update({ where: { id }, data: { isActive: false } });
  }
}

export const hrTaxRuleService = new HrTaxRuleService();
