/**
 * CRUD master-шаблонів наліпок (pdfme) і матриця дефолтів.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import { CATALOG_ACC_POLICY_KIT } from '../../../shared/types/catalog.js';
import type { ProductLabelKind } from '../../../shared/types/productLabel.js';
import { isProductLabelKind } from '../../../shared/utils/productLabel.js';
import type {
  LabelPdfmeTemplate,
  LabelTemplateAudience,
  LabelTemplateDefaults,
  LabelTemplateDetailDto,
  LabelTemplateDto,
  LabelTemplateGoodOverrideLink,
  ResolvedLabelTemplateDto,
} from '../../../shared/types/labelTemplate.js';
import { upgradeLabelTemplatePlaceholders } from '../../../shared/pdfme/upgradeLabelTemplatePlaceholders.js';
import { assertTemplateSchemaNames } from '../../../shared/pdfme/validateTemplateSchemaNames.js';
import {
  buildBoxLabelTemplate,
  buildPortionLabelTemplate,
} from '../../../shared/pdfme/builtInLabelTemplates.js';
import { generateLabelPdfBuffer } from './pdfme/labelPdfmeRuntime.js';
import {
  DEFAULT_LABEL_TEMPLATE_ICON,
  isLabelTemplateIconKey,
} from '../../../shared/constants/labelTemplateIcons.js';
import {
  isLabelTemplateSlotEnabled,
  labelTemplateDefaultSlots,
  labelTemplateKindsForAudience,
  sanitizeLabelTemplateDefaults,
} from '../../../shared/utils/labelTemplateDefaults.js';

const AUDIENCES: LabelTemplateAudience[] = ['good', 'kit'];

function isAudience(value: string): value is LabelTemplateAudience {
  return value === 'good' || value === 'kit';
}

function assertAudience(value: string): LabelTemplateAudience {
  if (!isAudience(value)) throw new Error('Некоректна аудиторія (good | kit)');
  return value;
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return base || `label-${Date.now()}`;
}

function parseIconKey(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const value = String(raw);
  if (!isLabelTemplateIconKey(value)) {
    throw new Error('Некоректна іконка шаблону');
  }
  return value;
}

function parseTemplate(raw: unknown): LabelPdfmeTemplate {
  if (!raw || typeof raw !== 'object') throw new Error('templateJson порожній');
  const template = upgradeLabelTemplatePlaceholders(raw as LabelPdfmeTemplate);
  if (!Array.isArray(template.schemas)) throw new Error('У шаблоні немає schemas');
  assertTemplateSchemaNames(template);
  return template;
}

function toDto(row: {
  id: string;
  slug: string;
  name: string;
  iconKey: string | null;
  labelKind: string;
  audience: string;
  isArchived: boolean;
  isDeletionLocked: boolean;
  schemaVersion: number;
  updatedAt: Date;
  updatedBy: number | null;
}): LabelTemplateDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    iconKey: row.iconKey,
    labelKind: row.labelKind as ProductLabelKind,
    audience: row.audience as LabelTemplateAudience,
    isArchived: row.isArchived,
    isDeletionLocked: row.isDeletionLocked,
    schemaVersion: row.schemaVersion,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export class LabelTemplateService {
  async ensureBuiltInTemplates(): Promise<void> {
    const count = await prisma.catalogLabelTemplate.count();
    if (count > 0) return;

    const portion = parseTemplate(buildPortionLabelTemplate());
    const box = parseTemplate(buildBoxLabelTemplate());
    const created: Record<string, string> = {};

    for (const audience of AUDIENCES) {
      for (const labelKind of labelTemplateKindsForAudience(audience)) {
        const template = labelKind === 'portion' ? portion : box;
        const name = labelKind === 'portion' ? 'Порція' : 'Коробка';
        const row = await prisma.catalogLabelTemplate.create({
          data: {
            slug: `${labelKind}-${audience}`,
            name: `${name} (${audience === 'kit' ? 'комплекти' : 'продукція'})`,
            labelKind,
            audience,
            templateJson: template as unknown as Prisma.InputJsonValue,
            basePdfMeta: { widthMm: 100, heightMm: 100 },
            schemaVersion: 1,
            isDeletionLocked: true,
            iconKey: labelKind === 'box' ? 'package' : 'scan-line',
          },
        });
        created[`${audience}:${labelKind}`] = row.id;
      }
    }

    await prisma.catalogLabelTemplateDefault.createMany({
      data: labelTemplateDefaultSlots().map(({ audience, labelKind }) => ({
        audience,
        labelKind,
        templateId: created[`${audience}:${labelKind}`],
      })),
    });
    await this.retireKitBoxLabelSlot();
  }

  /** Комплекти без коробкових наліпок: прибрати дефолт і заархівувати застарілий пресет. */
  private async retireKitBoxLabelSlot(): Promise<void> {
    await prisma.catalogLabelTemplateDefault.deleteMany({
      where: { audience: 'kit', labelKind: 'box' },
    });
    await prisma.catalogLabelTemplate.updateMany({
      where: { slug: 'box-kit' },
      data: { isArchived: true },
    });
  }

  /** Оновлює чотири стартові пресети до макету v2 (координати оригінальної наліпки). */
  private async upgradeBuiltInLayouts(): Promise<void> {
    const portion = parseTemplate(buildPortionLabelTemplate());
    const box = parseTemplate(buildBoxLabelTemplate());
    const rows = await prisma.catalogLabelTemplate.findMany({
      where: {
        slug: { in: ['portion-good', 'portion-kit', 'box-good', 'box-kit'] },
        schemaVersion: { lt: 2 },
      },
    });
    for (const row of rows) {
      const template = row.labelKind === 'box' ? box : portion;
      await prisma.catalogLabelTemplate.update({
        where: { id: row.id },
        data: {
          templateJson: template as unknown as Prisma.InputJsonValue,
          schemaVersion: 2,
        },
      });
    }
  }

  async list(filter: {
    audience?: string;
    labelKind?: string;
    includeArchived?: boolean;
  }): Promise<LabelTemplateDto[]> {
    await this.ensureBuiltInTemplates();
    await this.retireKitBoxLabelSlot();
    await this.upgradeBuiltInLayouts();
    const rows = await prisma.catalogLabelTemplate.findMany({
      where: {
        ...(filter.audience ? { audience: assertAudience(filter.audience) } : {}),
        ...(filter.labelKind ? { labelKind: filter.labelKind } : {}),
        ...(filter.includeArchived ? {} : { isArchived: false }),
      },
      orderBy: [{ audience: 'asc' }, { labelKind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  }

  async get(id: string): Promise<LabelTemplateDetailDto> {
    const row = await prisma.catalogLabelTemplate.findUnique({ where: { id } });
    if (!row) throw new Error('Шаблон не знайдено');
    return {
      ...toDto(row),
      template: row.templateJson as unknown as LabelPdfmeTemplate,
      basePdfMeta: row.basePdfMeta,
    };
  }

  async create(
    input: {
      name: string;
      labelKind: string;
      audience: string;
      template: unknown;
      isDeletionLocked?: boolean;
      iconKey?: string | null;
    },
    updatedBy: number | null,
  ): Promise<LabelTemplateDetailDto> {
    if (!isProductLabelKind(input.labelKind)) throw new Error('Некоректний labelKind');
    const audience = assertAudience(input.audience);
    if (!isLabelTemplateSlotEnabled(audience, input.labelKind)) {
      throw new Error('Для комплектів доступна лише наліпка порції');
    }
    const template = parseTemplate(input.template);
    const iconKey =
      input.iconKey !== undefined ? parseIconKey(input.iconKey) : DEFAULT_LABEL_TEMPLATE_ICON;
    const slugBase = slugify(input.name);
    const slug = `${slugBase}-${Date.now().toString(36)}`;
    const row = await prisma.catalogLabelTemplate.create({
      data: {
        slug,
        name: input.name.trim() || 'Новий шаблон',
        iconKey,
        labelKind: input.labelKind,
        audience: assertAudience(input.audience),
        templateJson: template as unknown as Prisma.InputJsonValue,
        basePdfMeta: { widthMm: 100, heightMm: 100 },
        ...(input.isDeletionLocked != null ? { isDeletionLocked: input.isDeletionLocked } : {}),
        updatedBy,
      },
    });
    return this.get(row.id);
  }

  async update(
    id: string,
    input: {
      name?: string;
      labelKind?: string;
      audience?: string;
      template?: unknown;
      isDeletionLocked?: boolean;
      iconKey?: string | null;
    },
    updatedBy: number | null,
  ): Promise<LabelTemplateDetailDto> {
    const existing = await prisma.catalogLabelTemplate.findUnique({ where: { id } });
    if (!existing) throw new Error('Шаблон не знайдено');
    const template = input.template != null ? parseTemplate(input.template) : undefined;
    const iconKey = input.iconKey !== undefined ? parseIconKey(input.iconKey) : undefined;
    if (input.labelKind && !isProductLabelKind(input.labelKind)) {
      throw new Error('Некоректний labelKind');
    }
    const nextAudience = input.audience ? assertAudience(input.audience) : existing.audience;
    const nextLabelKind = (input.labelKind ?? existing.labelKind) as ProductLabelKind;
    if (!isLabelTemplateSlotEnabled(nextAudience as LabelTemplateAudience, nextLabelKind)) {
      throw new Error('Для комплектів доступна лише наліпка порції');
    }
    await prisma.catalogLabelTemplate.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(iconKey !== undefined ? { iconKey } : {}),
        ...(input.labelKind ? { labelKind: input.labelKind } : {}),
        ...(input.audience ? { audience: assertAudience(input.audience) } : {}),
        ...(template ? { templateJson: template as unknown as Prisma.InputJsonValue } : {}),
        ...(input.isDeletionLocked != null ? { isDeletionLocked: input.isDeletionLocked } : {}),
        updatedBy,
      },
    });
    return this.get(id);
  }

  async duplicate(id: string, updatedBy: number | null): Promise<LabelTemplateDetailDto> {
    const source = await this.get(id);
    return this.create(
      {
        name: `${source.name} (копія)`,
        labelKind: source.labelKind,
        audience: source.audience,
        template: source.template,
        iconKey: source.iconKey,
      },
      updatedBy,
    );
  }

  async listGoodOverrides(templateId: string): Promise<LabelTemplateGoodOverrideLink[]> {
    const template = await prisma.catalogLabelTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new Error('Шаблон не знайдено');

    const goods = await prisma.catalogGood.findMany({
      where: {
        isGroup: false,
        delMark: false,
        OR: [{ portionLabelTemplateId: templateId }, { boxLabelTemplateId: templateId }],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        accPolicyId: true,
        portionLabelTemplateId: true,
        boxLabelTemplateId: true,
      },
      orderBy: { name: 'asc' },
    });

    const links: LabelTemplateGoodOverrideLink[] = [];
    for (const row of goods) {
      const audience: LabelTemplateAudience =
        row.accPolicyId === CATALOG_ACC_POLICY_KIT ? 'kit' : 'good';
      if (row.portionLabelTemplateId === templateId) {
        links.push({
          goodId: row.id,
          name: row.name,
          sku: row.sku,
          audience,
          labelKind: 'portion',
        });
      }
      if (row.boxLabelTemplateId === templateId) {
        links.push({
          goodId: row.id,
          name: row.name,
          sku: row.sku,
          audience,
          labelKind: 'box',
        });
      }
    }
    return links;
  }

  async archive(id: string): Promise<void> {
    const row = await prisma.catalogLabelTemplate.findUnique({ where: { id } });
    if (!row) throw new Error('Шаблон не знайдено');
    if (row.isDeletionLocked) {
      throw new Error('Шаблон захищено від видалення. Спочатку зніміть блокування.');
    }
    const usedDefault = await prisma.catalogLabelTemplateDefault.findFirst({ where: { templateId: id } });
    if (usedDefault) {
      throw new Error('Шаблон є дефолтом. Спочатку оберіть інший дефолт.');
    }
    const goodsCount = await prisma.catalogGood.count({
      where: {
        OR: [{ portionLabelTemplateId: id }, { boxLabelTemplateId: id }],
      },
    });
    if (goodsCount > 0) {
      throw new Error(`Шаблон привʼязано до ${goodsCount} товарів. Спочатку змініть override на картках.`);
    }
    await prisma.catalogLabelTemplate.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  async getDefaults(): Promise<LabelTemplateDefaults> {
    await this.ensureBuiltInTemplates();
    await this.retireKitBoxLabelSlot();
    const rows = await prisma.catalogLabelTemplateDefault.findMany({
      include: { template: true },
    });
    const matrix = {
      good: { portion: null, box: null },
      kit: { portion: null, box: null },
    } as LabelTemplateDefaults;
    for (const row of rows) {
      if (!isAudience(row.audience) || !isProductLabelKind(row.labelKind)) continue;
      if (!isLabelTemplateSlotEnabled(row.audience, row.labelKind)) continue;
      const matches =
        row.template &&
        !row.template.isArchived &&
        row.template.audience === row.audience &&
        row.template.labelKind === row.labelKind;
      if (matches) {
        matrix[row.audience][row.labelKind] = row.templateId;
      } else {
        await prisma.catalogLabelTemplateDefault.deleteMany({
          where: { audience: row.audience, labelKind: row.labelKind },
        });
      }
    }
    return matrix;
  }

  async setDefaults(matrix: LabelTemplateDefaults): Promise<LabelTemplateDefaults> {
    const templates = await this.list({ includeArchived: true });
    const sanitized = sanitizeLabelTemplateDefaults(matrix, templates);

    for (const { audience, labelKind } of labelTemplateDefaultSlots()) {
        const templateId = sanitized[audience]?.[labelKind];
        if (!templateId) {
          await prisma.catalogLabelTemplateDefault.deleteMany({
            where: { audience, labelKind },
          });
          continue;
        }
        const template = await prisma.catalogLabelTemplate.findUnique({ where: { id: templateId } });
        if (!template || template.isArchived) throw new Error('Шаблон дефолту не знайдено');
        if (template.audience !== audience || template.labelKind !== labelKind) {
          throw new Error(`Шаблон «${template.name}» не відповідає ${audience} / ${labelKind}`);
        }
        await prisma.catalogLabelTemplateDefault.upsert({
          where: { audience_labelKind: { audience, labelKind } },
          create: { audience, labelKind, templateId },
          update: { templateId },
        });
    }
    await this.retireKitBoxLabelSlot();
    return this.getDefaults();
  }

  async preview(templateId: string, inputs: Record<string, string>): Promise<Buffer> {
    const detail = await this.get(templateId);
    return generateLabelPdfBuffer(detail.template as never, inputs);
  }

  async resolveForGood(
    goodId: string,
    labelKind: ProductLabelKind,
  ): Promise<ResolvedLabelTemplateDto & { template: LabelPdfmeTemplate | null }> {
    await this.ensureBuiltInTemplates();
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: {
        accPolicyId: true,
        portionLabelTemplateId: true,
        boxLabelTemplateId: true,
      },
    });
    if (!good) throw new Error('Товар не знайдено');
    const audience: LabelTemplateAudience =
      good.accPolicyId === CATALOG_ACC_POLICY_KIT ? 'kit' : 'good';
    if (!isLabelTemplateSlotEnabled(audience, labelKind)) {
      return {
        templateId: null,
        templateName: null,
        source: 'none',
        audience,
        labelKind,
        template: null,
      };
    }
    const overrideId =
      labelKind === 'portion' ? good.portionLabelTemplateId : good.boxLabelTemplateId;
    if (overrideId) {
      const row = await prisma.catalogLabelTemplate.findUnique({ where: { id: overrideId } });
      if (row && !row.isArchived) {
        return {
          templateId: row.id,
          templateName: row.name,
          source: 'override',
          audience,
          labelKind,
          template: row.templateJson as unknown as LabelPdfmeTemplate,
        };
      }
    }
    const fallback = await prisma.catalogLabelTemplateDefault.findUnique({
      where: { audience_labelKind: { audience, labelKind } },
      include: { template: true },
    });
    if (!fallback) {
      return {
        templateId: null,
        templateName: null,
        source: 'none',
        audience,
        labelKind,
        template: null,
      };
    }
    return {
      templateId: fallback.templateId,
      templateName: fallback.template.name,
      source: 'default',
      audience,
      labelKind,
      template: fallback.template.templateJson as unknown as LabelPdfmeTemplate,
    };
  }

  async setGoodOverride(
    goodId: string,
    labelKind: ProductLabelKind,
    templateId: string | null,
  ): Promise<void> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { accPolicyId: true },
    });
    if (!good) throw new Error('Товар не знайдено');
    const audience: LabelTemplateAudience =
      good.accPolicyId === CATALOG_ACC_POLICY_KIT ? 'kit' : 'good';
    if (!isLabelTemplateSlotEnabled(audience, labelKind)) {
      throw new Error('Для комплектів наліпки коробки не застосовуються');
    }
    if (templateId) {
      const template = await prisma.catalogLabelTemplate.findUnique({ where: { id: templateId } });
      if (!template || template.isArchived) throw new Error('Шаблон не знайдено');
      if (template.labelKind !== labelKind) {
        throw new Error('Шаблон належить іншому типу наліпки');
      }
    }
    await prisma.catalogGood.update({
      where: { id: goodId },
      data:
        labelKind === 'portion'
          ? { portionLabelTemplateId: templateId }
          : { boxLabelTemplateId: templateId },
    });
  }
}

export const labelTemplateService = new LabelTemplateService();
