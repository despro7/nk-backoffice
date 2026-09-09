/**
 * Аудит і виправлення порожнього серійного № (`code`) у catalogs.goodParts.
 * getMetadata не віддає name/number — канонічне поле UI Dilovod «Серійний №» = code.
 * Якщо code порожній, balance/documents теж не мають альтернативного «справжнього» номера.
 */

import { prisma } from '../../lib/utils.js';
import {
  CATALOG_FINISHED_PRODUCTS_FOLDER_ID,
  CATALOG_FINISHED_PRODUCTS_FOLDER_NAME,
  CATALOG_TRASH_ID,
} from '../../../shared/types/catalog.js';
import { DilovodApiClient } from './DilovodApiClient.js';
import {
  isDilovodDeletionMark,
  unwrapDilovodId,
  unwrapDilovodName,
} from './DilovodUtils.js';
import {
  isHumanBatchLabel,
  isUsableDilovodBatchId,
  sanitizeStoredBatchName,
} from '../../../shared/utils/dilovodBatchId.js';

export type MissingSerialGoodPart = {
  id: string;
  ownerId: string;
  ownerName: string;
  date: string;
  expiration: string;
  /** Підказка з локального catalog_good_barcodes.goodPartName */
  suggestedSerial: string | null;
  sku: string | null;
};

export type MissingSerialAuditResult = {
  scanned: number;
  missing: number;
  /** Скільки партій відсіяно фільтром папки каталогу */
  outsideFolder: number;
  folderId: string;
  folderName: string;
  ownerCount: number;
  items: MissingSerialGoodPart[];
};

export type SetGoodPartSerialResult = {
  id: string;
  code: string;
};

type GoodPartListRow = {
  id?: unknown;
  code?: unknown;
  date?: unknown;
  owner?: unknown;
  owner__pr?: unknown;
  expiration?: unknown;
  delMark?: unknown;
};

export class DilovodGoodPartsSerialService {
  private api = new DilovodApiClient();

  /**
   * Партії без заповненого `code` (Серійний №), без delMark.
   * За замовчуванням лише товари з піддерева «Готова продукція».
   */
  async listMissingSerial(options?: {
    limit?: number;
    /** Папка catalog_goods; default = Готова продукція */
    folderId?: string;
  }): Promise<MissingSerialAuditResult> {
    await this.api.ensureReady();
    const limit = Math.min(Math.max(Number(options?.limit) || 200, 1), 500);
    const folderId =
      String(options?.folderId || '').trim() || CATALOG_FINISHED_PRODUCTS_FOLDER_ID;

    const [resp, folderMeta, ownerIdsInFolder] = await Promise.all([
      this.api.makeRequest<unknown>({
        version: '0.25',
        key: this.api.getApiKey(),
        action: 'request',
        params: {
          from: 'catalogs.goodParts',
          fields: {
            id: 'id',
            code: 'code',
            date: 'date',
            owner: 'owner',
            expiration: 'expiration',
            delMark: 'delMark',
          },
        },
      }),
      this.loadFolderMeta(folderId),
      this.loadLeafGoodIdsInFolder(folderId),
    ]);

    const ownerSet = new Set(ownerIdsInFolder);
    const rows = this.asRows(resp);
    const missingAll = rows.filter((row) => {
      if (isDilovodDeletionMark(row.delMark)) return false;
      const id = unwrapDilovodId(row.id);
      if (!isUsableDilovodBatchId(id)) return false;
      const code = unwrapDilovodName(row.code);
      return !code;
    });

    const missingInFolder = missingAll.filter((row) =>
      ownerSet.has(unwrapDilovodId(row.owner)),
    );
    const outsideFolder = missingAll.length - missingInFolder.length;

    const sliced = missingInFolder.slice(0, limit);
    const ids = sliced
      .map((row) => unwrapDilovodId(row.id))
      .filter((id): id is string => Boolean(id));
    const ownerIds = [
      ...new Set(
        sliced
          .map((row) => unwrapDilovodId(row.owner))
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [suggestionByPart, skuByOwner] = await Promise.all([
      this.loadLocalSuggestions(ids),
      this.loadSkuByOwner(ownerIds),
    ]);

    const items: MissingSerialGoodPart[] = sliced.map((row) => {
      const id = unwrapDilovodId(row.id);
      const ownerId = unwrapDilovodId(row.owner);
      const suggestion = suggestionByPart.get(id);
      return {
        id,
        ownerId,
        ownerName: unwrapDilovodName(row.owner__pr) || '—',
        date: String(row.date ?? '').trim(),
        expiration: String(row.expiration ?? '').trim(),
        suggestedSerial: suggestion?.serial ?? null,
        sku: suggestion?.sku ?? skuByOwner.get(ownerId) ?? null,
      };
    });

    return {
      scanned: rows.length,
      missing: missingInFolder.length,
      outsideFolder,
      folderId,
      folderName: folderMeta?.name || CATALOG_FINISHED_PRODUCTS_FOLDER_NAME,
      ownerCount: ownerSet.size,
      items,
    };
  }

  /**
   * Записує серійний № у поле `code` партії (saveObject).
   */
  async setSerial(batchId: string, serial: string): Promise<SetGoodPartSerialResult> {
    const id = String(batchId ?? '').trim();
    const code = String(serial ?? '').trim();

    if (!isUsableDilovodBatchId(id)) {
      throw new Error('Некоректний id партії Dilovod');
    }
    if (!code) {
      throw new Error('Серійний номер не може бути порожнім');
    }
    if (!isHumanBatchLabel(code)) {
      throw new Error('Серійний номер не повинен бути сирим Dilovod id');
    }

    await this.api.ensureReady();

    const existing = await this.api.getObject(id);
    const existingError =
      existing && typeof existing === 'object' && 'error' in existing
        ? String((existing as { error?: unknown }).error ?? '')
        : '';
    if (existingError) {
      throw new Error(`Dilovod getObject(${id}): ${existingError}`);
    }

    const header = existing?.header;
    const currentCode =
      header && typeof header === 'object'
        ? unwrapDilovodName((header as Record<string, unknown>).code)
        : '';
    if (currentCode && currentCode !== code) {
      throw new Error(
        `У партії вже є серійний № «${currentCode}». Зміна існуючого номера через цей інструмент заборонена.`,
      );
    }
    if (currentCode && currentCode === code) {
      return { id, code };
    }

    const resp = await this.api.makeRequest<{ id?: unknown; error?: unknown }>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'saveObject',
      params: {
        header: {
          id,
          code,
        },
      },
    });

    if (resp?.error) {
      throw new Error(
        typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error),
      );
    }

    const savedId = unwrapDilovodId(resp?.id) || id;
    return { id: savedId, code };
  }

  private asRows(resp: unknown): GoodPartListRow[] {
    if (Array.isArray(resp)) return resp as GoodPartListRow[];
    if (resp && typeof resp === 'object' && Array.isArray((resp as { data?: unknown }).data)) {
      return (resp as { data: GoodPartListRow[] }).data;
    }
    return [];
  }

  private async loadLocalSuggestions(
    batchIds: string[],
  ): Promise<Map<string, { serial: string; sku: string | null }>> {
    const map = new Map<string, { serial: string; sku: string | null }>();
    if (batchIds.length === 0) return map;

    const rows = await prisma.catalogGoodBarcode.findMany({
      where: {
        goodPart: { in: batchIds },
        goodPartName: { not: null },
      },
      select: {
        goodPart: true,
        goodPartName: true,
        good: { select: { sku: true } },
      },
    });

    for (const row of rows) {
      const partId = String(row.goodPart ?? '').trim();
      if (!partId || map.has(partId)) continue;
      const serial = sanitizeStoredBatchName(row.goodPartName, partId);
      if (!serial) continue;
      map.set(partId, {
        serial,
        sku: row.good?.sku ? String(row.good.sku) : null,
      });
    }

    return map;
  }

  private async loadSkuByOwner(ownerIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ownerIds.length === 0) return map;

    const goods = await prisma.catalogGood.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, sku: true },
    });
    for (const good of goods) {
      if (good.sku) map.set(good.id, good.sku);
    }
    return map;
  }

  private async loadFolderMeta(
    folderId: string,
  ): Promise<{ id: string; name: string } | null> {
    const folder = await prisma.catalogGood.findFirst({
      where: { id: folderId, isGroup: true },
      select: { id: true, name: true },
    });
    return folder;
  }

  /** Leaf-товари (не групи) у піддереві папки локального catalog_goods. */
  private async loadLeafGoodIdsInFolder(folderId: string): Promise<string[]> {
    const folderIds = new Set<string>([folderId]);
    let frontier = [folderId];
    while (frontier.length > 0) {
      const children = await prisma.catalogGood.findMany({
        where: {
          isGroup: true,
          parentId: { in: frontier },
          id: { not: CATALOG_TRASH_ID },
        },
        select: { id: true },
      });
      frontier = [];
      for (const child of children) {
        if (folderIds.has(child.id)) continue;
        folderIds.add(child.id);
        frontier.push(child.id);
      }
    }

    const leaves = await prisma.catalogGood.findMany({
      where: {
        isGroup: false,
        parentId: { in: [...folderIds] },
        id: { not: CATALOG_TRASH_ID },
      },
      select: { id: true },
    });
    return leaves.map((row) => row.id);
  }
}

export const dilovodGoodPartsSerialService = new DilovodGoodPartsSerialService();
