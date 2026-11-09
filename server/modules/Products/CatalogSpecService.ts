import type { Prisma } from '@prisma/client';
import { logServer, prisma } from '../../lib/utils.js';
import { PERMISSIONS } from '../../../shared/constants/permissions.js';
import { CATALOG_ACC_POLICY_GOOD, type CatalogUpdateGoodInput } from '../../../shared/types/catalog.js';
import { CATALOG_AUDIT_ACTIONS, type CatalogGoodAuditSnapshot } from '../../../shared/types/catalogAudit.js';
import {
  CATALOG_SPEC_ERROR_CODES,
  type CatalogSpecComponent,
  type CatalogSpecContent,
  type CatalogSpecDraftDto,
  type CatalogSpecDraftListItem,
  type CatalogSpecDraftStatus,
  type CatalogSpecStateDto,
  type CatalogSpecVersionDto,
  type CatalogSpecVersionSource,
} from '../../../shared/types/catalogSpec.js';
import {
  diffSpecContent,
  normalizeSpecQty,
  specContentEquals,
} from '../../../shared/utils/catalogSpecContent.js';
import {
  normalizeLossEntries,
  parseLossEntriesKey,
  resolveCookingLossPercent,
} from '../../../shared/utils/catalogLoss.js';
import { assignRowKeys, isRowKey } from '../../../shared/utils/catalogRowKey.js';
import { normalizeQtyFormula } from '../../../shared/utils/catalogQtyFormula.js';
import { catalogGoodAuditService } from './CatalogGoodAuditService.js';
import { productsCatalogService } from './ProductsCatalogService.js';
import type { NotificationDirectEventId } from '../../../shared/constants/notifications.js';

export class CatalogSpecError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'CatalogSpecError';
  }
}

export interface CatalogSpecActor {
  userId: number | null;
  canApprove: boolean;
}

type DraftRow = Prisma.CatalogSpecDraftGetPayload<object>;
type VersionRow = Prisma.CatalogSpecVersionGetPayload<object>;

type InputComponents = NonNullable<CatalogUpdateGoodInput['components']>;

const NOTIFY_CATEGORY = 'catalog_spec';
const ADMIN_ROLE_SLUG = 'admin';

function goodLink(goodId: string): string {
  return `/products#good=${encodeURIComponent(goodId)}`;
}

function parseComponents(raw: unknown): CatalogSpecComponent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map((r, idx) => ({
      componentGoodId: String(r.componentGoodId ?? ''),
      name: String(r.name ?? r.componentGoodId ?? ''),
      sku: r.sku != null ? String(r.sku) : null,
      qty: Number(r.qty) || 0,
      rowNum: Number(r.rowNum) || idx + 1,
      unitId: r.unitId != null && r.unitId !== '' ? String(r.unitId) : null,
      note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
      cookingLossPercent: resolveCookingLossPercent(r.losses, r.cookingLossPercent),
      losses: normalizeLossEntries(r.losses),
      rowKey: isRowKey(r.rowKey) ? r.rowKey : null,
      qtyFormula: normalizeQtyFormula(r.qtyFormula),
    }))
    .filter((r) => r.componentGoodId);
}

function rowContent(row: { specQty: number | null; componentsJson: unknown }): CatalogSpecContent {
  return { specQty: row.specQty, components: parseComponents(row.componentsJson) };
}

function snapshotContent(snapshot: CatalogGoodAuditSnapshot | null): CatalogSpecContent | null {
  if (!snapshot) return null;
  const accPolicyId = snapshot.fields.accPolicyId;
  return {
    specQty: accPolicyId === CATALOG_ACC_POLICY_GOOD ? normalizeSpecQty(snapshot.fields.specQty) : null,
    components: snapshot.components.map((c, idx) => ({
      componentGoodId: c.componentGoodId,
      name: c.name,
      sku: c.sku,
      qty: c.qty,
      rowNum: idx + 1,
      unitId: c.unitId,
      note: c.note,
      cookingLossPercent: c.cookingLossPercent,
      losses: normalizeLossEntries(parseLossEntriesKey(c.losses ?? null)),
    })),
  };
}

function jsonSignature(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * Модерація специфікації (BOM + specQty): чернетка → затвердження → версія.
 * Чинна специфікація живе в `catalog_good_components` / `catalog_goods.specQty` і Dilovod;
 * чернетка зберігається окремо й ніде, крім картки товару, не використовується.
 */
export interface CatalogSpecVersionCreatedEvent {
  goodId: string;
  version: number;
  source: CatalogSpecVersionSource;
}

type CatalogSpecVersionListener = (event: CatalogSpecVersionCreatedEvent) => Promise<void> | void;

export class CatalogSpecService {
  private versionListeners: CatalogSpecVersionListener[] = [];

  /** Підписка на нову версію специфікації (техкарта: автоматична версія з тими самими етапами). */
  onVersionCreated(listener: CatalogSpecVersionListener): void {
    this.versionListeners.push(listener);
  }

  private async emitVersionCreated(event: CatalogSpecVersionCreatedEvent): Promise<void> {
    for (const listener of this.versionListeners) {
      try {
        await listener(event);
      } catch (err) {
        logServer('[CatalogSpecService] version listener failed', err);
      }
    }
  }

  // ─── читання ──────────────────────────────────────────────────────────────

  private async loadGood(goodId: string) {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: {
        id: true,
        name: true,
        sku: true,
        isGroup: true,
        accPolicyId: true,
        specQty: true,
        productIngredientsJson: true,
        productNutritionJson: true,
        components: {
          orderBy: { rowNum: 'asc' },
          include: { componentGood: { select: { name: true, sku: true } } },
        },
      },
    });
    if (!good) throw new CatalogSpecError('Товар не знайдено', 404);
    return good;
  }

  private approvedContent(good: Awaited<ReturnType<CatalogSpecService['loadGood']>>): CatalogSpecContent {
    return {
      specQty: good.accPolicyId === CATALOG_ACC_POLICY_GOOD ? normalizeSpecQty(good.specQty) : null,
      components: good.components.map((c, idx) => ({
        componentGoodId: c.componentGoodId,
        name: c.componentGood?.name ?? c.componentGoodId,
        sku: c.componentGood?.sku ?? null,
        qty: c.qty,
        rowNum: c.rowNum || idx + 1,
        unitId: c.unitId ?? null,
        note: c.note?.trim() || null,
        cookingLossPercent: resolveCookingLossPercent(c.lossesJson, c.cookingLossPercent),
        losses: normalizeLossEntries(c.lossesJson),
        rowKey: c.rowKey ?? null,
        qtyFormula: normalizeQtyFormula(c.qtyFormulaJson),
      })),
    };
  }

  async readApprovedContent(goodId: string): Promise<CatalogSpecContent> {
    return this.approvedContent(await this.loadGood(goodId));
  }

  /** Вхід форми → вміст специфікації з назвами компонентів. */
  async contentFromInput(
    components: InputComponents,
    specQty: unknown,
    accPolicyId: string | null,
  ): Promise<CatalogSpecContent> {
    const ids = [...new Set(components.map((c) => String(c.componentGoodId)).filter(Boolean))];
    const goods = ids.length
      ? await prisma.catalogGood.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, sku: true } })
      : [];
    const byId = new Map(goods.map((g) => [g.id, g]));
    return {
      specQty: accPolicyId === CATALOG_ACC_POLICY_GOOD ? normalizeSpecQty(specQty) : null,
      components: components
        .filter((c) => c.componentGoodId)
        .map((c, idx) => {
          const id = String(c.componentGoodId);
          const qty = Number(c.qty);
          if (!Number.isFinite(qty) || qty <= 0) {
            throw new CatalogSpecError(`Кількість компонента «${byId.get(id)?.name ?? id}» має бути більшою за 0`);
          }
          return {
            componentGoodId: id,
            name: byId.get(id)?.name ?? id,
            sku: byId.get(id)?.sku ?? null,
            qty,
            rowNum: c.rowNum ?? idx + 1,
            unitId: c.unitId || null,
            note: c.note?.trim() || null,
            cookingLossPercent: resolveCookingLossPercent(c.losses, c.cookingLossPercent),
            losses: normalizeLossEntries(c.losses),
            rowKey: isRowKey(c.rowKey) ? c.rowKey : null,
            qtyFormula: normalizeQtyFormula(c.qtyFormula),
          };
        }),
    };
  }

  async currentVersion(goodId: string): Promise<number | null> {
    const agg = await prisma.catalogSpecVersion.aggregate({ where: { goodId }, _max: { version: true } });
    return agg._max.version ?? null;
  }

  private async userNames(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((v): v is number => v != null))];
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u.name || u.email]));
  }

  private async enrich(goodId: string, content: CatalogSpecContent) {
    // Чернетки й версії до фази 2b не мають ключів рядків: беремо ключі чинних рядків (той самий рядок)
    let rowKeys: Array<string | null> = content.components.map((c) => c.rowKey ?? null);
    if (rowKeys.some((k) => !k)) {
      const existing = await prisma.catalogGoodComponent.findMany({
        where: { parentGoodId: goodId },
        select: { rowKey: true, dilovodRowId: true, rowNum: true, componentGoodId: true },
      });
      rowKeys = assignRowKeys(content.components, existing);
    }
    return productsCatalogService.enrichComponents(
      content.components.map((c, idx) => ({
        parentGoodId: goodId,
        componentGoodId: c.componentGoodId,
        qty: c.qty,
        rowNum: c.rowNum,
        unitId: c.unitId,
        note: c.note,
        cookingLossPercent: c.cookingLossPercent,
        lossesJson: c.losses ?? null,
        rowKey: rowKeys[idx],
        qtyFormulaJson: c.qtyFormula ?? null,
      })),
    );
  }

  private async draftDto(draft: DraftRow, currentVersion: number | null): Promise<CatalogSpecDraftDto> {
    const names = await this.userNames([draft.authorId, draft.lastEditedById, draft.reviewedById]);
    const content = rowContent(draft);
    return {
      goodId: draft.goodId,
      baseVersion: draft.baseVersion,
      status: draft.status as CatalogSpecDraftStatus,
      comment: draft.comment,
      restoredFromVersion: draft.restoredFromVersion,
      authorId: draft.authorId,
      authorName: draft.authorId != null ? names.get(draft.authorId) ?? null : null,
      lastEditedById: draft.lastEditedById,
      lastEditedByName: draft.lastEditedById != null ? names.get(draft.lastEditedById) ?? null : null,
      reviewedByName: draft.reviewedById != null ? names.get(draft.reviewedById) ?? null : null,
      reviewedAt: draft.reviewedAt?.toISOString() ?? null,
      rejectReason: draft.rejectReason,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
      stale: (currentVersion ?? 0) !== draft.baseVersion,
      specQty: content.specQty,
      components: await this.enrich(draft.goodId, content),
    };
  }

  async getState(goodId: string): Promise<CatalogSpecStateDto> {
    const [currentVersion, draft, latest] = await Promise.all([
      this.currentVersion(goodId),
      prisma.catalogSpecDraft.findUnique({ where: { goodId } }),
      prisma.catalogSpecVersion.findFirst({
        where: { goodId },
        orderBy: { version: 'desc' },
        select: {
          version: true,
          source: true,
          approvedAt: true,
          createdAt: true,
          approvedById: true,
          authorId: true,
          contentReviewPending: true,
        },
      }),
    ]);
    const byId = latest ? latest.approvedById ?? latest.authorId : null;
    const names = await this.userNames([byId]);
    return {
      goodId,
      currentVersion,
      current: latest
        ? {
            version: latest.version,
            source: latest.source as CatalogSpecVersionSource,
            at: (latest.approvedAt ?? latest.createdAt).toISOString(),
            byName: byId != null ? names.get(byId) ?? null : null,
          }
        : null,
      draft: draft ? await this.draftDto(draft, currentVersion) : null,
      contentReviewPending: Boolean(latest?.contentReviewPending),
    };
  }

  async listVersions(goodId: string): Promise<CatalogSpecVersionDto[]> {
    const good = await this.loadGood(goodId);
    if (!good.isGroup) await this.ensureBaseline(goodId, this.approvedContent(good));
    const rows = await prisma.catalogSpecVersion.findMany({ where: { goodId }, orderBy: { version: 'desc' } });
    const names = await this.userNames(rows.flatMap((r) => [r.authorId, r.approvedById]));
    return Promise.all(rows.map((r) => this.versionDto(r, names)));
  }

  private async versionDto(row: VersionRow, names: Map<number, string>): Promise<CatalogSpecVersionDto> {
    const content = rowContent(row);
    return {
      id: row.id,
      goodId: row.goodId,
      version: row.version,
      source: row.source as CatalogSpecVersionSource,
      comment: row.comment,
      authorName: row.authorId != null ? names.get(row.authorId) ?? null : null,
      approvedByName: row.approvedById != null ? names.get(row.approvedById) ?? null : null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      specQty: content.specQty,
      components: await this.enrich(row.goodId, content),
    };
  }

  async listDrafts(): Promise<CatalogSpecDraftListItem[]> {
    const drafts = await prisma.catalogSpecDraft.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { good: { select: { name: true, sku: true } } },
    });
    const names = await this.userNames(drafts.map((d) => d.authorId));
    return drafts.map((d) => ({
      goodId: d.goodId,
      goodName: d.good.name,
      goodSku: d.good.sku,
      status: d.status as CatalogSpecDraftStatus,
      comment: d.comment,
      authorName: d.authorId != null ? names.get(d.authorId) ?? null : null,
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  // ─── версії ───────────────────────────────────────────────────────────────

  private async createVersion(input: {
    goodId: string;
    content: CatalogSpecContent;
    source: CatalogSpecVersionSource;
    comment?: string | null;
    authorId?: number | null;
    approvedById?: number | null;
    contentReviewPending?: boolean;
  }): Promise<number> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const agg = await tx.catalogSpecVersion.aggregate({
            where: { goodId: input.goodId },
            _max: { version: true },
          });
          const version = (agg._max.version ?? 0) + 1;
          await tx.catalogSpecVersion.create({
            data: {
              goodId: input.goodId,
              version,
              specQty: input.content.specQty,
              componentsJson: input.content.components as unknown as Prisma.InputJsonValue,
              source: input.source,
              comment: input.comment?.trim() || null,
              authorId: input.authorId ?? null,
              approvedById: input.approvedById ?? null,
              approvedAt: input.approvedById != null || input.source === 'dilovod' ? new Date() : null,
              contentReviewPending: input.contentReviewPending ?? false,
            },
          });
          if (input.contentReviewPending) {
            await tx.catalogSpecVersion.updateMany({
              where: { goodId: input.goodId, version: { lt: version } },
              data: { contentReviewPending: false },
            });
          }
          return version;
        });
        await this.emitVersionCreated({ goodId: input.goodId, version: created, source: input.source });
        return created;
      } catch (error) {
        // Паралельний запис тієї ж версії (unique goodId+version) – пробуємо ще раз.
        if (attempt < 2 && (error as { code?: string })?.code === 'P2002') continue;
        throw error;
      }
    }
  }

  /** Лінива v1: фіксує специфікацію до першої зміни, щоб до неї можна було відкотитись. */
  async ensureBaseline(goodId: string, content?: CatalogSpecContent): Promise<number> {
    const current = await this.currentVersion(goodId);
    if (current != null) return current;
    const base = content ?? (await this.readApprovedContent(goodId));
    try {
      return await this.createVersion({ goodId, content: base, source: 'initial' });
    } catch (error) {
      const after = await this.currentVersion(goodId);
      if (after != null) return after;
      throw error;
    }
  }

  async ackContentReview(goodId: string): Promise<void> {
    await prisma.catalogSpecVersion.updateMany({
      where: { goodId, contentReviewPending: true },
      data: { contentReviewPending: false },
    });
  }

  // ─── чернетка ─────────────────────────────────────────────────────────────

  async saveDraft(
    goodId: string,
    content: CatalogSpecContent,
    comment: string,
    userId: number | null,
    options: { restoredFromVersion?: number | null } = {},
  ): Promise<CatalogSpecStateDto> {
    const text = comment.trim();
    if (!text) {
      throw new CatalogSpecError('Опишіть зміни специфікації в коментарі', 400, CATALOG_SPEC_ERROR_CODES.COMMENT_REQUIRED);
    }
    const good = await this.loadGood(goodId);
    if (good.isGroup) throw new CatalogSpecError('Папка не має специфікації');
    const approved = this.approvedContent(good);
    if (specContentEquals(content, approved)) {
      throw new CatalogSpecError('Чернетка не відрізняється від чинної специфікації', 400, CATALOG_SPEC_ERROR_CODES.NO_CHANGES);
    }
    const baseVersion = await this.ensureBaseline(goodId, approved);
    const existing = await prisma.catalogSpecDraft.findUnique({ where: { goodId } });
    const data = {
      specQty: content.specQty,
      componentsJson: content.components as unknown as Prisma.InputJsonValue,
      comment: text,
      status: 'pending',
      lastEditedById: userId,
      reviewedById: null,
      reviewedAt: null,
      rejectReason: null,
    };
    if (existing) {
      await prisma.catalogSpecDraft.update({
        where: { goodId },
        data: {
          ...data,
          ...(options.restoredFromVersion !== undefined ? { restoredFromVersion: options.restoredFromVersion } : {}),
        },
      });
    } else {
      await prisma.catalogSpecDraft.create({
        data: {
          ...data,
          goodId,
          baseVersion,
          authorId: userId,
          restoredFromVersion: options.restoredFromVersion ?? null,
        },
      });
    }

    const diff = diffSpecContent(goodId, approved, content);
    await catalogGoodAuditService.logEvent({
      goodId,
      action: CATALOG_AUDIT_ACTIONS.SPEC_DRAFT_SAVED,
      userId,
      payload: diff ?? undefined,
      meta: {
        comment: text,
        ...(options.restoredFromVersion != null ? { restoredFromVersion: options.restoredFromVersion } : {}),
      },
    });
    await this.notifyApprovers(goodId, good.name, userId, text, Boolean(existing));
    return this.getState(goodId);
  }

  async discardDraft(goodId: string, actor: CatalogSpecActor): Promise<CatalogSpecStateDto> {
    const draft = await prisma.catalogSpecDraft.findUnique({ where: { goodId } });
    if (!draft) throw new CatalogSpecError('Чернетку не знайдено', 404);
    if (!actor.canApprove && draft.authorId !== actor.userId) {
      throw new CatalogSpecError('Видалити чернетку може її автор або той, хто затверджує', 403);
    }
    await prisma.catalogSpecDraft.delete({ where: { goodId } });
    await catalogGoodAuditService.logEvent({
      goodId,
      action: CATALOG_AUDIT_ACTIONS.SPEC_DRAFT_DISCARDED,
      userId: actor.userId,
      meta: { comment: draft.comment },
    });
    return this.getState(goodId);
  }

  async reject(goodId: string, userId: number | null, reason: string): Promise<CatalogSpecStateDto> {
    const text = reason.trim();
    if (!text) throw new CatalogSpecError('Вкажіть причину відхилення');
    const draft = await prisma.catalogSpecDraft.findUnique({ where: { goodId } });
    if (!draft) throw new CatalogSpecError('Чернетку не знайдено', 404);
    if (draft.status !== 'pending') throw new CatalogSpecError('Чернетка вже відхилена');
    await prisma.catalogSpecDraft.update({
      where: { goodId },
      data: { status: 'rejected', reviewedById: userId, reviewedAt: new Date(), rejectReason: text },
    });
    await catalogGoodAuditService.logEvent({
      goodId,
      action: CATALOG_AUDIT_ACTIONS.SPEC_REJECTED,
      userId,
      meta: { comment: draft.comment, rejectReason: text },
    });
    const good = await prisma.catalogGood.findUnique({ where: { id: goodId }, select: { name: true } });
    await this.notify({
      recipients: draft.authorId != null ? [draft.authorId] : [],
      actorId: userId,
      status: 'warning',
      event: 'specResult',
      title: 'Специфікацію відхилено',
      message: `«${good?.name ?? goodId}»: ${text}`,
      goodId,
    });
    return this.getState(goodId);
  }

  async approve(goodId: string, userId: number | null, options: { force?: boolean } = {}): Promise<CatalogSpecStateDto> {
    const draft = await prisma.catalogSpecDraft.findUnique({ where: { goodId } });
    if (!draft) throw new CatalogSpecError('Чернетку не знайдено', 404);
    if (draft.status !== 'pending') throw new CatalogSpecError('Відхилену чернетку спершу має оновити автор');
    const current = await this.currentVersion(goodId);
    if ((current ?? 0) !== draft.baseVersion && !options.force) {
      throw new CatalogSpecError(
        'Чинну специфікацію змінено після створення чернетки. Перегляньте зміни й затвердіть повторно.',
        409,
        CATALOG_SPEC_ERROR_CODES.DRAFT_STALE,
      );
    }
    const content = rowContent(draft);
    const version = await this.applyContent(goodId, content, {
      userId,
      source: draft.restoredFromVersion != null ? 'rollback' : 'ui',
      authorId: draft.authorId,
      comment: draft.comment,
      auditAction: CATALOG_AUDIT_ACTIONS.SPEC_APPROVED,
      auditMeta: {
        comment: draft.comment,
        ...(draft.restoredFromVersion != null ? { restoredFromVersion: draft.restoredFromVersion } : {}),
      },
    });
    await prisma.catalogSpecDraft.delete({ where: { goodId } }).catch(() => undefined);
    const good = await prisma.catalogGood.findUnique({ where: { id: goodId }, select: { name: true } });
    await this.notify({
      recipients: draft.authorId != null ? [draft.authorId] : [],
      actorId: userId,
      status: 'success',
      event: 'specResult',
      title: 'Специфікацію затверджено',
      message: `«${good?.name ?? goodId}» – версія ${version}`,
      goodId,
    });
    return this.getState(goodId);
  }

  /**
   * Відкат до версії: затверджувач – одразу нова версія; інші – чернетка на затвердження.
   */
  async restore(goodId: string, version: number, actor: CatalogSpecActor, comment: string): Promise<CatalogSpecStateDto> {
    const row = await prisma.catalogSpecVersion.findUnique({ where: { goodId_version: { goodId, version } } });
    if (!row) throw new CatalogSpecError('Версію не знайдено', 404);
    if (await prisma.catalogSpecDraft.findUnique({ where: { goodId }, select: { id: true } })) {
      throw new CatalogSpecError(
        'Для товару вже є чернетка специфікації – затвердьте, відхиліть або видаліть її',
        409,
        CATALOG_SPEC_ERROR_CODES.DRAFT_EXISTS,
      );
    }
    const content = rowContent(row);
    const approved = await this.readApprovedContent(goodId);
    if (specContentEquals(content, approved)) {
      throw new CatalogSpecError('Ця версія збігається з чинною специфікацією', 400, CATALOG_SPEC_ERROR_CODES.NO_CHANGES);
    }
    const text = comment.trim() || `Відкат до версії ${version}`;
    if (!actor.canApprove) {
      return this.saveDraft(goodId, content, text, actor.userId, { restoredFromVersion: version });
    }
    await this.applyContent(goodId, content, {
      userId: actor.userId,
      source: 'rollback',
      authorId: actor.userId,
      comment: text,
      auditAction: CATALOG_AUDIT_ACTIONS.SPEC_APPROVED,
      auditMeta: { comment: text, restoredFromVersion: version },
    });
    return this.getState(goodId);
  }

  /** Записати специфікацію в Dilovod + локально і зафіксувати нову версію. */
  private async applyContent(
    goodId: string,
    content: CatalogSpecContent,
    options: {
      userId: number | null;
      source: CatalogSpecVersionSource;
      authorId: number | null;
      comment: string | null;
      auditAction: string;
      auditMeta: Record<string, unknown>;
    },
  ): Promise<number> {
    const approved = await this.readApprovedContent(goodId);
    await this.ensureBaseline(goodId, approved);
    const nextVersion = ((await this.currentVersion(goodId)) ?? 0) + 1;
    await catalogGoodAuditService.track(
      {
        action: options.auditAction,
        ids: [goodId],
        userId: options.userId,
        source: 'ui',
        always: true,
        meta: { ...options.auditMeta, specVersion: nextVersion },
      },
      () =>
        productsCatalogService.updateGood(goodId, {
          components: content.components.map((c) => ({
            componentGoodId: c.componentGoodId,
            qty: c.qty,
            rowNum: c.rowNum,
            unitId: c.unitId,
            note: c.note,
            cookingLossPercent: c.cookingLossPercent,
            losses: c.losses ?? null,
            rowKey: c.rowKey ?? null,
            qtyFormula: c.qtyFormula ?? null,
          })),
          ...(content.specQty != null ? { specQty: content.specQty } : {}),
        }),
    );
    return this.createVersion({
      goodId,
      content,
      source: options.source,
      comment: options.comment,
      authorId: options.authorId,
      approvedById: options.userId,
      contentReviewPending: true,
    });
  }

  // ─── інтеграція з PUT /goods/:id ──────────────────────────────────────────

  /**
   * Розбирає збереження картки: для затверджувача – пряме збереження + версія,
   * для інших – специфікація прибирається з input і йде в чернетку.
   * Валідація (коментар, конфлікт із чернеткою) – до запису, щоб не зберегти половину.
   */
  async prepareUpdate(
    goodId: string,
    input: CatalogUpdateGoodInput,
    actor: CatalogSpecActor,
  ): Promise<{ input: CatalogUpdateGoodInput; afterSave: () => Promise<void> }> {
    const { specComment, specDraftEdit, ...rest } = input;
    const tasks: Array<() => Promise<void>> = [];
    const stripSpec = (): CatalogUpdateGoodInput => {
      const { components: _c, specQty: _q, ...withoutSpec } = rest;
      return withoutSpec;
    };

    const good = await this.loadGood(goodId);
    if (
      (rest.productIngredientsJson !== undefined &&
        jsonSignature(rest.productIngredientsJson) !== jsonSignature(good.productIngredientsJson)) ||
      (rest.productNutritionJson !== undefined &&
        jsonSignature(rest.productNutritionJson) !== jsonSignature(good.productNutritionJson))
    ) {
      tasks.push(() => this.ackContentReview(goodId));
    }
    const afterSave = async () => {
      for (const task of tasks) {
        try {
          await task();
        } catch (error) {
          logServer('[catalog-spec] after-save task failed', { goodId, error });
          throw error;
        }
      }
    };

    const specInBody = rest.components !== undefined || rest.specQty !== undefined;
    if (good.isGroup || !specInBody) return { input: rest, afterSave };

    const approved = this.approvedContent(good);
    const accPolicyId = rest.accPolicyId ?? good.accPolicyId;
    const next = await this.contentFromInput(
      rest.components ?? approved.components,
      rest.specQty !== undefined ? rest.specQty : approved.specQty,
      accPolicyId,
    );
    const draft = await prisma.catalogSpecDraft.findUnique({ where: { goodId } });
    const sameAsApproved = specContentEquals(next, approved);
    const sameAsDraft = draft ? specContentEquals(next, rowContent(draft)) : false;
    const comment = specComment?.trim() || '';

    if (sameAsApproved) return { input: stripSpec(), afterSave };
    if (draft && !specDraftEdit) {
      throw new CatalogSpecError(
        'Для товару є чернетка специфікації. Відкрийте її для редагування або спершу затвердьте / відхиліть.',
        409,
        CATALOG_SPEC_ERROR_CODES.DRAFT_EXISTS,
      );
    }

    if (actor.canApprove) {
      // Затверджувач без змін у завантаженій чернетці – лише інші поля; затвердження окремою кнопкою.
      if (draft && sameAsDraft) return { input: stripSpec(), afterSave };
      tasks.push(async () => {
        const version = await this.createVersion({
          goodId,
          content: await this.readApprovedContent(goodId),
          source: 'ui',
          comment: comment || draft?.comment || null,
          authorId: draft?.authorId ?? actor.userId,
          approvedById: actor.userId,
          contentReviewPending: true,
        });
        await catalogGoodAuditService.logEvent({
          goodId,
          action: CATALOG_AUDIT_ACTIONS.SPEC_VERSION_RECORDED,
          userId: actor.userId,
          meta: { specVersion: version, ...(comment || draft?.comment ? { comment: comment || draft?.comment } : {}) },
        });
        if (draft) {
          await prisma.catalogSpecDraft.delete({ where: { goodId } }).catch(() => undefined);
          await this.notify({
            recipients: draft.authorId != null ? [draft.authorId] : [],
            actorId: actor.userId,
            status: 'success',
            event: 'specResult',
            title: 'Специфікацію затверджено з правками',
            message: `«${good.name}» – версія ${version}`,
            goodId,
          });
        }
      });
      // Лінива v1 до запису, щоб зафіксувати стан «до».
      await this.ensureBaseline(goodId, approved);
      return { input: rest, afterSave };
    }

    if (draft && sameAsDraft && !comment) return { input: stripSpec(), afterSave };
    const draftComment = comment || draft?.comment || '';
    if (!draftComment) {
      throw new CatalogSpecError(
        'Опишіть зміни специфікації в коментарі',
        400,
        CATALOG_SPEC_ERROR_CODES.COMMENT_REQUIRED,
      );
    }
    tasks.push(async () => {
      await this.saveDraft(goodId, next, draftComment, actor.userId);
    });
    return { input: stripSpec(), afterSave };
  }

  /** Специфікацію змінено в Dilovod напряму – приймаємо автоматично як нову версію. */
  async recordExternalChange(
    goodId: string,
    before: CatalogGoodAuditSnapshot | null,
    after: CatalogGoodAuditSnapshot | null,
  ): Promise<void> {
    const prev = snapshotContent(before);
    const next = snapshotContent(after);
    // Новий товар з Dilovod – версій ще немає, v1 зʼявиться ліниво.
    if (!prev || !next || after?.fields.isGroup === true) return;
    if (specContentEquals(prev, next)) return;
    await this.ensureBaseline(goodId, prev);
    const version = await this.createVersion({
      goodId,
      content: next,
      source: 'dilovod',
      comment: 'Змінено в Dilovod',
      contentReviewPending: true,
    });
    await catalogGoodAuditService.logEvent({
      goodId,
      action: CATALOG_AUDIT_ACTIONS.SPEC_VERSION_RECORDED,
      userId: null,
      source: 'dilovod',
      meta: { specVersion: version },
    });
  }

  // ─── сповіщення ───────────────────────────────────────────────────────────

  private async approverIds(): Promise<number[]> {
    const roles = await prisma.rolePermission.findMany({
      where: { permissionKey: PERMISSIONS.ACTION_PRODUCTS_APPROVE_SPEC },
      select: { role: { select: { slug: true } } },
    });
    const slugs = [ADMIN_ROLE_SLUG, ...roles.map((r) => r.role.slug)];
    const users = await prisma.user.findMany({
      where: { role: { in: slugs }, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async notifyApprovers(
    goodId: string,
    goodName: string,
    actorId: number | null,
    comment: string,
    updated: boolean,
  ): Promise<void> {
    try {
      await this.notify({
        recipients: await this.approverIds(),
        actorId,
        status: 'warning',
        event: 'specReview',
        title: updated ? 'Оновлено чернетку специфікації' : 'Специфікація чекає на затвердження',
        message: `«${goodName}»: ${comment}`,
        goodId,
      });
    } catch (error) {
      logServer('[catalog-spec] notify approvers failed', { goodId, error });
    }
  }

  private async notify(input: {
    recipients: number[];
    /** Подія адресного сповіщення: роль адресата може вимкнути її канали. */
    event: NotificationDirectEventId;
    actorId: number | null;
    status: 'warning' | 'success';
    title: string;
    message: string;
    goodId: string;
  }): Promise<void> {
    const recipients = [...new Set(input.recipients)].filter((id) => id !== input.actorId);
    if (recipients.length === 0) return;
    try {
      await prisma.meta_logs.create({
        data: {
          category: NOTIFY_CATEGORY,
          status: input.status,
          title: input.title,
          message: input.message.slice(0, 2000),
          data: { recipients, event: input.event, goodId: input.goodId, link: goodLink(input.goodId) },
          initiatedBy: input.actorId != null ? String(input.actorId) : 'system:catalog-spec',
        },
      });
    } catch (error) {
      logServer('[catalog-spec] notification failed', { goodId: input.goodId, error });
    }
  }
}

export const catalogSpecService = new CatalogSpecService();

catalogGoodAuditService.onExternalSpecChange((goodId, before, after) =>
  catalogSpecService.recordExternalChange(goodId, before, after),
);
