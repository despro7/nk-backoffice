import { prisma, logServer } from '../../lib/utils.js';
import {
  HR_PAY_GROUPS,
  type HrPayGroup,
  type HrPayGroupDto,
  type HrPayGroupWritePayload,
} from '../../../shared/types/hr.js';
import { hrAuditService } from './HrAuditService.js';
import { HrError } from './HrService.js';

function isPayGroupSlug(value: string): value is HrPayGroup {
  return (HR_PAY_GROUPS as readonly string[]).includes(value);
}

function toDto(row: {
  id: number;
  slug: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  formulaProfile: string;
}): HrPayGroupDto {
  return {
    id: row.id,
    slug: isPayGroupSlug(row.slug) ? row.slug : 'official_salary',
    label: row.label,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    formulaProfile: row.formulaProfile,
  };
}

export class HrPayGroupService {
  async list(includeInactive = false): Promise<HrPayGroupDto[]> {
    const rows = await prisma.hrPayGroup.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toDto);
  }

  async getById(id: number): Promise<HrPayGroupDto | null> {
    const row = await prisma.hrPayGroup.findUnique({ where: { id } });
    return row ? toDto(row) : null;
  }

  async getBySlug(slug: HrPayGroup): Promise<HrPayGroupDto | null> {
    const row = await prisma.hrPayGroup.findUnique({ where: { slug } });
    return row ? toDto(row) : null;
  }

  async resolveId(slugOrId: HrPayGroup | number): Promise<number> {
    if (typeof slugOrId === 'number') return slugOrId;
    const row = await prisma.hrPayGroup.findUnique({ where: { slug: slugOrId } });
    if (!row) throw new HrError(`Групу оплати «${slugOrId}» не знайдено`);
    return row.id;
  }

  async create(payload: HrPayGroupWritePayload, userId?: number): Promise<HrPayGroupDto> {
    const slug = payload.slug?.trim();
    const label = payload.label?.trim();
    if (!slug || !isPayGroupSlug(slug)) throw new HrError('Некоректний slug групи оплати');
    if (!label) throw new HrError('Вкажіть назву групи оплати');
    const formulaProfile = payload.formulaProfile?.trim() || slug;

    const created = await prisma.hrPayGroup.create({
      data: {
        slug,
        label,
        sortOrder: payload.sortOrder ?? 0,
        isActive: payload.isActive ?? true,
        formulaProfile,
      },
    });
    await hrAuditService.log({
      entityType: 'pay_group',
      entityId: created.id,
      action: 'created',
      userId,
      payload: { slug, label },
    });
    logServer('[hr] created pay group', { id: created.id, slug });
    return toDto(created);
  }

  async update(id: number, payload: HrPayGroupWritePayload, userId?: number): Promise<HrPayGroupDto> {
    const existing = await prisma.hrPayGroup.findUnique({ where: { id } });
    if (!existing) throw new HrError('Групу оплати не знайдено', 404);

    const label = payload.label?.trim() ?? existing.label;
    if (!label) throw new HrError('Вкажіть назву групи оплати');

    const updated = await prisma.hrPayGroup.update({
      where: { id },
      data: {
        label,
        sortOrder: payload.sortOrder ?? existing.sortOrder,
        isActive: payload.isActive ?? existing.isActive,
        ...(payload.formulaProfile ? { formulaProfile: payload.formulaProfile } : {}),
      },
    });
    await hrAuditService.log({
      entityType: 'pay_group',
      entityId: id,
      action: 'updated',
      userId,
      payload: { label: updated.label, isActive: updated.isActive },
    });
    return toDto(updated);
  }

  async reorder(ids: number[], userId?: number): Promise<HrPayGroupDto[]> {
    if (ids.length === 0) return this.list(true);
    const rows = await prisma.hrPayGroup.findMany({ select: { id: true } });
    if (ids.length !== rows.length || new Set(ids).size !== ids.length) {
      throw new HrError('Некоректний список груп оплати для сортування');
    }
    const knownIds = new Set(rows.map((row) => row.id));
    if (ids.some((id) => !knownIds.has(id))) {
      throw new HrError('Некоректний список груп оплати для сортування');
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.hrPayGroup.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    await hrAuditService.log({
      entityType: 'pay_group',
      entityId: ids[0],
      action: 'reordered',
      userId,
      payload: { ids },
    });
    return this.list(true);
  }

  async deactivate(id: number, userId?: number): Promise<void> {
    const existing = await prisma.hrPayGroup.findUnique({ where: { id } });
    if (!existing) throw new HrError('Групу оплати не знайдено', 404);

    const hasHistory =
      (await prisma.hrTimesheetEntry.count({
        where: { employment: { payGroupId: id } },
      })) > 0 ||
      (await prisma.hrPayrollLine.count({ where: { payGroupId: id } })) > 0;

    if (hasHistory) {
      await prisma.hrPayGroup.update({ where: { id }, data: { isActive: false } });
      await hrAuditService.log({
        entityType: 'pay_group',
        entityId: id,
        action: 'deactivated',
        userId,
      });
      return;
    }

    await prisma.hrPayGroup.delete({ where: { id } });
    await hrAuditService.log({
      entityType: 'pay_group',
      entityId: id,
      action: 'deleted',
      userId,
    });
  }
}

export const hrPayGroupService = new HrPayGroupService();
