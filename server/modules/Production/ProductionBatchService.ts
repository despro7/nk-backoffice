/**
 * Варки (фаза 3 техкарт): створення з затвердженої версії техкарти, знімок рецепту, планові кількості,
 * зміна плану і скасування до прийому на виробництво. Кроки 2–7 – наступні кроки фази.
 */
import { Prisma, type ProductionBatch } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import {
  PRODUCTION_BATCH_STATUSES,
  type CatalogLossEntry,
  type ProductionBatchCreateInput,
  type ProductionBatchDetailDto,
  type ProductionBatchLineDto,
  type ProductionBatchListItemDto,
  type ProductionBatchSnapshot,
  type ProductionBatchStatus,
  type ProductionBatchUpdatePlanInput,
} from '../../../shared/types/production.js';
import { normalizeLossEntries, resolveCookingLossPercent } from '../../../shared/utils/catalogLoss.js';
import { normalizeQtyFormula } from '../../../shared/utils/catalogQtyFormula.js';
import { normalizeTechCardPayload } from '../../../shared/utils/techCardPayload.js';
import {
  batchNumberPrefix,
  formatBatchNumber,
  normalizeBatchDate,
  planBatchLines,
} from '../../../shared/utils/productionBatchPlan.js';
import { productsCatalogService } from '../Products/ProductsCatalogService.js';
import { productionSettingsService } from './ProductionSettingsService.js';

export class ProductionBatchError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const MAX_PORTIONS = 1_000_000;
/** До прийому на виробництво варку можна скасувати */
const CANCELLABLE: readonly ProductionBatchStatus[] = ['draft', 'issued'];

const BATCH_INCLUDE = {
  good: { select: { name: true, sku: true } },
  lines: { orderBy: { sortOrder: 'asc' } },
  stages: { orderBy: { sortOrder: 'asc' } },
  signatures: { orderBy: { signedAt: 'asc' } },
  events: { orderBy: { at: 'desc' } },
} satisfies Prisma.ProductionBatchInclude;

type BatchWithRelations = Prisma.ProductionBatchGetPayload<{ include: typeof BATCH_INCLUDE }>;

function isStatus(value: unknown): value is ProductionBatchStatus {
  return typeof value === 'string' && (PRODUCTION_BATCH_STATUSES as readonly string[]).includes(value);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function portionsOrThrow(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PORTIONS) {
    throw new ProductionBatchError('План порцій – ціле число від 1');
  }
  return n;
}

function dateOrThrow(value: unknown): string {
  const date = normalizeBatchDate(value);
  if (!date) throw new ProductionBatchError('Вкажіть плановий день варки');
  return date;
}

async function userNames(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((v): v is number => v != null))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

function listItemDto(
  row: ProductionBatch & { good: { name: string; sku: string | null } },
  names: Map<number, string>,
): ProductionBatchListItemDto {
  return {
    id: row.id,
    number: row.number,
    goodId: row.goodId,
    goodName: row.good.name,
    goodSku: row.good.sku,
    plannedPortions: row.plannedPortions,
    plannedDate: dateOnly(row.plannedDate),
    status: isStatus(row.status) ? row.status : 'draft',
    techCardVersion: row.techCardVersion,
    createdByName: row.createdById != null ? names.get(row.createdById) ?? null : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function lineDto(row: BatchWithRelations['lines'][number]): ProductionBatchLineDto {
  return {
    id: row.id,
    kind: row.kind === 'packaging' ? 'packaging' : 'raw',
    goodId: row.goodId,
    rowKey: row.rowKey,
    name: row.name,
    unitName: row.unitName,
    plannedQty: row.plannedQty,
    plannedNetKg: row.plannedNetKg,
    plannedGrossKg: row.plannedGrossKg,
    losses: normalizeLossEntries(row.lossesJson),
    stockRawSnap: row.stockRawSnap,
    stockProdSnap: row.stockProdSnap,
    stockSnapAt: row.stockSnapAt?.toISOString() ?? null,
    stockActual: row.stockActual,
    issuedQty: row.issuedQty,
    issueNote: row.issueNote,
    shortageComment: row.shortageComment,
    consumedQty: row.consumedQty,
    leftoverQty: row.leftoverQty,
    leftoverAction: row.leftoverAction === 'keep_vp' || row.leftoverAction === 'return_sp' ? row.leftoverAction : null,
    note: row.note,
  };
}

class ProductionBatchService {
  async list(filters: { status?: unknown; goodId?: unknown; from?: unknown; to?: unknown } = {}): Promise<
    ProductionBatchListItemDto[]
  > {
    const where: Prisma.ProductionBatchWhereInput = {};
    if (isStatus(filters.status)) where.status = filters.status;
    if (typeof filters.goodId === 'string' && filters.goodId) where.goodId = filters.goodId;
    const from = normalizeBatchDate(filters.from);
    const to = normalizeBatchDate(filters.to);
    if (from || to) {
      where.plannedDate = {
        ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
      };
    }
    const rows = await prisma.productionBatch.findMany({
      where,
      include: { good: { select: { name: true, sku: true } } },
      orderBy: [{ plannedDate: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    const names = await userNames(rows.map((r) => r.createdById));
    return rows.map((r) => listItemDto(r, names));
  }

  /** Остання варка кожного товару (список техкарт). */
  async lastByGood(goodIds: string[]): Promise<Map<string, { number: string; plannedDate: string; status: ProductionBatchStatus }>> {
    if (goodIds.length === 0) return new Map();
    const rows = await prisma.productionBatch.findMany({
      where: { goodId: { in: goodIds }, status: { not: 'cancelled' } },
      orderBy: [{ plannedDate: 'desc' }, { id: 'desc' }],
      select: { goodId: true, number: true, plannedDate: true, status: true },
    });
    const out = new Map<string, { number: string; plannedDate: string; status: ProductionBatchStatus }>();
    for (const r of rows) {
      if (out.has(r.goodId)) continue;
      out.set(r.goodId, { number: r.number, plannedDate: dateOnly(r.plannedDate), status: isStatus(r.status) ? r.status : 'draft' });
    }
    return out;
  }

  async getDetail(id: number): Promise<ProductionBatchDetailDto> {
    const row = await prisma.productionBatch.findUnique({ where: { id }, include: BATCH_INCLUDE });
    if (!row) throw new ProductionBatchError('Варку не знайдено', 404);
    const names = await userNames([
      row.createdById,
      row.cancelledById,
      ...row.stages.flatMap((s) => [s.startedById, s.finishedById]),
      ...row.signatures.map((s) => s.revokedById),
    ]);
    const snapshot = row.snapshotJson as unknown as ProductionBatchSnapshot;
    return {
      ...listItemDto(row, names),
      specVersion: row.specVersion,
      comment: row.comment,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelledByName: row.cancelledById != null ? names.get(row.cancelledById) ?? null : null,
      cancelReason: row.cancelReason,
      closedAt: row.closedAt?.toISOString() ?? null,
      snapshot: { ...snapshot, payload: normalizeTechCardPayload(snapshot?.payload) },
      lines: row.lines.map(lineDto),
      stages: row.stages.map((s) => ({
        id: s.id,
        stageKey: s.stageKey,
        name: s.name,
        plannedOffsetMin: s.plannedOffsetMin,
        plannedDurationMin: s.plannedDurationMin,
        startedAt: s.startedAt?.toISOString() ?? null,
        startedByName: s.startedById != null ? names.get(s.startedById) ?? null : null,
        finishedAt: s.finishedAt?.toISOString() ?? null,
        finishedByName: s.finishedById != null ? names.get(s.finishedById) ?? null : null,
        actualTemp: s.actualTemp,
        comment: s.comment,
      })),
      signatures: row.signatures.map((s) => ({
        id: s.id,
        step: s.step,
        userName: s.userName,
        roleLabel: s.roleLabel,
        signedAt: s.signedAt.toISOString(),
        revokedAt: s.revokedAt?.toISOString() ?? null,
        revokedByName: s.revokedById != null ? names.get(s.revokedById) ?? null : null,
        revokeComment: s.revokeComment,
      })),
      events: row.events.map((e) => ({
        id: e.id,
        type: e.type,
        userName: e.userName,
        at: e.at.toISOString(),
        payload: (e.payloadJson as Record<string, unknown> | null) ?? null,
      })),
    };
  }

  /** Знімок рецепту з чинної (затвердженої) версії техкарти і специфікації. */
  private async buildSnapshot(goodId: string): Promise<{
    snapshot: ProductionBatchSnapshot;
    techCardVersion: number;
    specVersion: number | null;
  }> {
    const version = await prisma.techCardVersion.findFirst({ where: { goodId }, orderBy: { version: 'desc' } });
    if (!version) throw new ProductionBatchError('У товару немає затвердженої версії техкарти');
    const good = await productsCatalogService.getGoodDetail(goodId, { livePull: false });
    if (!good || good.isGroup) throw new ProductionBatchError('Товар не знайдено', 404);
    const payload = normalizeTechCardPayload(version.payloadJson);
    const settings = await productionSettingsService.getSettings();
    const packagingIds = [...new Set(payload.packaging.map((p) => p.goodId))];
    const packagingGoods = packagingIds.length
      ? await prisma.catalogGood.findMany({
          where: { id: { in: packagingIds } },
          select: { id: true, name: true, mainUnitId: true, weight: true },
        })
      : [];
    const snapshot: ProductionBatchSnapshot = {
      payload,
      specQty: good.specQty != null && good.specQty > 0 ? good.specQty : 1,
      lossFormula: payload.lossFormula ?? settings.lossFormula,
      components: good.components.map((c) => {
        const losses = normalizeLossEntries(c.losses) as CatalogLossEntry[] | null;
        return {
          rowKey: c.rowKey ?? null,
          componentGoodId: c.componentGoodId,
          name: c.componentName || c.componentGoodId,
          note: c.note?.trim() || null,
          qty: Number(c.qty) || 0,
          unitId: c.unitId ?? null,
          componentWeight: c.componentWeight ?? null,
          cookingLossPercent: resolveCookingLossPercent(losses, c.cookingLossPercent),
          losses,
          qtyFormula: normalizeQtyFormula(c.qtyFormula),
        };
      }),
      packagingGoods: Object.fromEntries(
        packagingGoods.map((g) => [g.id, { name: g.name, unitId: g.mainUnitId ?? null, weight: g.weight ?? null }]),
      ),
    };
    return { snapshot, techCardVersion: version.version, specVersion: version.specVersion };
  }

  private async plannedLines(snapshot: ProductionBatchSnapshot, portions: number) {
    const { units } = await productsCatalogService.getDictionaries();
    return planBatchLines(snapshot, portions, units).map((l) => ({
      kind: l.kind,
      sortOrder: l.sortOrder,
      goodId: l.goodId,
      rowKey: l.rowKey,
      name: l.name.slice(0, 255),
      unitId: l.unitId,
      unitName: l.unitName,
      plannedQty: l.plannedQty,
      plannedNetKg: l.plannedNetKg,
      plannedGrossKg: l.plannedGrossKg,
      lossesJson: l.losses ? (l.losses as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    }));
  }

  async create(input: ProductionBatchCreateInput, userId: number | null): Promise<ProductionBatchDetailDto> {
    const goodId = String(input?.goodId ?? '');
    if (!goodId) throw new ProductionBatchError('Оберіть товар');
    const portions = portionsOrThrow(input.plannedPortions);
    const plannedDate = dateOrThrow(input.plannedDate);
    const comment = typeof input.comment === 'string' && input.comment.trim() ? input.comment.trim() : null;
    const { snapshot, techCardVersion, specVersion } = await this.buildSnapshot(goodId);
    const lines = await this.plannedLines(snapshot, portions);
    const userName = userId != null ? (await userNames([userId])).get(userId) ?? null : null;
    const prefix = batchNumberPrefix(plannedDate);

    // Номер: N у межах дня; колізія при паралельному створенні – наступний N
    for (let attempt = 0; ; attempt += 1) {
      const sameDay = await prisma.productionBatch.findMany({
        where: { number: { startsWith: prefix } },
        select: { number: true },
      });
      const maxSeq = sameDay.reduce((max, r) => Math.max(max, Number(r.number.slice(prefix.length)) || 0), 0);
      const number = formatBatchNumber(plannedDate, maxSeq + 1 + attempt);
      try {
        const created = await prisma.productionBatch.create({
          data: {
            number,
            goodId,
            techCardVersion,
            specVersion,
            snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
            plannedPortions: portions,
            plannedDate: new Date(`${plannedDate}T00:00:00Z`),
            status: 'draft',
            comment,
            createdById: userId,
            lines: { create: lines },
            stages: {
              create: snapshot.payload.stages.map((st, idx) => ({
                stageKey: st.key,
                sortOrder: idx,
                name: st.name || `Етап ${idx + 1}`,
                plannedOffsetMin: st.offsetMin,
                plannedDurationMin: st.durationMin,
              })),
            },
            events: {
              create: {
                type: 'created',
                userId,
                userName,
                payloadJson: { plannedPortions: portions, plannedDate, techCardVersion },
              },
            },
          },
        });
        return this.getDetail(created.id);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 5) continue;
        throw err;
      }
    }
  }

  /** План порцій, день і коментар – лише в чернетці; планові кількості перераховуються зі знімка. */
  async updatePlan(id: number, input: ProductionBatchUpdatePlanInput, userId: number | null): Promise<ProductionBatchDetailDto> {
    const row = await prisma.productionBatch.findUnique({ where: { id } });
    if (!row) throw new ProductionBatchError('Варку не знайдено', 404);
    if (row.status !== 'draft') throw new ProductionBatchError('План можна змінити лише в чернетці варки');
    const portions = input.plannedPortions !== undefined ? portionsOrThrow(input.plannedPortions) : row.plannedPortions;
    const plannedDate = input.plannedDate !== undefined ? dateOrThrow(input.plannedDate) : dateOnly(row.plannedDate);
    const comment =
      input.comment !== undefined ? (typeof input.comment === 'string' && input.comment.trim() ? input.comment.trim() : null) : row.comment;
    const snapshot = row.snapshotJson as unknown as ProductionBatchSnapshot;
    const lines = portions !== row.plannedPortions ? await this.plannedLines(snapshot, portions) : null;
    const userName = userId != null ? (await userNames([userId])).get(userId) ?? null : null;
    await prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.productionBatchLine.deleteMany({ where: { batchId: id } });
        await tx.productionBatchLine.createMany({ data: lines.map((l) => ({ ...l, batchId: id })) });
      }
      await tx.productionBatch.update({
        where: { id },
        data: { plannedPortions: portions, plannedDate: new Date(`${plannedDate}T00:00:00Z`), comment },
      });
      await tx.productionBatchEvent.create({
        data: {
          batchId: id,
          type: 'planChanged',
          userId,
          userName,
          payloadJson: {
            from: { plannedPortions: row.plannedPortions, plannedDate: dateOnly(row.plannedDate) },
            to: { plannedPortions: portions, plannedDate },
          },
        },
      });
    });
    return this.getDetail(id);
  }

  async cancel(id: number, reason: string, userId: number | null): Promise<ProductionBatchDetailDto> {
    const text = reason.trim();
    if (!text) throw new ProductionBatchError('Вкажіть причину скасування');
    const row = await prisma.productionBatch.findUnique({ where: { id }, select: { status: true } });
    if (!row) throw new ProductionBatchError('Варку не знайдено', 404);
    if (!CANCELLABLE.includes(row.status as ProductionBatchStatus)) {
      throw new ProductionBatchError('Варку можна скасувати лише до прийому на виробництво');
    }
    const userName = userId != null ? (await userNames([userId])).get(userId) ?? null : null;
    await prisma.$transaction([
      prisma.productionBatch.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelledById: userId, cancelReason: text },
      }),
      prisma.productionBatchEvent.create({
        data: { batchId: id, type: 'cancelled', userId, userName, payloadJson: { reason: text } },
      }),
    ]);
    return this.getDetail(id);
  }
}

export const productionBatchService = new ProductionBatchService();
