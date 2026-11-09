/**
 * Techcards.
 *
 * A techcard is 1:1 with a finished good. Ingredients are the good's spec rows (CatalogSpecVersion /
 * CatalogSpecDraft); the techcard stores only the recipe on top of them (stages, packaging, dosing,
 * notes) in TechCardVersion / TechCardDraft `payloadJson`. Current version = max(version).
 *
 * Moderation mirrors the spec: editors save a draft and submit it; an approver approves the pair
 * (pending spec draft + techcard draft) as spec version N + techcard version M linked to N.
 * A new spec version without a pending techcard draft gets an automatic techcard version (same recipe).
 */

import type { Prisma, TechCardDraft, TechCardVersion } from '@prisma/client';
import { logServer, prisma } from '../../lib/utils.js';
import { auditLogService } from '../../services/AuditLogService.js';
import { CATALOG_ACC_POLICY_GOOD, type CatalogGoodComponentDto } from '../../../shared/types/catalog.js';
import type {
  TechCardDetailDto,
  TechCardDraftDto,
  TechCardListItemDto,
  TechCardStatus,
  TechCardVersionDto,
  TechCardVersionSource,
} from '../../../shared/types/production.js';
import { normalizeTechCardPayload } from '../../../shared/utils/techCardPayload.js';
import { newRowKey } from '../../../shared/utils/catalogRowKey.js';
import type { TechCardPayload } from '../../../shared/types/production.js';
import { isArchiveFolderName } from '../../../shared/utils/storefrontDescription.js';
import { getFinishedProductsFolderIds } from '../Products/catalogFinishedProductsFolder.js';
import {
  CatalogSpecError,
  catalogSpecService,
  type CatalogSpecVersionCreatedEvent,
} from '../Products/CatalogSpecService.js';
import { CATALOG_SPEC_ERROR_CODES } from '../../../shared/types/catalogSpec.js';
import { hasDerivedRows, recalcDerivedRows } from '../../../shared/utils/catalogQtyFormula.js';
import { specContentFromDetail } from '../../../shared/utils/catalogSpecContent.js';
import { productsCatalogService } from '../Products/ProductsCatalogService.js';
import { productionSettingsService } from './ProductionSettingsService.js';

export class TechCardError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const TECH_CARD_AUDIT_ENTITY = 'techCard';

const VERSION_SOURCES: readonly TechCardVersionSource[] = ['ui', 'auto', 'rollback'];
const DRAFT_STATUSES = ['editing', 'pending', 'rejected'] as const;
type DraftStatus = (typeof DRAFT_STATUSES)[number];

function draftStatus(value: string): DraftStatus {
  return (DRAFT_STATUSES as readonly string[]).includes(value) ? (value as DraftStatus) : 'editing';
}

function resolveStatus(hasVersion: boolean, draft: { status: string } | null): TechCardStatus {
  if (draft) return draftStatus(draft.status);
  return hasVersion ? 'approved' : 'none';
}

async function userNames(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((v): v is number => v != null))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

function versionDto(row: TechCardVersion, names: Map<number, string>): TechCardVersionDto {
  return {
    version: row.version,
    specVersion: row.specVersion,
    source: (VERSION_SOURCES as readonly string[]).includes(row.source)
      ? (row.source as TechCardVersionSource)
      : 'ui',
    comment: row.comment,
    authorName: row.authorId != null ? names.get(row.authorId) ?? null : null,
    approvedByName: row.approvedById != null ? names.get(row.approvedById) ?? null : null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    payload: normalizeTechCardPayload(row.payloadJson),
  };
}

function draftDto(row: TechCardDraft, names: Map<number, string>): TechCardDraftDto {
  return {
    baseVersion: row.baseVersion,
    status: draftStatus(row.status),
    comment: row.comment,
    authorName: row.authorId != null ? names.get(row.authorId) ?? null : null,
    lastEditedByName: row.lastEditedById != null ? names.get(row.lastEditedById) ?? null : null,
    rejectReason: row.rejectReason,
    updatedAt: row.updatedAt.toISOString(),
    payload: normalizeTechCardPayload(row.payloadJson),
  };
}

/**
 * Рядки специфікації без `rowKey` (перезаписані кодом, що ще не знає про ключі) отримують нові ключі,
 * інакше їх не можна вибрати в етапах і дозуванні техкарти.
 */
async function ensureComponentRowKeys(goodId: string): Promise<void> {
  const missing = await prisma.catalogGoodComponent.findMany({
    where: { parentGoodId: goodId, rowKey: null },
    select: { id: true },
  });
  if (missing.length === 0) return;
  logServer(`[TechCards] ${goodId}: ${missing.length} spec rows without rowKey, backfilling`);
  await prisma.$transaction(
    missing.map((row) =>
      prisma.catalogGoodComponent.update({ where: { id: row.id }, data: { rowKey: newRowKey() } }),
    ),
  );
}

class TechCardService {
  /** Готова продукція (не набори, не архів, не папки «Архів – …») зі статусом техкарти. */
  async list(): Promise<TechCardListItemDto[]> {
    const branchIds = [...(await getFinishedProductsFolderIds())];
    // Архівні товари лежать у папках «Архів – …» (archivedAt є не в усіх старих записів)
    const branchFolders = await prisma.catalogGood.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const folderIds = branchFolders.filter((f) => !isArchiveFolderName(f.name)).map((f) => f.id);
    const goods = await prisma.catalogGood.findMany({
      where: {
        isGroup: false,
        delMark: false,
        archivedAt: null,
        parentId: { in: folderIds },
        accPolicyId: CATALOG_ACC_POLICY_GOOD,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        parentId: true,
        specQty: true,
        _count: { select: { components: true } },
        specDraft: { select: { status: true } },
        techCardDraft: { select: { status: true, payloadJson: true, updatedAt: true } },
      },
      orderBy: { name: 'asc' },
    });
    if (goods.length === 0) return [];

    const goodIds = goods.map((g) => g.id);
    const parentIds = [...new Set(goods.map((g) => g.parentId).filter((v): v is string => v != null))];
    const [folders, specMax, techMax] = await Promise.all([
      prisma.catalogGood.findMany({ where: { id: { in: parentIds } }, select: { id: true, name: true } }),
      prisma.catalogSpecVersion.groupBy({
        by: ['goodId'],
        where: { goodId: { in: goodIds } },
        _max: { version: true },
      }),
      prisma.techCardVersion.groupBy({
        by: ['goodId'],
        where: { goodId: { in: goodIds } },
        _max: { version: true },
      }),
    ]);
    const folderName = new Map(folders.map((f) => [f.id, f.name]));
    const specVersionByGood = new Map(specMax.map((r) => [r.goodId, r._max.version]));
    const techVersionByGood = new Map(techMax.map((r) => [r.goodId, r._max.version]));

    const currentKeys = [...techVersionByGood.entries()]
      .filter((e): e is [string, number] => e[1] != null)
      .map(([goodId, version]) => ({ goodId, version }));
    const currentRows = currentKeys.length
      ? await prisma.techCardVersion.findMany({
          where: { OR: currentKeys },
          select: { goodId: true, payloadJson: true, approvedAt: true, createdAt: true },
        })
      : [];
    const currentByGood = new Map(currentRows.map((r) => [r.goodId, r]));

    return goods.map((g) => {
      const current = currentByGood.get(g.id) ?? null;
      const draft = g.techCardDraft;
      const payload = normalizeTechCardPayload(draft?.payloadJson ?? current?.payloadJson ?? null);
      const updatedAt = draft?.updatedAt ?? current?.approvedAt ?? current?.createdAt ?? null;
      return {
        goodId: g.id,
        name: g.name,
        sku: g.sku,
        folderName: g.parentId ? folderName.get(g.parentId) ?? null : null,
        componentsCount: g._count.components,
        specQty: g.specQty,
        specVersion: specVersionByGood.get(g.id) ?? null,
        specDraftStatus: g.specDraft?.status ?? null,
        techCardVersion: techVersionByGood.get(g.id) ?? null,
        status: resolveStatus(current != null, draft),
        stagesCount: payload.stages.length,
        updatedAt: updatedAt?.toISOString() ?? null,
      };
    });
  }

  async getDetail(goodId: string): Promise<TechCardDetailDto> {
    await ensureComponentRowKeys(goodId);
    const good = await productsCatalogService.getGoodDetail(goodId, { livePull: false });
    if (!good || good.isGroup) throw new TechCardError('Товар не знайдено', 404);

    const [spec, dictionaries, current, draft, settings] = await Promise.all([
      catalogSpecService.getState(goodId),
      productsCatalogService.getDictionaries(),
      prisma.techCardVersion.findFirst({ where: { goodId }, orderBy: { version: 'desc' } }),
      prisma.techCardDraft.findUnique({ where: { goodId } }),
      productionSettingsService.getSettings(),
    ]);
    const names = await userNames([
      current?.authorId,
      current?.approvedById,
      draft?.authorId,
      draft?.lastEditedById,
    ]);
    const currentDto = current ? versionDto(current, names) : null;
    const draftDtoValue = draft ? draftDto(draft, names) : null;
    const override = (draftDtoValue ?? currentDto)?.payload.lossFormula ?? null;
    const packagingIds = [
      ...new Set([...(currentDto?.payload.packaging ?? []), ...(draftDtoValue?.payload.packaging ?? [])].map((p) => p.goodId)),
    ];
    const packagingGoods = packagingIds.length
      ? await prisma.catalogGood.findMany({ where: { id: { in: packagingIds } }, select: { id: true, name: true, sku: true } })
      : [];

    return {
      goodId,
      status: resolveStatus(current != null, draft),
      good,
      spec,
      units: dictionaries.units,
      current: currentDto,
      draft: draftDtoValue,
      lossFormula: override ?? settings.lossFormula,
      goodNames: Object.fromEntries(packagingGoods.map((g) => [g.id, { name: g.name, sku: g.sku }])),
    };
  }

  async listVersions(goodId: string): Promise<TechCardVersionDto[]> {
    const rows = await prisma.techCardVersion.findMany({ where: { goodId }, orderBy: { version: 'desc' } });
    const names = await userNames(rows.flatMap((r) => [r.authorId, r.approvedById]));
    return rows.map((r) => versionDto(r, names));
  }

  // ─── редагування і затвердження ───────────────────────────────────────────

  private async ensureGood(goodId: string): Promise<{ name: string }> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { name: true, isGroup: true },
    });
    if (!good || good.isGroup) throw new TechCardError('Товар не знайдено', 404);
    return good;
  }

  private async currentVersionRow(goodId: string) {
    return prisma.techCardVersion.findFirst({ where: { goodId }, orderBy: { version: 'desc' } });
  }

  private audit(goodId: string, action: string, userId: number | null, payload?: Record<string, unknown>) {
    return auditLogService.log({
      entityType: TECH_CARD_AUDIT_ENTITY,
      entityId: goodId,
      action,
      userId,
      payload: payload as Prisma.InputJsonValue | undefined,
    });
  }

  /** Зберегти чернетку (етапи, пакування, дозування, примітки). Повертає до статусу «Чернетка». */
  async saveDraft(goodId: string, rawPayload: unknown, userId: number | null): Promise<TechCardDetailDto> {
    await this.ensureGood(goodId);
    const payload = normalizeTechCardPayload(rawPayload);
    const stageNames = payload.stages.map((st) => st.name.trim());
    if (stageNames.some((name) => !name)) throw new TechCardError('Вкажіть назву кожного етапу');
    const [existing, current] = await Promise.all([
      prisma.techCardDraft.findUnique({ where: { goodId } }),
      this.currentVersionRow(goodId),
    ]);
    const data = {
      payloadJson: payload as unknown as Prisma.InputJsonValue,
      status: 'editing',
      lastEditedById: userId,
      reviewedById: null,
      reviewedAt: null,
      rejectReason: null,
    };
    if (existing) {
      await prisma.techCardDraft.update({ where: { goodId }, data });
    } else {
      await prisma.techCardDraft.create({
        data: { ...data, goodId, baseVersion: current?.version ?? null, authorId: userId },
      });
    }
    await this.audit(goodId, existing ? 'draftUpdated' : 'draftCreated', userId, {
      stages: payload.stages.length,
      packaging: payload.packaging.length,
      dosing: payload.dosing.length,
    });
    return this.getDetail(goodId);
  }

  async discardDraft(goodId: string, userId: number | null): Promise<TechCardDetailDto> {
    const draft = await prisma.techCardDraft.findUnique({ where: { goodId } });
    if (!draft) throw new TechCardError('Чернетку не знайдено', 404);
    await prisma.techCardDraft.delete({ where: { goodId } });
    await this.audit(goodId, 'draftDiscarded', userId);
    return this.getDetail(goodId);
  }

  /** Подати чернетку на затвердження (у парі з чернеткою специфікації, якщо вона є). */
  async submit(goodId: string, comment: string, userId: number | null): Promise<TechCardDetailDto> {
    const text = comment.trim();
    if (!text) throw new TechCardError('Опишіть зміни техкарти в коментарі');
    const draft = await prisma.techCardDraft.findUnique({ where: { goodId } });
    if (!draft) throw new TechCardError('Чернетку не знайдено', 404);
    await prisma.techCardDraft.update({
      where: { goodId },
      data: { status: 'pending', comment: text, lastEditedById: userId, rejectReason: null },
    });
    await this.audit(goodId, 'submitted', userId, { comment: text });
    return this.getDetail(goodId);
  }

  /**
   * Затвердити пару: чернетка специфікації (якщо на затвердженні) → версія N,
   * чернетка техкарти → версія M+1 з посиланням на N.
   */
  async approve(goodId: string, userId: number | null): Promise<TechCardDetailDto> {
    const draft = await prisma.techCardDraft.findUnique({ where: { goodId } });
    if (!draft) throw new TechCardError('Чернетку не знайдено', 404);
    if (draft.status !== 'pending') throw new TechCardError('Чернетку ще не подано на затвердження');
    const payload = normalizeTechCardPayload(draft.payloadJson);
    await this.syncDerivedRows(goodId, payload.batchPortions, userId);

    const specDraft = await prisma.catalogSpecDraft.findUnique({ where: { goodId }, select: { status: true } });
    if (specDraft?.status === 'pending') {
      // Помилка (застаріла чернетка специфікації, Dilovod) зупиняє затвердження всієї пари.
      await catalogSpecService.approve(goodId, userId);
    }
    const specVersion = await catalogSpecService.currentVersion(goodId);
    const version = await this.createVersion({
      goodId,
      payload,
      specVersion,
      source: 'ui',
      comment: draft.comment,
      authorId: draft.authorId,
      approvedById: userId,
    });
    await prisma.techCardDraft.delete({ where: { goodId } }).catch(() => undefined);
    await this.audit(goodId, 'approved', userId, { version, specVersion, comment: draft.comment });
    return this.getDetail(goodId);
  }

  /**
   * Похідні рядки специфікації рахуються на N порцій техкарти. Якщо з новим N їхня кількість інша,
   * перераховані рядки йдуть у чернетку специфікації пари (вона затверджується разом із техкартою).
   */
  private async syncDerivedRows(goodId: string, batchPortions: number, userId: number | null): Promise<void> {
    const state = await catalogSpecService.getState(goodId);
    const pending = state.draft?.status === 'pending' ? state.draft : null;
    let base: { specQty: number | null; components: CatalogGoodComponentDto[] } | null = pending;
    if (!base) {
      const good = await productsCatalogService.getGoodDetail(goodId, { livePull: false });
      base = good ? { specQty: good.specQty, components: good.components } : null;
    }
    if (!base || !hasDerivedRows(base.components)) return;
    const { units } = await productsCatalogService.getDictionaries();
    const next = recalcDerivedRows(base.components, units, base.specQty, batchPortions);
    if (next === base.components) return;
    const note = `Перерахунок похідних рядків на ${batchPortions} порцій (техкарта)`;
    try {
      await catalogSpecService.saveDraft(
        goodId,
        specContentFromDetail({ specQty: base.specQty, components: next }),
        pending?.comment ? `${pending.comment}\n${note}` : note,
        userId,
      );
    } catch (err) {
      if (err instanceof CatalogSpecError && err.code === CATALOG_SPEC_ERROR_CODES.NO_CHANGES) return;
      throw err;
    }
  }

  async reject(goodId: string, reason: string, userId: number | null): Promise<TechCardDetailDto> {
    const text = reason.trim();
    if (!text) throw new TechCardError('Вкажіть причину відхилення');
    const draft = await prisma.techCardDraft.findUnique({ where: { goodId } });
    if (!draft) throw new TechCardError('Чернетку не знайдено', 404);
    if (draft.status !== 'pending') throw new TechCardError('Чернетка не на затвердженні');
    await prisma.techCardDraft.update({
      where: { goodId },
      data: { status: 'rejected', reviewedById: userId, reviewedAt: new Date(), rejectReason: text },
    });
    const specDraft = await prisma.catalogSpecDraft.findUnique({ where: { goodId }, select: { status: true } });
    if (specDraft?.status === 'pending') await catalogSpecService.reject(goodId, userId, text);
    await this.audit(goodId, 'rejected', userId, { reason: text });
    return this.getDetail(goodId);
  }

  private async createVersion(input: {
    goodId: string;
    payload: TechCardPayload;
    specVersion: number | null;
    source: TechCardVersionSource;
    comment?: string | null;
    authorId?: number | null;
    approvedById?: number | null;
  }): Promise<number> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const agg = await prisma.techCardVersion.aggregate({
          where: { goodId: input.goodId },
          _max: { version: true },
        });
        const version = (agg._max.version ?? 0) + 1;
        await prisma.techCardVersion.create({
          data: {
            goodId: input.goodId,
            version,
            specVersion: input.specVersion,
            payloadJson: input.payload as unknown as Prisma.InputJsonValue,
            source: input.source,
            comment: input.comment?.trim() || null,
            authorId: input.authorId ?? null,
            approvedById: input.approvedById ?? null,
            approvedAt: input.approvedById != null ? new Date() : null,
          },
        });
        return version;
      } catch (error) {
        // Паралельний запис тієї ж версії (unique goodId+version) – пробуємо ще раз.
        if (attempt < 2 && (error as { code?: string })?.code === 'P2002') continue;
        throw error;
      }
    }
  }

  /** Нова версія специфікації без поданої чернетки техкарти → автоматична версія з тим самим рецептом. */
  async onSpecVersionCreated(event: CatalogSpecVersionCreatedEvent): Promise<void> {
    if (event.source === 'initial') return;
    const [current, draft] = await Promise.all([
      this.currentVersionRow(event.goodId),
      prisma.techCardDraft.findUnique({ where: { goodId: event.goodId }, select: { status: true } }),
    ]);
    if (!current || draft?.status === 'pending') return;
    if (current.specVersion === event.version) return;
    const version = await this.createVersion({
      goodId: event.goodId,
      payload: normalizeTechCardPayload(current.payloadJson),
      specVersion: event.version,
      source: 'auto',
      comment: `Нова версія специфікації v${event.version}`,
    });
    await this.audit(event.goodId, 'autoVersion', null, { version, specVersion: event.version });
    logServer(`[TechCardService] auto version ${version} for ${event.goodId} (spec v${event.version})`);
  }
}

export const techCardService = new TechCardService();
catalogSpecService.onVersionCreated((event) => techCardService.onSpecVersionCreated(event));
