/**
 * Techcards (phase 2a: read side).
 *
 * A techcard is 1:1 with a finished good. Ingredients are the good's spec rows (CatalogSpecVersion /
 * CatalogSpecDraft); the techcard stores only the recipe on top of them (stages, packaging, dosing,
 * notes) in TechCardVersion / TechCardDraft `payloadJson`. Current version = max(version).
 */

import type { TechCardDraft, TechCardVersion } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import { CATALOG_ACC_POLICY_GOOD } from '../../../shared/types/catalog.js';
import type {
  TechCardDetailDto,
  TechCardDraftDto,
  TechCardListItemDto,
  TechCardStatus,
  TechCardVersionDto,
  TechCardVersionSource,
} from '../../../shared/types/production.js';
import { normalizeTechCardPayload } from '../../../shared/utils/techCardPayload.js';
import { isArchiveFolderName } from '../../../shared/utils/storefrontDescription.js';
import { getFinishedProductsFolderIds } from '../Products/catalogFinishedProductsFolder.js';
import { catalogSpecService } from '../Products/CatalogSpecService.js';
import { productsCatalogService } from '../Products/ProductsCatalogService.js';
import { productionSettingsService } from './ProductionSettingsService.js';

export class TechCardError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

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

    return {
      goodId,
      status: resolveStatus(current != null, draft),
      good,
      spec,
      units: dictionaries.units,
      current: currentDto,
      draft: draftDtoValue,
      lossFormula: override ?? settings.lossFormula,
    };
  }

  async listVersions(goodId: string): Promise<TechCardVersionDto[]> {
    const rows = await prisma.techCardVersion.findMany({ where: { goodId }, orderBy: { version: 'desc' } });
    const names = await userNames(rows.flatMap((r) => [r.authorId, r.approvedById]));
    return rows.map((r) => versionDto(r, names));
  }
}

export const techCardService = new TechCardService();
