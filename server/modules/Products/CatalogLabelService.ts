/**
 * Чернетки та опубліковані версії наліпок товару (PDF 100×100 мм).
 */

import fs from 'fs/promises';
import path from 'path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import type {
  ProductLabelDraftDto,
  ProductLabelKind,
  ProductLabelPayload,
  ProductLabelPublishedDto,
} from '../../../shared/types/productLabel.js';
import {
  buildSeedLabelPayload,
  formatLabelExpiryDate,
  isProductLabelKind,
  parseProductLabelPayload,
} from '../../../shared/utils/productLabel.js';
import { isMissingDilovodDate } from '../../../shared/utils/dilovodBatchId.js';
import { getNutritionValidationErrors } from '../../../shared/utils/productLabelNutrition.js';
import { DilovodApiClient } from '../../services/dilovod/DilovodApiClient.js';
import { extractBatchExpirationFromGoodPartHeader } from '../../services/dilovod/DilovodUtils.js';
import { ProductLabelPdfDocument } from './ProductLabelPdfDocument.js';
import { ensureProductLabelPdfFonts } from './productLabelPdfFonts.js';

const dilovodApiClient = new DilovodApiClient();

async function resolveGoodPartExpiration(
  batchId: string,
  hint?: string | null,
): Promise<string | null> {
  const trimmed = hint?.trim();
  if (trimmed && !isMissingDilovodDate(trimmed)) return trimmed;

  try {
    const obj = await dilovodApiClient.getObject(batchId);
    const header =
      obj.header && typeof obj.header === 'object'
        ? (obj.header as Record<string, unknown>)
        : undefined;
    const expiration = extractBatchExpirationFromGoodPartHeader(header);
    if (expiration && !isMissingDilovodDate(expiration)) return expiration;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logServer(`[CatalogLabel] expiration resolve failed for ${batchId}: ${msg}`);
  }

  return trimmed && !isMissingDilovodDate(trimmed) ? trimmed : null;
}

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

function toDraftDto(row: {
  goodId: string;
  batchId: string;
  labelKind: string;
  batchNumber: string;
  payloadJson: unknown;
  updatedAt: Date;
}): ProductLabelDraftDto | null {
  const payload = parseProductLabelPayload(row.payloadJson);
  if (!payload) return null;
  return {
    goodId: row.goodId,
    batchId: row.batchId,
    labelKind: row.labelKind as ProductLabelKind,
    batchNumber: row.batchNumber,
    payload,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublishedDto(row: {
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
  const payload = parseProductLabelPayload(row.payloadJson);
  if (!payload) return null;
  return {
    id: row.id,
    goodId: row.goodId,
    batchId: row.batchId,
    labelKind: row.labelKind as ProductLabelKind,
    batchNumber: row.batchNumber,
    version: row.version,
    barcode: row.barcode,
    pdfFileName: row.pdfFileName,
    payload,
    publishedBy: row.publishedBy,
    publishedByName: row.user?.name ?? null,
    publishedAt: row.publishedAt.toISOString(),
  };
}

async function renderLabelPdf(payload: ProductLabelPayload): Promise<Buffer> {
  ensureProductLabelPdfFonts();
  const doc = React.createElement(ProductLabelPdfDocument, { payload });
  return renderToBuffer(doc as React.ReactElement);
}

function toJsonPayload(payload: ProductLabelPayload): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

function buildPdfFileName(
  labelKind: ProductLabelKind,
  version: number,
  batchId: string,
): string {
  const shortBatch = batchId.slice(-8);
  const ts = Date.now();
  return `label-${labelKind}-v${version}-${shortBatch}-${ts}.pdf`;
}

export class CatalogLabelService {
  async getDraft(
    goodId: string,
    batchId: string,
    labelKind: ProductLabelKind,
  ): Promise<ProductLabelDraftDto | null> {
    const row = await prisma.catalogProductLabelDraft.findUnique({
      where: { goodId_batchId_labelKind: { goodId, batchId, labelKind } },
    });
    if (!row) return null;
    const dto = toDraftDto(row);
    if (!dto) return null;

    if (!dto.payload.expiresAt?.trim()) {
      const expiration = await resolveGoodPartExpiration(batchId, null);
      if (expiration) {
        dto.payload.expiresAt = formatLabelExpiryDate(expiration);
      }
    }

    return dto;
  }

  async saveDraft(
    goodId: string,
    input: {
      batchId: string;
      labelKind: ProductLabelKind;
      batchNumber: string;
      payload: ProductLabelPayload;
    },
  ): Promise<ProductLabelDraftDto> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true },
    });
    if (!good || good.isGroup) {
      throw new Error('Товар не знайдено');
    }

    const payload: ProductLabelPayload = {
      ...input.payload,
      labelKind: input.labelKind,
      batchId: input.batchId,
      batchNumber: input.batchNumber,
    };

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
        payloadJson: toJsonPayload(payload),
      },
      update: {
        batchNumber: input.batchNumber,
        payloadJson: toJsonPayload(payload),
      },
    });

    const dto = toDraftDto(row);
    if (!dto) throw new Error('Некоректний payload чернетки');
    return dto;
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
    return rows
      .map((row) => toPublishedDto(row))
      .filter((row): row is ProductLabelPublishedDto => row != null);
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
    return toPublishedDto(row);
  }

  async deletePublished(goodId: string, labelId: number): Promise<void> {
    const row = await prisma.catalogProductLabel.findUnique({ where: { id: labelId } });
    if (!row || row.goodId !== goodId) {
      throw new Error('Версію наліпки не знайдено');
    }

    const abs = labelPdfPath(row.goodId, row.pdfFileName);
    try {
      await fs.unlink(abs);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logServer(`[CatalogLabel] PDF unlink failed for ${labelId}: ${msg}`);
    }

    await prisma.catalogProductLabel.delete({ where: { id: labelId } });
  }

  async getPublishedPdfBuffer(labelId: number): Promise<{ buffer: Buffer; fileName: string }> {
    const row = await prisma.catalogProductLabel.findUnique({ where: { id: labelId } });
    if (!row) throw new Error('Версію наліпки не знайдено');

    const abs = labelPdfPath(row.goodId, row.pdfFileName);
    try {
      const buffer = await fs.readFile(abs);
      return { buffer, fileName: row.pdfFileName };
    } catch {
      const payload = parseProductLabelPayload(row.payloadJson);
      if (!payload) {
        throw new Error('PDF файл не знайдено');
      }

      logServer(
        `[CatalogLabel] PDF missing on disk for label ${labelId} (${row.pdfFileName}), regenerating from payload`,
      );
      await ensureLabelsDir(row.goodId);
      const pdfBuffer = await renderLabelPdf(payload);
      await fs.writeFile(abs, pdfBuffer);
      return { buffer: pdfBuffer, fileName: row.pdfFileName };
    }
  }

  async generatePublished(
    goodId: string,
    payload: ProductLabelPayload,
    publishedBy: number | null,
  ): Promise<ProductLabelPublishedDto> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true },
    });
    if (!good || good.isGroup) {
      throw new Error('Товар не знайдено');
    }

    const nutritionErrors = getNutritionValidationErrors(payload.nutritionText);
    if (nutritionErrors.length > 0) {
      throw new Error(`Поживна цінність не заповнена: ${nutritionErrors[0]}`);
    }

    const labelKind = payload.labelKind;
    const batchId = payload.batchId;
    const batchNumber = payload.batchNumber;

    const last = await prisma.catalogProductLabel.findFirst({
      where: { goodId, batchId, labelKind },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    const pdfFileName = buildPdfFileName(labelKind, version, batchId);

    await ensureLabelsDir(goodId);
    const pdfBuffer = await renderLabelPdf(payload);
    await fs.writeFile(labelPdfPath(goodId, pdfFileName), pdfBuffer);

    const row = await prisma.catalogProductLabel.create({
      data: {
        goodId,
        batchId,
        labelKind,
        batchNumber,
        version,
        barcode: payload.barcode,
        pdfFileName,
        payloadJson: toJsonPayload(payload),
        publishedBy,
      },
    });

    const dto = toPublishedDto(row);
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
    },
  ): Promise<ProductLabelDraftDto> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      include: {
        components: { orderBy: { rowNum: 'asc' } },
        barcodes: true,
      },
    });
    if (!good || good.isGroup) {
      throw new Error('Товар не знайдено');
    }

    const componentIds = good.components.map((c) => c.componentGoodId);
    const componentGoods =
      componentIds.length > 0
        ? await prisma.catalogGood.findMany({
            where: { id: { in: componentIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(componentGoods.map((g) => [g.id, g.name]));

    const ingredients = good.components.map((c) => ({
      componentName: nameById.get(c.componentGoodId) || c.componentGoodId,
      qty: c.qty,
    }));

    const batchBarcode = good.barcodes.find(
      (b) => b.activity && b.goodPart === input.batchId,
    );
    const defaultBarcode = good.barcodes.find(
      (b) => b.activity && (!b.goodPart || b.goodPart === ''),
    );
    const barcode = batchBarcode?.code || defaultBarcode?.code || '';
    const expiration = await resolveGoodPartExpiration(input.batchId, input.expiration);

    const payload = buildSeedLabelPayload({
      labelKind: input.labelKind,
      batchId: input.batchId,
      batchNumber: input.batchNumber,
      barcode,
      name: good.name,
      printName: good.printName,
      weightKg: good.weight,
      ingredients,
      expiration,
    });

    return this.saveDraft(goodId, {
      batchId: input.batchId,
      labelKind: input.labelKind,
      batchNumber: input.batchNumber,
      payload,
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
