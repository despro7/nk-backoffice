import { AsyncLocalStorage } from 'node:async_hooks';
import { lossEntriesKey, normalizeLossEntries } from '../../../shared/utils/catalogLoss.js';
import type { Prisma } from '@prisma/client';
import { logServer, prisma } from '../../lib/utils.js';
import { auditLogService, type AuditLogQuery } from '../../services/AuditLogService.js';
import { AUDIT_ENTITY, type AuditSource } from '../../../shared/constants/auditEntities.js';
import type { AuditLogPageDto } from '../../../shared/types/audit.js';
import type {
  CatalogAuditScalar,
  CatalogGoodAuditLogDto,
  CatalogGoodAuditPayload,
  CatalogGoodAuditSnapshot,
} from '../../../shared/types/catalogAudit.js';
import { catalogAuditTouchesSpec, diffCatalogGoodSnapshots } from '../../../shared/utils/catalogGoodAuditDiff.js';

export interface CatalogAuditActor {
  userId: number | null;
  source: AuditSource;
}

export interface CatalogAuditTrackOptions<T> extends CatalogAuditActor {
  action: string;
  /** Товари, які зачіпає дія (відомі до виконання). */
  ids: string[];
  /** Id, що зʼявились у результаті (create / duplicate). */
  resultIds?: (result: T) => string[];
  /** Писати запис навіть без змін полів (напр. «опубліковано наліпку»). */
  always?: boolean;
  meta?: Record<string, unknown>;
}

const SNAPSHOT_CHUNK = 500;

export type ExternalSpecChangeListener = (
  goodId: string,
  before: CatalogGoodAuditSnapshot | null,
  after: CatalogGoodAuditSnapshot | null,
) => Promise<void>;

/** Поля CatalogGood, що відстежуються як є. */
const TRACKED_FIELDS = [
  'name',
  'sku',
  'isGroup',
  'delMark',
  'mainUnitId',
  'packageRatio',
  'weight',
  'specQty',
  'accPolicyId',
  'printName',
  'description',
  'fullDescription',
  'doNotPublish',
  'productIngredientsJson',
  'productNutritionJson',
  'storefrontDescriptionDoc',
  'grossWeight',
  'mainProductWeight',
  'wooProductId',
  'unitRatio',
] as const;

type GoodRow = Prisma.CatalogGoodGetPayload<{
  include: {
    components: { include: { componentGood: { select: { name: true; sku: true } } } };
    prices: true;
    barcodes: true;
    images: true;
    portionLabelTemplate: { select: { name: true } };
    boxLabelTemplate: { select: { name: true } };
  };
}>;

function toScalar(value: unknown): CatalogAuditScalar {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

/**
 * Журнал змін товарів каталогу (entityType = catalog_good) поверх загального `audit_log`.
 * `track()` знімає знімок «до», виконує дію, знімає «після» і пише різницю.
 * Вкладені `track()` (напр. Dilovod-sync всередині збереження) не дублюють запис –
 * зміни потрапляють у зовнішню дію.
 */
export class CatalogGoodAuditService {
  private readonly context = new AsyncLocalStorage<CatalogAuditActor & { action: string }>();
  private externalSpecListener: ExternalSpecChangeListener | null = null;

  /** Специфікацію змінено в Dilovod (дія з source = dilovod) – модерація фіксує версію. */
  onExternalSpecChange(listener: ExternalSpecChangeListener): void {
    this.externalSpecListener = listener;
  }

  async loadSnapshots(ids: string[]): Promise<Map<string, CatalogGoodAuditSnapshot>> {
    const out = new Map<string, CatalogGoodAuditSnapshot>();
    const unique = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < unique.length; i += SNAPSHOT_CHUNK) {
      const chunk = unique.slice(i, i + SNAPSHOT_CHUNK);
      const rows: GoodRow[] = await prisma.catalogGood.findMany({
        where: { id: { in: chunk } },
        include: {
          components: {
            include: { componentGood: { select: { name: true, sku: true } } },
            orderBy: { rowNum: 'asc' },
          },
          prices: true,
          barcodes: true,
          images: { orderBy: { sortOrder: 'asc' } },
          portionLabelTemplate: { select: { name: true } },
          boxLabelTemplate: { select: { name: true } },
        },
      });

      const parentIds = [...new Set(rows.map((r) => r.parentId).filter((v): v is string => Boolean(v)))];
      const presetIds = [...new Set(rows.map((r) => r.storefrontPresetId).filter((v): v is string => Boolean(v)))];
      const [parents, presets] = await Promise.all([
        parentIds.length
          ? prisma.catalogGood.findMany({ where: { id: { in: parentIds } }, select: { id: true, name: true } })
          : Promise.resolve([]),
        presetIds.length
          ? prisma.catalogStorefrontPreset.findMany({ where: { id: { in: presetIds } }, select: { id: true, name: true } })
          : Promise.resolve([]),
      ]);
      const parentName = new Map(parents.map((p) => [p.id, p.name]));
      const presetName = new Map(presets.map((p) => [p.id, p.name]));

      for (const row of rows) {
        const fields: Record<string, CatalogAuditScalar> = {};
        for (const key of TRACKED_FIELDS) fields[key] = toScalar(row[key]);
        fields.parentName = row.parentId ? parentName.get(row.parentId) ?? row.parentId : null;
        fields.archivedAt = row.archivedAt ? row.archivedAt.toISOString().slice(0, 10) : null;
        fields.storefrontPresetName = row.storefrontPresetId
          ? presetName.get(row.storefrontPresetId) ?? row.storefrontPresetId
          : null;
        fields.portionLabelTemplateName = row.portionLabelTemplate?.name ?? null;
        fields.boxLabelTemplateName = row.boxLabelTemplate?.name ?? null;

        out.set(row.id, {
          id: row.id,
          fields,
          components: row.components.map((c) => ({
            componentGoodId: c.componentGoodId,
            name: c.componentGood?.name ?? c.componentGoodId,
            sku: c.componentGood?.sku ?? null,
            qty: c.qty,
            unitId: c.unitId,
            note: c.note,
            cookingLossPercent: c.cookingLossPercent ?? 0,
            losses: lossEntriesKey(normalizeLossEntries(c.lossesJson)),
          })),
          prices: Object.fromEntries(row.prices.map((p) => [p.priceType, p.price])),
          barcodes: row.barcodes.map((b) => ({
            code: b.code,
            goodPart: b.goodPart,
            goodPartName: b.goodPartName,
            kind: b.barcodeKind,
            activity: b.activity,
          })),
          images: row.images.map((img) => ({ id: img.id, name: img.originalName, isPrimary: img.isPrimary })),
        });
      }
    }
    return out;
  }

  /** Активний контекст дії (для вкладених викликів). */
  current(): (CatalogAuditActor & { action: string }) | undefined {
    return this.context.getStore();
  }

  async track<T>(options: CatalogAuditTrackOptions<T>, fn: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn();

    let before = new Map<string, CatalogGoodAuditSnapshot>();
    try {
      before = await this.loadSnapshots(options.ids);
    } catch (error) {
      logServer('[catalog-audit] snapshot before failed', { action: options.action, error });
    }

    const result = await this.context.run(
      { userId: options.userId, source: options.source, action: options.action },
      fn,
    );

    try {
      const extraIds = options.resultIds ? options.resultIds(result) : [];
      const ids = [...new Set([...options.ids, ...extraIds])];
      const after = await this.loadSnapshots(ids);
      for (const id of ids) {
        const prev = before.get(id) ?? null;
        const next = after.get(id) ?? null;
        if (!prev && !next) continue;
        const diff = diffCatalogGoodSnapshots(prev, next);
        if (!diff && !options.always) continue;
        const snapshot = next ?? prev;
        const payload: CatalogGoodAuditPayload = {
          goodName: String(snapshot?.fields.name ?? ''),
          goodSku: (snapshot?.fields.sku as string | null) ?? null,
          ...(diff ?? {}),
          ...(options.meta ? { meta: options.meta } : {}),
        };
        await auditLogService.log({
          entityType: AUDIT_ENTITY.CATALOG_GOOD,
          entityId: id,
          action: options.action,
          userId: options.userId,
          source: options.source,
          payload: payload as Prisma.InputJsonValue,
        });
        if (options.source === 'dilovod' && this.externalSpecListener && catalogAuditTouchesSpec(diff)) {
          try {
            await this.externalSpecListener(id, prev, next);
          } catch (error) {
            logServer('[catalog-audit] external spec listener failed', { goodId: id, error });
          }
        }
      }
    } catch (error) {
      logServer('[catalog-audit] diff/log failed', { action: options.action, error });
    }
    return result;
  }

  /** Запис без порівняння знімків (події без зміни полів товару). */
  async logEvent(input: {
    goodId: string;
    action: string;
    userId: number | null;
    source?: AuditSource;
    /** Готовий diff (напр. чернетка специфікації vs чинна). */
    payload?: Partial<CatalogGoodAuditPayload>;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    const good = await prisma.catalogGood
      .findUnique({ where: { id: input.goodId }, select: { name: true, sku: true } })
      .catch(() => null);
    const payload: CatalogGoodAuditPayload = {
      goodName: good?.name ?? '',
      goodSku: good?.sku ?? null,
      ...(input.payload ?? {}),
      ...(input.meta ? { meta: input.meta } : {}),
    };
    await auditLogService.log({
      entityType: AUDIT_ENTITY.CATALOG_GOOD,
      entityId: input.goodId,
      action: input.action,
      userId: input.userId,
      source: input.source ?? 'ui',
      payload: payload as Prisma.InputJsonValue,
    });
  }

  /** Користувачі, що мають записи в журналі каталогу. */
  async listUsers(): Promise<Array<{ id: number; name: string }>> {
    const grouped = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: { entityType: AUDIT_ENTITY.CATALOG_GOOD, userId: { not: null } },
    });
    const ids = grouped.map((g) => g.userId).filter((v): v is number => v != null);
    if (ids.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({ id: u.id, name: u.name || u.email }));
  }

  async list(query: Omit<AuditLogQuery, 'entityType'>): Promise<AuditLogPageDto<CatalogGoodAuditLogDto>> {
    const page = await auditLogService.query({ ...query, entityType: AUDIT_ENTITY.CATALOG_GOOD });
    return page as AuditLogPageDto<CatalogGoodAuditLogDto>;
  }
}

export const catalogGoodAuditService = new CatalogGoodAuditService();
