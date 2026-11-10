/**
 * Варки (фаза 3 техкарт): створення з затвердженої версії техкарти, знімок рецепту, планові кількості,
 * зміна плану і скасування до прийому на виробництво; видача сировини (знімок залишків, нестача з
 * коментарем, підпис), прийом на виробництво (підпис), готування (старт / фініш етапів), факт виходу (порції, тара,
 * залишки по рядках, підпис), прийом на склад ГП (підпис), закриття. Підписи відкликаються на крок назад.
 */
import { Prisma, type ProductionBatch } from '@prisma/client';
import { logServer, prisma } from '../../lib/utils.js';
import { PERMISSIONS } from '../../../shared/constants/permissions.js';
import type { NotificationDirectEventId } from '../../../shared/constants/notifications.js';
import { sendDirectNotification, userIdsWithPermission } from '../Notifications/directNotify.js';
import {
  PRODUCTION_BATCH_STATUSES,
  type CatalogLossEntry,
  type ProductionBatchCreateInput,
  type ProductionBatchDetailDto,
  type ProductionBatchIssueInput,
  type ProductionBatchOutputInput,
  type ProductionBatchLineDto,
  type ProductionBatchListItemDto,
  type ProductionBatchSignatureStep,
  type ProductionBatchSnapshot,
  type ProductionBatchStageInput,
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
import { issueSignErrors, isIssueShortage, normalizeIssueInput } from '../../../shared/utils/productionBatchIssue.js';
import {
  EMPTY_FACT,
  consumedQty,
  factBoxes,
  normalizeFact,
  normalizeOutputLineInput,
  outputSignErrors,
} from '../../../shared/utils/productionBatchOutput.js';
import { dilovodService } from '../../services/dilovod/DilovodService.js';
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

/** Підпис кроку: до якого стану веде і з якого стану відкликається назад. */
const SIGNATURE_FLOW: Partial<Record<ProductionBatchSignatureStep, { status: ProductionBatchStatus; back: ProductionBatchStatus }>> = {
  issued: { status: 'issued', back: 'draft' },
  accepted: { status: 'accepted', back: 'issued' },
  // Без жодного старту етапу – назад у «Прийнято» (див. revokeSignature)
  output: { status: 'output', back: 'cooking' },
  finished: { status: 'finished', back: 'output' },
};

/** Факт виходу вносять після прийому на виробництво (етапи – попередження, не блокування). */
const OUTPUT_EDITABLE: readonly ProductionBatchStatus[] = ['accepted', 'cooking'];

export interface BatchActor {
  userId: number | null;
  /** Назва ролі для підпису */
  roleLabel?: string | null;
  /** Може відкликати будь-який підпис */
  canRevokeAny?: boolean;
}

function textOrNull(value: unknown, max = 2000): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Допуск розбіжності годинників клієнта і сервера для «не в майбутньому». */
const CLOCK_SKEW_MS = 5 * 60_000;

function stageTimeOrThrow(value: unknown, what: string): Date | null {
  if (value === null || value === '') return null;
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new ProductionBatchError(`Некоректний час ${what} етапу`);
  if (date.getTime() > Date.now() + CLOCK_SKEW_MS) throw new ProductionBatchError(`Час ${what} етапу не може бути в майбутньому`);
  return date;
}

/** Інтерактивні транзакції кроків: кілька десятків рядків через віддалену БД не вкладаються в типові 5 с. */
const STEP_TX = { timeout: 20_000, maxWait: 10_000 } as const;

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
  row: ProductionBatch & { good: { name: string; sku: string | null }; stages?: Array<{ finishedAt: Date | null }> },
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
    stagesTotal: row.stages?.length ?? 0,
    stagesDone: row.stages?.filter((st) => st.finishedAt != null).length ?? 0,
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

type BatchNotifyEvent = Extract<
  NotificationDirectEventId,
  'batchIssue' | 'batchAcceptProduction' | 'batchAcceptFinished' | 'batchClose'
>;

/** Кому і з яким заголовком сповіщати про крок; author – автор варки. */
const BATCH_NOTIFY: Record<BatchNotifyEvent, { permission: string | 'author'; title: string }> = {
  batchIssue: { permission: PERMISSIONS.ACTION_PRODUCTION_BATCHES_ISSUE, title: 'чекає видачі сировини' },
  batchAcceptProduction: {
    permission: PERMISSIONS.ACTION_PRODUCTION_BATCHES_ACCEPT_PRODUCTION,
    title: 'чекає прийому на виробництво',
  },
  batchAcceptFinished: { permission: PERMISSIONS.ACTION_PRODUCTION_BATCHES_ACCEPT_FINISHED, title: 'чекає прийому на склад ГП' },
  batchClose: { permission: 'author', title: 'прийнята на склад ГП, можна закривати' },
};

function batchNotifyMessage(batch: ProductionBatchDetailDto, event: BatchNotifyEvent): string {
  const [y, m, d] = batch.plannedDate.split('-');
  const parts = [`«${batch.goodName}»`, `${batch.plannedPortions} порцій`, `на ${d}.${m}.${y}`];
  if (event === 'batchAcceptProduction') {
    const shortages = batch.lines.filter((l) => l.shortageComment).length;
    if (shortages > 0) parts.push(`нестача: ${shortages} поз.`);
  }
  if ((event === 'batchAcceptFinished' || event === 'batchClose') && batch.fact?.portionsGood != null) {
    parts.push(`на ГП: ${batch.fact.portionsGood} порцій`);
  }
  return parts.join(', ');
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
      include: { good: { select: { name: true, sku: true } }, stages: { select: { finishedAt: true } } },
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
      fact: row.factJson ? normalizeFact(row.factJson) : null,
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
        userId: s.userId,
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
        const detail = await this.getDetail(created.id);
        await this.notifyStep(detail, 'batchIssue', userId);
        return detail;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 5) continue;
        throw err;
      }
    }
  }

  /** План порцій, день і коментар – лише в чернетці; планові кількості перераховуються зі знімка. */
  async updatePlan(id: number, input: ProductionBatchUpdatePlanInput, userId: number | null): Promise<ProductionBatchDetailDto> {
    const row = await prisma.productionBatch.findUnique({ where: { id }, include: { lines: true } });
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
        // Знімок залишків і примітки комірника лишаються; «Видано» – заново під новий план
        const kept = new Map(row.lines.map((l) => [`${l.kind}|${l.goodId}|${l.rowKey ?? ''}`, l]));
        await tx.productionBatchLine.createMany({
          data: lines.map((l) => {
            const old = kept.get(`${l.kind}|${l.goodId}|${l.rowKey ?? ''}`);
            return {
              ...l,
              batchId: id,
              stockRawSnap: old?.stockRawSnap ?? null,
              stockProdSnap: old?.stockProdSnap ?? null,
              stockSnapAt: old?.stockSnapAt ?? null,
              stockActual: old?.stockActual ?? null,
              issueNote: old?.issueNote ?? null,
            };
          }),
        });
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

  private async userName(userId: number | null): Promise<string | null> {
    return userId != null ? (await userNames([userId])).get(userId) ?? null : null;
  }

  private async requireStatus(id: number, statuses: readonly ProductionBatchStatus[], message: string) {
    const row = await prisma.productionBatch.findUnique({ where: { id }, include: { lines: true, stages: true } });
    if (!row) throw new ProductionBatchError('Варку не знайдено', 404);
    if (!statuses.includes(row.status as ProductionBatchStatus)) throw new ProductionBatchError(message, 409);
    return row;
  }

  /** «Оновити»: живі залишки СП / ВП з Dilovod лише для товарів цієї варки → знімок у рядках. */
  async refreshStock(id: number, userId: number | null): Promise<ProductionBatchDetailDto> {
    const row = await this.requireStatus(id, ['draft'], 'Залишки оновлюються лише до видачі сировини');
    const totals = await dilovodService.fetchStockForGoods(row.lines.map((l) => l.goodId));
    const at = new Date();
    const userName = await this.userName(userId);
    await prisma.$transaction([
      ...row.lines.map((l) => {
        const t = totals.get(l.goodId) ?? { rawStock: 0, productionStock: 0 };
        return prisma.productionBatchLine.update({
          where: { id: l.id },
          data: { stockRawSnap: t.rawStock, stockProdSnap: t.productionStock, stockSnapAt: at },
        });
      }),
      prisma.productionBatchEvent.create({
        data: { batchId: id, type: 'stockRefreshed', userId, userName, payloadJson: { goods: row.lines.length } },
      }),
    ]);
    return this.getDetail(id);
  }

  private async applyIssueInput(
    tx: Prisma.TransactionClient,
    batchId: number,
    lines: Array<{ id: number; stockActual: number | null; issuedQty: number | null; issueNote: string | null; shortageComment: string | null }>,
    input: ProductionBatchIssueInput | undefined,
  ): Promise<void> {
    const byId = new Map(lines.map((l) => [l.id, l]));
    const items = Array.isArray(input?.lines) ? input.lines : [];
    for (const raw of items) {
      const line = normalizeIssueInput(raw);
      const current = line ? byId.get(line.id) : undefined;
      if (!line || !current) continue;
      const { id, ...data } = line;
      // Лише змінені поля: кожен запит через віддалену БД коштує часу транзакції
      const patch = Object.fromEntries(
        Object.entries(data).filter(([k, v]) => v !== undefined && v !== current[k as keyof typeof current]),
      );
      if (Object.keys(patch).length === 0) continue;
      await tx.productionBatchLine.update({ where: { id, batchId }, data: patch });
    }
  }

  /** Чернетка видачі: фактичні залишки, видано, примітки (без підпису). */
  async saveIssue(id: number, input: ProductionBatchIssueInput): Promise<ProductionBatchDetailDto> {
    const row = await this.requireStatus(id, ['draft'], 'Видачу можна змінити лише до підтвердження');
    await prisma.$transaction((tx) => this.applyIssueInput(tx, id, row.lines, input), STEP_TX);
    return this.getDetail(id);
  }

  /** «Підтверджую видачу»: зберігає введене, перевіряє нестачі, підпис комірника → «Сировину видано». */
  async signIssue(id: number, input: ProductionBatchIssueInput, actor: BatchActor): Promise<ProductionBatchDetailDto> {
    const row = await this.requireStatus(id, ['draft'], 'Сировину для цієї варки вже видано');
    if (actor.userId == null) throw new ProductionBatchError('Підпис потребує користувача', 403);
    const userName = (await this.userName(actor.userId)) ?? `#${actor.userId}`;
    await prisma.$transaction(async (tx) => {
      await this.applyIssueInput(tx, id, row.lines, input);
      const lines = await tx.productionBatchLine.findMany({ where: { batchId: id } });
      const typed = lines.map((l) => ({ ...l, kind: l.kind === 'packaging' ? ('packaging' as const) : ('raw' as const) }));
      const errors = issueSignErrors(typed);
      if (errors.length > 0) throw new ProductionBatchError(errors.join('; '));
      const shortages = typed.filter((l) => isIssueShortage(l, l.issuedQty)).length;
      await tx.productionBatch.update({ where: { id }, data: { status: 'issued' } });
      await tx.productionBatchSignature.create({
        data: { batchId: id, step: 'issued', userId: actor.userId as number, userName, roleLabel: actor.roleLabel ?? null },
      });
      await tx.productionBatchEvent.create({
        data: { batchId: id, type: 'issued', userId: actor.userId, userName, payloadJson: { shortages } },
      });
    }, STEP_TX);
    const detail = await this.getDetail(id);
    await this.notifyStep(detail, 'batchAcceptProduction', actor.userId);
    return detail;
  }

  /** Прийом сировини на виробництво: підпис → «Прийнято на виробництво». */
  async acceptProduction(id: number, comment: unknown, actor: BatchActor): Promise<ProductionBatchDetailDto> {
    await this.requireStatus(id, ['issued'], 'Прийняти на виробництво можна лише видану сировину');
    if (actor.userId == null) throw new ProductionBatchError('Підпис потребує користувача', 403);
    const userName = (await this.userName(actor.userId)) ?? `#${actor.userId}`;
    const text = textOrNull(comment);
    await prisma.$transaction([
      prisma.productionBatch.update({ where: { id }, data: { status: 'accepted' } }),
      prisma.productionBatchSignature.create({
        data: { batchId: id, step: 'accepted', userId: actor.userId, userName, roleLabel: actor.roleLabel ?? null },
      }),
      prisma.productionBatchEvent.create({
        data: { batchId: id, type: 'accepted', userId: actor.userId, userName, payloadJson: text ? { comment: text } : Prisma.DbNull },
      }),
    ]);
    return this.getDetail(id);
  }

  private stageOf<T extends { id: number }>(row: { stages: T[] }, stageId: number): T {
    const stage = row.stages.find((s) => s.id === stageId);
    if (!stage) throw new ProductionBatchError('Етап не знайдено', 404);
    return stage;
  }

  /** Старт етапу; перший старт переводить варку в «Готування». */
  async startStage(id: number, stageId: number, userId: number | null): Promise<ProductionBatchDetailDto> {
    const row = await this.requireStatus(id, ['accepted', 'cooking'], 'Етапи відмічають після прийому на виробництво');
    const stage = this.stageOf(row, stageId);
    if (stage.startedAt) throw new ProductionBatchError('Етап уже розпочато', 409);
    const userName = await this.userName(userId);
    await prisma.$transaction([
      prisma.productionBatchStage.update({ where: { id: stageId }, data: { startedAt: new Date(), startedById: userId } }),
      ...(row.status === 'accepted' ? [prisma.productionBatch.update({ where: { id }, data: { status: 'cooking' } })] : []),
      prisma.productionBatchEvent.create({
        data: { batchId: id, type: 'stageStarted', userId, userName, payloadJson: { stage: stage.name } },
      }),
    ]);
    return this.getDetail(id);
  }

  /** Фініш етапу з фактичною температурою і коментарем. */
  async finishStage(id: number, stageId: number, input: ProductionBatchStageInput, userId: number | null): Promise<ProductionBatchDetailDto> {
    const row = await this.requireStatus(id, ['cooking'], 'Варка не в стані готування');
    const stage = this.stageOf(row, stageId);
    if (!stage.startedAt) throw new ProductionBatchError('Спершу розпочніть етап', 409);
    if (stage.finishedAt) throw new ProductionBatchError('Етап уже завершено', 409);
    const actualTemp = input?.actualTemp !== undefined ? textOrNull(input.actualTemp, 64) : stage.actualTemp;
    const comment = input?.comment !== undefined ? textOrNull(input.comment) : stage.comment;
    const userName = await this.userName(userId);
    await prisma.$transaction([
      prisma.productionBatchStage.update({
        where: { id: stageId },
        data: { finishedAt: new Date(), finishedById: userId, actualTemp, comment },
      }),
      prisma.productionBatchEvent.create({
        data: { batchId: id, type: 'stageFinished', userId, userName, payloadJson: { stage: stage.name, actualTemp } },
      }),
    ]);
    return this.getDetail(id);
  }

  /**
   * Температура, коментар і фактичний час етапу (варку оформлюють і заднім числом).
   * Час: ISO-рядок; фініш – лише з початком і не раніше за нього; не в майбутньому.
   * Перший вказаний початок переводить варку в «Готування».
   */
  async updateStage(
    id: number,
    stageId: number,
    input: ProductionBatchStageInput,
    userId: number | null,
  ): Promise<ProductionBatchDetailDto> {
    const row = await this.requireStatus(id, ['accepted', 'cooking'], 'Варка не в стані готування');
    const stage = this.stageOf(row, stageId);
    const data: Prisma.ProductionBatchStageUncheckedUpdateInput = {};
    if (input?.actualTemp !== undefined) data.actualTemp = textOrNull(input.actualTemp, 64);
    if (input?.comment !== undefined) data.comment = textOrNull(input.comment);

    const startedAt = input?.startedAt !== undefined ? stageTimeOrThrow(input.startedAt, 'початку') : stage.startedAt;
    const finishedAt = input?.finishedAt !== undefined ? stageTimeOrThrow(input.finishedAt, 'завершення') : stage.finishedAt;
    if (finishedAt && !startedAt) throw new ProductionBatchError('Спершу вкажіть початок етапу');
    if (startedAt && finishedAt && finishedAt < startedAt) {
      throw new ProductionBatchError('Завершення етапу не може бути раніше за початок');
    }
    const startChanged = (startedAt?.getTime() ?? null) !== (stage.startedAt?.getTime() ?? null);
    const finishChanged = (finishedAt?.getTime() ?? null) !== (stage.finishedAt?.getTime() ?? null);
    if (startChanged) {
      data.startedAt = startedAt;
      data.startedById = startedAt ? stage.startedById ?? userId : null;
    }
    if (finishChanged) {
      data.finishedAt = finishedAt;
      data.finishedById = finishedAt ? stage.finishedById ?? userId : null;
    }
    if (Object.keys(data).length === 0) return this.getDetail(id);

    const stillStarted = Boolean(startedAt) || row.stages.some((s) => s.id !== stageId && s.startedAt);
    const nextStatus = row.status === 'accepted' && startedAt ? 'cooking' : row.status === 'cooking' && !stillStarted ? 'accepted' : null;
    const userName = startChanged || finishChanged ? await this.userName(userId) : null;
    await prisma.$transaction([
      prisma.productionBatchStage.update({ where: { id: stageId }, data }),
      ...(nextStatus ? [prisma.productionBatch.update({ where: { id }, data: { status: nextStatus } })] : []),
      ...(startChanged || finishChanged
        ? [
            prisma.productionBatchEvent.create({
              data: {
                batchId: id,
                type: 'stageTimeEdited',
                userId,
                userName,
                payloadJson: {
                  stage: stage.name,
                  startedAt: startedAt?.toISOString() ?? null,
                  finishedAt: finishedAt?.toISOString() ?? null,
                },
              },
            }),
          ]
        : []),
    ]);
    return this.getDetail(id);
  }

  /** Відмінити останню відмітку етапу (фініш, інакше старт); без стартів варка знову «Прийнято». */
  async undoStage(id: number, stageId: number, userId: number | null): Promise<ProductionBatchDetailDto> {
    const row = await this.requireStatus(id, ['cooking'], 'Варка не в стані готування');
    const stage = this.stageOf(row, stageId);
    if (!stage.startedAt) throw new ProductionBatchError('Етап ще не розпочато', 409);
    const what = stage.finishedAt ? 'finish' : 'start';
    const stillStarted = row.stages.some((s) => s.id !== stageId && s.startedAt);
    const userName = await this.userName(userId);
    await prisma.$transaction([
      prisma.productionBatchStage.update({
        where: { id: stageId },
        data:
          what === 'finish'
            ? { finishedAt: null, finishedById: null }
            : { startedAt: null, startedById: null },
      }),
      ...(what === 'start' && !stillStarted ? [prisma.productionBatch.update({ where: { id }, data: { status: 'accepted' } })] : []),
      prisma.productionBatchEvent.create({
        data: { batchId: id, type: 'stageUndone', userId, userName, payloadJson: { stage: stage.name, what } },
      }),
    ]);
    return this.getDetail(id);
  }

  /**
   * Відкликати підпис: лише останній чинний і поки варка на його кроці (наступний крок не почався).
   * Свій підпис – автор; будь-який – право revokeAny. Варка повертається на попередній крок.
   */
  async revokeSignature(id: number, signatureId: number, comment: unknown, actor: BatchActor): Promise<ProductionBatchDetailDto> {
    const text = textOrNull(comment);
    if (!text) throw new ProductionBatchError('Вкажіть причину відкликання');
    const row = await prisma.productionBatch.findUnique({
      where: { id },
      include: {
        signatures: { where: { revokedAt: null }, orderBy: { signedAt: 'desc' } },
        stages: { select: { startedAt: true } },
      },
    });
    if (!row) throw new ProductionBatchError('Варку не знайдено', 404);
    const sig = row.signatures.find((s) => s.id === signatureId);
    if (!sig) throw new ProductionBatchError('Підпис не знайдено або вже відкликано', 404);
    if (row.signatures[0]?.id !== sig.id) throw new ProductionBatchError('Спершу відкличте пізніший підпис', 409);
    const flow = SIGNATURE_FLOW[sig.step as ProductionBatchSignatureStep];
    if (!flow || row.status !== flow.status) {
      throw new ProductionBatchError('Підпис не можна відкликати: варка вже перейшла на наступний крок', 409);
    }
    if (!(actor.canRevokeAny || (actor.userId != null && actor.userId === sig.userId))) {
      throw new ProductionBatchError('Відкликати можна лише власний підпис', 403);
    }
    const back = flow.back === 'cooking' && !row.stages.some((st) => st.startedAt) ? 'accepted' : flow.back;
    const userName = await this.userName(actor.userId);
    await prisma.$transaction([
      prisma.productionBatchSignature.update({
        where: { id: sig.id },
        data: { revokedAt: new Date(), revokedById: actor.userId, revokeComment: text },
      }),
      prisma.productionBatch.update({ where: { id }, data: { status: back } }),
      prisma.productionBatchEvent.create({
        data: {
          batchId: id,
          type: 'signatureRevoked',
          userId: actor.userId,
          userName,
          payloadJson: { step: sig.step, signer: sig.userName, comment: text },
        },
      }),
    ]);
    return this.getDetail(id);
  }

  /** Факт із JSON варки; «Порцій у коробці» за замовчуванням – з техкарти. */
  private factOf(row: { factJson: Prisma.JsonValue; snapshotJson: Prisma.JsonValue }) {
    const snapshot = row.snapshotJson as unknown as ProductionBatchSnapshot;
    const base = { ...EMPTY_FACT, portionsPerBox: snapshot?.payload?.portionsPerBox ?? null };
    return row.factJson ? normalizeFact(row.factJson, base) : base;
  }

  private async applyOutputInput(
    tx: Prisma.TransactionClient,
    row: Awaited<ReturnType<ProductionBatchService['requireStatus']>>,
    input: ProductionBatchOutputInput | undefined,
  ) {
    const fact = input?.fact ? normalizeFact(input.fact, this.factOf(row)) : this.factOf(row);
    await tx.productionBatch.update({
      where: { id: row.id },
      data: { factJson: fact as unknown as Prisma.InputJsonValue },
    });
    const byId = new Map(row.lines.map((l) => [l.id, l]));
    for (const raw of Array.isArray(input?.lines) ? input.lines : []) {
      const patch = normalizeOutputLineInput(raw);
      const line = patch ? byId.get(patch.id) : undefined;
      if (!patch || !line) continue;
      const leftoverQty = patch.leftoverQty !== undefined ? patch.leftoverQty : line.leftoverQty;
      const leftoverAction = patch.leftoverAction !== undefined ? patch.leftoverAction : line.leftoverAction;
      const note = patch.note !== undefined ? patch.note : line.note;
      if (leftoverQty === line.leftoverQty && leftoverAction === line.leftoverAction && note === line.note) continue;
      const typed = { ...line, kind: line.kind === 'packaging' ? ('packaging' as const) : ('raw' as const) };
      await tx.productionBatchLine.update({
        where: { id: line.id },
        data: {
          leftoverQty,
          consumedQty: consumedQty(typed, leftoverQty),
          leftoverAction,
          note,
        },
      });
    }
    return fact;
  }

  /** Чернетка факту виходу (без підпису). */
  async saveOutput(id: number, input: ProductionBatchOutputInput): Promise<ProductionBatchDetailDto> {
    const row = await this.requireStatus(id, OUTPUT_EDITABLE, 'Факт виходу вносять після прийому на виробництво');
    await prisma.$transaction((tx) => this.applyOutputInput(tx, row, input), STEP_TX);
    return this.getDetail(id);
  }

  /** «Підтверджую факт виходу»: порожній залишок = 0, коробки за замовчуванням, підпис → «Факт виходу». */
  async signOutput(id: number, input: ProductionBatchOutputInput, actor: BatchActor): Promise<ProductionBatchDetailDto> {
    const row = await this.requireStatus(id, OUTPUT_EDITABLE, 'Факт виходу вносять після прийому на виробництво');
    if (actor.userId == null) throw new ProductionBatchError('Підпис потребує користувача', 403);
    const userName = (await this.userName(actor.userId)) ?? `#${actor.userId}`;
    await prisma.$transaction(async (tx) => {
      let fact = await this.applyOutputInput(tx, row, input);
      const lines = await tx.productionBatchLine.findMany({ where: { batchId: id } });
      const typed = lines.map((l) => ({ ...l, kind: l.kind === 'packaging' ? ('packaging' as const) : ('raw' as const) }));
      const errors = outputSignErrors(fact, typed);
      if (errors.length > 0) throw new ProductionBatchError(errors.join('; '));
      // Порожній залишок = 0, витрачено = видано (одним запитом)
      await tx.$executeRaw`UPDATE production_batch_lines SET leftoverQty = 0, consumedQty = issuedQty WHERE batchId = ${id} AND leftoverQty IS NULL`;
      if (fact.boxes == null) {
        fact = { ...fact, boxes: factBoxes(fact.portionsGood, fact.portionsPerBox) };
      }
      const unfinished = row.stages.filter((st) => !st.finishedAt).length;
      await tx.productionBatch.update({
        where: { id },
        data: { status: 'output', factJson: fact as unknown as Prisma.InputJsonValue },
      });
      await tx.productionBatchSignature.create({
        data: { batchId: id, step: 'output', userId: actor.userId as number, userName, roleLabel: actor.roleLabel ?? null },
      });
      await tx.productionBatchEvent.create({
        data: {
          batchId: id,
          type: 'output',
          userId: actor.userId,
          userName,
          payloadJson: {
            portionsGood: fact.portionsGood,
            portionsReject: fact.portionsReject,
            portionsSample: fact.portionsSample,
            unfinishedStages: unfinished,
          },
        },
      });
    }, STEP_TX);
    const detail = await this.getDetail(id);
    await this.notifyStep(detail, 'batchAcceptFinished', actor.userId);
    return detail;
  }

  /** Прийом продукції на склад ГП: підпис → «Прийнято на склад ГП». */
  async acceptFinished(id: number, comment: unknown, actor: BatchActor): Promise<ProductionBatchDetailDto> {
    await this.requireStatus(id, ['output'], 'На склад ГП приймають після підпису факту виходу');
    if (actor.userId == null) throw new ProductionBatchError('Підпис потребує користувача', 403);
    const userName = (await this.userName(actor.userId)) ?? `#${actor.userId}`;
    const text = textOrNull(comment);
    await prisma.$transaction([
      prisma.productionBatch.update({ where: { id }, data: { status: 'finished' } }),
      prisma.productionBatchSignature.create({
        data: { batchId: id, step: 'finished', userId: actor.userId, userName, roleLabel: actor.roleLabel ?? null },
      }),
      prisma.productionBatchEvent.create({
        data: { batchId: id, type: 'finished', userId: actor.userId, userName, payloadJson: text ? { comment: text } : Prisma.DbNull },
      }),
    ]);
    const detail = await this.getDetail(id);
    await this.notifyStep(detail, 'batchClose', actor.userId);
    return detail;
  }

  // ─── сповіщення ───────────────────────────────────────────────────────────

  /** Адресне сповіщення тим, хто виконує наступний крок; помилка лише логуюється. */
  private async notifyStep(batch: ProductionBatchDetailDto, event: BatchNotifyEvent, actorId: number | null): Promise<void> {
    try {
      const spec = BATCH_NOTIFY[event];
      let recipients: number[];
      if (spec.permission === 'author') {
        const row = await prisma.productionBatch.findUnique({ where: { id: batch.id }, select: { createdById: true } });
        recipients = row?.createdById != null ? [row.createdById] : [];
      } else {
        recipients = await userIdsWithPermission(spec.permission);
      }
      await sendDirectNotification({
        category: 'production_batch',
        recipients,
        event,
        actorId,
        status: 'info',
        title: `Варка ${batch.number} ${spec.title}`,
        message: batchNotifyMessage(batch, event),
        link: `/production/batches/${batch.id}`,
        data: { batchId: batch.id, goodId: batch.goodId },
        systemSource: 'system:production-batch',
      });
    } catch (error) {
      logServer('[production-batch] notify failed', { batchId: batch.id, event, error });
    }
  }

  /** Закрити варку після прийому на ГП: далі лише перегляд. */
  async close(id: number, userId: number | null): Promise<ProductionBatchDetailDto> {
    await this.requireStatus(id, ['finished'], 'Закрити можна лише варку, прийняту на склад ГП');
    const userName = await this.userName(userId);
    await prisma.$transaction([
      prisma.productionBatch.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } }),
      prisma.productionBatchEvent.create({ data: { batchId: id, type: 'closed', userId, userName } }),
    ]);
    return this.getDetail(id);
  }
}

export const productionBatchService = new ProductionBatchService();
