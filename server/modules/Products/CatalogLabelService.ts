/**
 * Чернетки та опубліковані версії наліпок (pdfme, 100×100 мм).
 */

import fs from 'fs/promises';
import path from 'path';
import type { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import type {
  ProductLabelDraftDto,
  ProductLabelKind,
  ProductLabelPublishedDto,
} from '../../../shared/types/productLabel.js';
import type { ProductLabelHistoryEntry } from '../../../shared/utils/productLabelHistory.js';
import type { ProductLabelPayloadV2 } from '../../../shared/types/labelTemplate.js';
import { LABEL_INPUTS_SCHEMA_VERSION } from '../../../shared/constants/labelInputKeys.js';
import { isProductLabelKind, parseProductLabelPayload } from '../../../shared/utils/productLabel.js';
import {
  diffLabelOverrides,
  getLabelNutritionErrors,
  isPayloadV2,
  mergeLabelOverrides,
  v1PayloadToInputs,
  withAutoEnergy,
} from '../../../shared/utils/labelInputs.js';
import { CATALOG_ACC_POLICY_KIT } from '../../../shared/types/catalog.js';
import { applyLabelOverrides, resolveLabelBaseInputs } from './LabelInputResolver.js';
import { labelTemplateService } from './LabelTemplateService.js';
import { generateLabelPdfBuffer } from './pdfme/labelPdfmeRuntime.js';
import type { LabelInputMap } from '../../../shared/constants/labelInputKeys.js';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads', 'catalog-labels');

function labelsDir(goodId: string): string {
  return path.join(UPLOADS_ROOT, goodId);
}

function labelPdfPath(goodId: string, fileName: string): string {
  return path.join(labelsDir(goodId), fileName);
}

async function ensureLabelsDir(goodId: string): Promise<void> {
  await fs.mkdir(labelsDir(goodId), { recursive: true });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readStored(
  raw: unknown,
  base: LabelInputMap,
): ProductLabelPayloadV2 | null {
  if (isPayloadV2(raw)) {
    const inputs = mergeLabelOverrides(base, raw.overrides);
    return {
      version: LABEL_INPUTS_SCHEMA_VERSION,
      templateId: raw.templateId ?? null,
      inputs,
      overrides: raw.overrides ?? {},
      nutritionEnergyManual: Boolean(raw.nutritionEnergyManual),
    };
  }
  const legacy = parseProductLabelPayload(raw);
  if (!legacy) return null;
  const legacyInputs = v1PayloadToInputs(legacy);
  const overrides = diffLabelOverrides(base, legacyInputs);
  return {
    version: LABEL_INPUTS_SCHEMA_VERSION,
    templateId: null,
    inputs: mergeLabelOverrides(base, overrides),
    overrides,
    nutritionEnergyManual: Boolean(legacy.nutritionEnergyManual),
  };
}

function buildPdfFileName(labelKind: ProductLabelKind, version: number, batchId: string): string {
  const shortBatch = batchId.slice(-8);
  return `label-${labelKind}-v${version}-${shortBatch}-${Date.now()}.pdf`;
}

export class CatalogLabelService {
  async getDraft(
    goodId: string,
    batchId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelDraftDto | null> {
    const row = await prisma.catalogProductLabelDraft.findUnique({
      where: { goodId_batchId_labelKind: { goodId, batchId, labelKind } },
      include: { user: { select: { name: true } } },
    });
    if (!row) return null;
    const baseInputs = await resolveLabelBaseInputs({
      goodId,
      batchId,
      batchNumber: row.batchNumber,
      labelKind: row.labelKind as ProductLabelKind,
    });
    const payload = readStored(row.payloadJson, baseInputs);
    if (!payload) return null;
    if (!payload.templateId) {
      const resolved = await labelTemplateService.resolveForGood(goodId, labelKind);
      payload.templateId = resolved.templateId;
    }
    return {
      goodId: row.goodId,
      batchId: row.batchId,
      labelKind: row.labelKind as ProductLabelKind,
      batchNumber: row.batchNumber,
      payload,
      baseInputs,
      updatedBy: row.updatedBy,
      updatedByName: row.user?.name ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Остання збережена чернетка для товару (будь-яка партія). */
  async getLatestDraft(
    goodId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelDraftDto | null> {
    const row = await prisma.catalogProductLabelDraft.findFirst({
      where: { goodId, labelKind },
      orderBy: { updatedAt: 'desc' },
      select: { batchId: true },
    });
    if (!row) return null;
    return this.getDraft(goodId, row.batchId, labelKind);
  }

  async listHistory(
    goodId: string,
    batchId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelHistoryEntry[]> {
    const draft = await this.getDraft(goodId, batchId, labelKind);
    const published = await this.listPublished(goodId, batchId, labelKind);
    const entries: ProductLabelHistoryEntry[] = [];
    if (draft) entries.push({ entryType: 'draft', ...draft });
    for (const row of published) {
      entries.push({ entryType: 'published', ...row });
    }
    return entries;
  }

  async saveDraft(
    goodId: string,
    input: {
      batchId: string;
      labelKind: ProductLabelKind;
      batchNumber: string;
      payload: ProductLabelPayloadV2;
      expiration?: string | null;
      updatedBy?: number | null;
    },
  ): Promise<ProductLabelDraftDto> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true },
    });
    if (!good || good.isGroup) throw new Error('Товар не знайдено');

    const baseInputs = await resolveLabelBaseInputs({
      goodId,
      batchId: input.batchId,
      batchNumber: input.batchNumber,
      expiration: input.expiration,
      labelKind: input.labelKind,
    });
    const overrides = input.payload.overrides ?? {};
    const merged = withAutoEnergy(
      applyLabelOverrides(baseInputs, overrides),
      Boolean(input.payload.nutritionEnergyManual),
    );
    const resolved = input.payload.templateId
      ? { templateId: input.payload.templateId }
      : await labelTemplateService.resolveForGood(goodId, input.labelKind);
    const payload: ProductLabelPayloadV2 = {
      version: LABEL_INPUTS_SCHEMA_VERSION,
      templateId: resolved.templateId,
      overrides,
      inputs: merged,
      nutritionEnergyManual: Boolean(input.payload.nutritionEnergyManual),
    };

    await prisma.catalogProductLabelDraft.deleteMany({
      where: {
        goodId,
        labelKind: input.labelKind,
        NOT: { batchId: input.batchId },
      },
    });

    const row = await prisma.catalogProductLabelDraft.upsert({
      where: {
        goodId_batchId_labelKind: {
          goodId,
          batchId: input.batchId,
          labelKind: input.labelKind,
        },
      },
      create: {
        goodId,
        batchId: input.batchId,
        labelKind: input.labelKind,
        batchNumber: input.batchNumber,
        payloadJson: toJson(payload),
        updatedBy: input.updatedBy ?? null,
      },
      update: {
        batchNumber: input.batchNumber,
        payloadJson: toJson(payload),
        updatedBy: input.updatedBy ?? null,
      },
      include: { user: { select: { name: true } } },
    });

    return {
      goodId,
      batchId: input.batchId,
      labelKind: input.labelKind,
      batchNumber: input.batchNumber,
      payload,
      baseInputs,
      updatedBy: row.updatedBy,
      updatedByName: row.user?.name ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listPublished(
    goodId: string,
    batchId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelPublishedDto[]> {
    const rows = await prisma.catalogProductLabel.findMany({
      where: { goodId, batchId, labelKind },
      orderBy: { version: 'desc' },
      include: { user: { select: { name: true } } },
    });
    return rows.flatMap((row) => {
      const dto = this.toPublished(row);
      return dto ? [dto] : [];
    });
  }

  async getLatestPublished(
    goodId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelPublishedDto | null> {
    const row = await prisma.catalogProductLabel.findFirst({
      where: { goodId, labelKind },
      orderBy: { publishedAt: 'desc' },
      include: { user: { select: { name: true } } },
    });
    if (!row) return null;
    return this.toPublished(row);
  }

  private toPublished(row: {
    id: number;
    goodId: string;
    batchId: string;
    labelKind: string;
    batchNumber: string;
    version: number;
    barcode: string;
    pdfFileName: string;
    payloadJson: unknown;
    publishedBy: number | null;
    publishedAt: Date;
    user?: { name: string | null } | null;
  }): ProductLabelPublishedDto | null {
    if (!isPayloadV2(row.payloadJson)) {
      const legacy = parseProductLabelPayload(row.payloadJson);
      if (!legacy) return null;
      const inputs = v1PayloadToInputs(legacy);
      return {
        id: row.id,
        goodId: row.goodId,
        batchId: row.batchId,
        labelKind: row.labelKind as ProductLabelKind,
        batchNumber: row.batchNumber,
        version: row.version,
        barcode: row.barcode,
        pdfFileName: row.pdfFileName,
        payload: {
          version: LABEL_INPUTS_SCHEMA_VERSION,
          templateId: null,
          inputs,
          overrides: inputs,
          nutritionEnergyManual: Boolean(legacy.nutritionEnergyManual),
        },
        publishedBy: row.publishedBy,
        publishedByName: row.user?.name ?? null,
        publishedAt: row.publishedAt.toISOString(),
      };
    }
    return {
      id: row.id,
      goodId: row.goodId,
      batchId: row.batchId,
      labelKind: row.labelKind as ProductLabelKind,
      batchNumber: row.batchNumber,
      version: row.version,
      barcode: row.barcode,
      pdfFileName: row.pdfFileName,
      payload: row.payloadJson,
      publishedBy: row.publishedBy,
      publishedByName: row.user?.name ?? null,
      publishedAt: row.publishedAt.toISOString(),
    };
  }

  async deletePublished(goodId: string, labelId: number): Promise<void> {
    const row = await prisma.catalogProductLabel.findUnique({ where: { id: labelId } });
    if (!row || row.goodId !== goodId) throw new Error('Версію наліпки не знайдено');
    try {
      await fs.unlink(labelPdfPath(row.goodId, row.pdfFileName));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logServer(`[CatalogLabel] PDF unlink failed for ${labelId}: ${msg}`);
    }
    await prisma.catalogProductLabel.delete({ where: { id: labelId } });
  }

  private async renderStored(payload: ProductLabelPayloadV2): Promise<Buffer> {
    if (!payload.templateId) throw new Error('У версії немає шаблону');
    const template = await labelTemplateService.get(payload.templateId);
    const inputs = mergeLabelOverrides(
      payload.inputs as LabelInputMap,
      payload.overrides,
    );
    return generateLabelPdfBuffer(template.template as never, inputs);
  }

  async getPublishedPdfBuffer(labelId: number): Promise<{ buffer: Buffer; fileName: string }> {
    const row = await prisma.catalogProductLabel.findUnique({ where: { id: labelId } });
    if (!row) throw new Error('Версію наліпки не знайдено');
    const abs = labelPdfPath(row.goodId, row.pdfFileName);
    try {
      const buffer = await fs.readFile(abs);
      return { buffer, fileName: row.pdfFileName };
    } catch {
      const published = this.toPublished(row);
      if (!published) throw new Error('PDF файл не знайдено');
      logServer(`[CatalogLabel] PDF missing for ${labelId}, regenerating`);
      await ensureLabelsDir(row.goodId);
      const pdfBuffer = await this.renderStored(published.payload);
      await fs.writeFile(abs, pdfBuffer);
      return { buffer: pdfBuffer, fileName: row.pdfFileName };
    }
  }

  async generatePublished(
    goodId: string,
    payload: ProductLabelPayloadV2,
    publishedBy: number | null,
    batch: { batchId: string; batchNumber: string; labelKind: ProductLabelKind },
  ): Promise<ProductLabelPublishedDto> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true, accPolicyId: true },
    });
    if (!good || good.isGroup) throw new Error('Товар не знайдено');
    const audience = good.accPolicyId === CATALOG_ACC_POLICY_KIT ? 'kit' : 'good';

    const baseInputs = await resolveLabelBaseInputs({
      goodId,
      batchId: batch.batchId,
      batchNumber: batch.batchNumber,
      labelKind: batch.labelKind,
    });
    const inputs = withAutoEnergy(
      applyLabelOverrides(baseInputs, payload.overrides),
      Boolean(payload.nutritionEnergyManual),
    );
    const nutritionErrors = getLabelNutritionErrors(inputs, {
      labelKind: batch.labelKind,
      audience,
    });
    if (nutritionErrors.length > 0) {
      throw new Error(`Поживна цінність не заповнена: ${nutritionErrors[0]}`);
    }

    const resolved = payload.templateId
      ? await labelTemplateService.get(payload.templateId)
      : null;
    const fallback = resolved
      ? null
      : await labelTemplateService.resolveForGood(goodId, batch.labelKind);
    const template = resolved?.template ?? fallback?.template;
    const templateId = resolved?.id ?? fallback?.templateId ?? null;
    if (!template || !templateId) {
      throw new Error('Немає шаблону наліпки. Створіть пресет у налаштуваннях.');
    }

    const stored: ProductLabelPayloadV2 = {
      version: LABEL_INPUTS_SCHEMA_VERSION,
      templateId,
      inputs,
      overrides: payload.overrides ?? {},
      nutritionEnergyManual: Boolean(payload.nutritionEnergyManual),
    };

    const last = await prisma.catalogProductLabel.findFirst({
      where: { goodId, batchId: batch.batchId, labelKind: batch.labelKind },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    const pdfFileName = buildPdfFileName(batch.labelKind, version, batch.batchId);
    await ensureLabelsDir(goodId);
    const pdfBuffer = await generateLabelPdfBuffer(template as never, inputs);
    await fs.writeFile(labelPdfPath(goodId, pdfFileName), pdfBuffer);

    const row = await prisma.catalogProductLabel.create({
      data: {
        goodId,
        batchId: batch.batchId,
        labelKind: batch.labelKind,
        batchNumber: batch.batchNumber,
        version,
        barcode: inputs.barcode || '',
        pdfFileName,
        payloadJson: toJson(stored),
        publishedBy,
      },
      include: { user: { select: { name: true } } },
    });
    const dto = this.toPublished(row);
    if (!dto) throw new Error('Некоректний payload опублікованої наліпки');
    return dto;
  }

  async seedDraft(
    goodId: string,
    input: {
      batchId: string;
      labelKind: ProductLabelKind;
      batchNumber: string;
      expiration?: string | null;
      updatedBy?: number | null;
    },
  ): Promise<ProductLabelDraftDto> {
    const resolved = await labelTemplateService.resolveForGood(goodId, input.labelKind);
    return this.saveDraft(goodId, {
      batchId: input.batchId,
      labelKind: input.labelKind,
      batchNumber: input.batchNumber,
      expiration: input.expiration,
      updatedBy: input.updatedBy,
      payload: {
        version: LABEL_INPUTS_SCHEMA_VERSION,
        templateId: resolved.templateId,
        inputs: {},
        overrides: {},
      },
    });
  }

  assertLabelKind(value: string): ProductLabelKind {
    if (!isProductLabelKind(value)) {
      throw new Error('Некоректний labelKind (portion | box)');
    }
    return value;
  }
}

export const catalogLabelService = new CatalogLabelService();
