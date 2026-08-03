/**
 * Dilovod gateway for catalogs.goods + related registers (prices, barcodes, units).
 */

import { DilovodApiClient } from '../../services/dilovod/DilovodApiClient.js';
import { dilovodCacheService, type CacheType } from '../../services/dilovod/DilovodCacheService.js';
import { translateDilovodError } from '../../services/dilovod/DilovodUtils.js';
import { logServer } from '../../lib/utils.js';
import {
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  DilovodCatalogGoodRow,
  DilovodDictItem,
  DilovodSaveGoodParams,
  DilovodSaveResult,
  DilovodUnitRow,
  extractUkName,
  toBool,
  toNumberOrNull,
} from './ProductsTypes.js';
import { allocateNextSku, isSkuDuplicateError } from './skuUtils.js';
import { allocateNextEan13 } from './barcodeUtils.js';

/** Мапінг CacheType → Dilovod `from` для каталожних довідників. */
const DICT_FROM: Partial<Record<CacheType, string>> = {
  units: 'catalogs.units',
  priceTypes: 'catalogs.priceTypes',
  currency: 'catalogs.currency',
  // getMetadata(catalogs.goods).reqs.accPolicy.valueType
  accPolicies: 'catalogs.goodsAccPolicies',
};

/** Зрозуміле повідомлення для toast з сирої помилки Dilovod. */
function formatDilovodGatewayError(action: string, rawError: unknown): Error {
  const err = String(rawError || '').trim();
  if (!err) return new Error(`Помилка Dilovod (${action})`);

  const translated = translateDilovodError(err);
  if (translated.title !== 'Помилка Діловода') {
    return new Error(`${translated.title}. ${translated.message}`);
  }

  // applicationLayerError часто містить корисний український текст після коду
  const cleaned = err
    .replace(/^applicationLayerError\s*/i, '')
    .replace(/^multithreadApiSession\s*/i, '')
    .trim();
  if (cleaned && cleaned !== err) {
    return new Error(cleaned);
  }

  return new Error(`Помилка Dilovod (${action}): ${err}`);
}

export class ProductsDilovodGateway {
  private api: DilovodApiClient;

  constructor(apiClient?: DilovodApiClient) {
    this.api = apiClient ?? new DilovodApiClient();
  }

  async getObject(id: string): Promise<any> {
    return this.api.getObject(id);
  }

  async setDelMark(id: string): Promise<DilovodSaveResult> {
    await this.api.ensureReady();
    const resp = await this.api.makeRequest<any>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'setDelMark',
      params: { header: { id } },
    });
    if (resp?.error) {
      throw formatDilovodGatewayError('setDelMark', resp.error);
    }
    return { id, ...(resp || {}) };
  }

  /**
   * Зняття позначки видалення через saveObject + delMark: 0.
   * УВАГА: на catalogs.goods Dilovod приймає запит (ok), але delMark не змінює.
   * Спеціалізований call unsetDeletionMark / setDeletionMark — «not allowed» для поточної API-ролі.
   * Поки не використовуємо в archive/trash/restore/move.
   */
  async clearDelMark(params: DilovodSaveGoodParams): Promise<DilovodSaveResult> {
    return this.saveObject({
      ...params,
      header: {
        ...params.header,
        delMark: 0,
      },
    });
  }

  async saveObject(params: DilovodSaveGoodParams): Promise<DilovodSaveResult> {
    await this.api.ensureReady();
    const resp = await this.api.makeRequest<any>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'saveObject',
      params,
    });
    if (resp?.error) {
      throw formatDilovodGatewayError('saveObject', resp.error);
    }
    const id = String(resp?.id || params.header?.id || '');
    if (!id || id.startsWith('catalogs.')) {
      throw new Error('Dilovod saveObject не повернув id обʼєкта');
    }
    return { id, ...(resp || {}) };
  }

  /**
   * Save goods with SKU collision retry (create / duplicate path).
   */
  async saveGoodWithSkuRetry(
    buildParams: (sku: string) => DilovodSaveGoodParams,
    initialSku: string,
    maxAttempts = 5
  ): Promise<{ result: DilovodSaveResult; sku: string }> {
    let sku = initialSku;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await this.saveObject(buildParams(sku));
        return { result, sku };
      } catch (err) {
        lastError = err;
        if (!isSkuDuplicateError(err)) {
          throw err;
        }
        logServer(`[ProductsDilovodGateway] SKU collision for ${sku}, retry…`);
        sku = await this.allocateNextSku(sku);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Не вдалося зберегти товар після ${maxAttempts} спроб SKU`);
  }

  async isSkuTaken(sku: string, excludeId?: string): Promise<boolean> {
    const trimmed = String(sku || '').trim();
    if (!trimmed) return false;

    await this.api.ensureReady();
    const resp = await this.api.makeRequest<any>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'request',
      params: {
        from: 'catalogs.goods',
        fields: { id: 'id', productNum: 'productNum' },
        filters: [{ alias: 'productNum', operator: '=', value: trimmed }],
        limit: 5,
      },
    });

    const rows = Array.isArray(resp) ? resp : resp?.data || [];
    return rows.some((r: any) => {
      const id = String(r.id || '');
      if (!id) return false;
      if (excludeId && id === excludeId) return false;
      return true;
    });
  }

  async allocateNextSku(baseSku: string): Promise<string> {
    return allocateNextSku(baseSku, (sku) => this.isSkuTaken(sku));
  }

  async isBarcodeTaken(code: string, excludeObjectId?: string): Promise<boolean> {
    const trimmed = String(code || '').trim();
    if (!trimmed) return false;

    await this.api.ensureReady();
    const resp = await this.api.makeRequest<any>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'request',
      params: {
        from: { type: 'sliceLast', register: 'barCodes' },
        fields: { id: 'id', object: 'object', code: 'code', goodPart: 'goodPart', activity: 'activity' },
        filters: [{ alias: 'code', operator: '=', value: trimmed }],
        limit: 10,
      },
    });

    const rows = Array.isArray(resp) ? resp : [];
    return rows.some((r: any) => {
      if (String(r.activity) === '0') return false;
      if (excludeObjectId && String(r.object) === excludeObjectId) return false;
      return String(r.code) === trimmed;
    });
  }

  /**
   * Усі активні коди з регістру barCodes (пагінація).
   * Потрібно для генерації наступного EAN-13 без колізій.
   */
  async fetchAllBarcodeCodes(signal?: { aborted?: boolean }): Promise<string[]> {
    await this.api.ensureReady();
    const pageSize = 500;
    const maxPages = 40; // safety: ≤20k рядків
    let offset = 0;
    const codes: string[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      if (signal?.aborted) {
        throw new Error('Запит скасовано');
      }

      const resp = await this.api.makeRequest<any>({
        version: '0.25',
        key: this.api.getApiKey(),
        action: 'request',
        params: {
          from: { type: 'sliceLast', register: 'barCodes' },
          fields: { code: 'code', activity: 'activity' },
          limit: { offset, count: pageSize },
        },
      });

      const rows = Array.isArray(resp) ? resp : [];
      let newOnPage = 0;
      for (const r of rows) {
        if (String(r.activity) === '0') continue;
        const code = String(r.code || '').trim();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        codes.push(code);
        newOnPage++;
      }

      logServer(
        `[ProductsDilovodGateway] fetchAllBarcodeCodes page=${page + 1} offset=${offset} raw=${rows.length} new=${newOnPage} total=${codes.length}`
      );

      if (rows.length < pageSize || newOnPage === 0) {
        break;
      }
      offset += pageSize;
    }

    return codes;
  }

  /**
   * Наступний вільний EAN-13: max серед існуючих у Dilovod → body+1 + check digit.
   */
  async allocateNextBarcode(): Promise<string> {
    const codes = await this.fetchAllBarcodeCodes();
    return allocateNextEan13(codes, (code) => this.isBarcodeTaken(code));
  }

  /**
   * Full catalog pull (folders + goods).
   * Dilovod: `limit` = `{ offset, count }` (окремий top-level `offset` ігнорується).
   * Дедуп id + safety-cap — захист від зациклення, якщо API знову віддає ту саму сторінку.
   */
  async fetchAllGoods(signal?: { aborted?: boolean }): Promise<DilovodCatalogGoodRow[]> {
    await this.api.ensureReady();
    const pageSize = 500;
    const maxPages = 20; // safety: ≤10k рядків
    let offset = 0;
    const all: DilovodCatalogGoodRow[] = [];
    const seenIds = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      if (signal?.aborted) {
        throw new Error('Запит скасовано');
      }

      const resp = await this.api.makeRequest<any>({
        version: '0.25',
        key: this.api.getApiKey(),
        action: 'request',
        params: {
          from: 'catalogs.goods',
          fields: {
            id: 'id',
            productNum: 'sku',
            parent: 'parent',
            id__pr: 'name',
            isGroup: 'isGroup',
            delMark: 'delMark',
            mainUnit: 'mainUnit',
            packageRatio: 'packageRatio',
            weight: 'weight',
            accPolicy: 'accPolicy',
            printName: 'printName',
            description: 'description',
          },
          // Dilovod docs: limit може бути { offset, count }
          limit: { offset, count: pageSize },
        },
      });

      const rows = Array.isArray(resp) ? resp : [];
      let newOnPage = 0;
      for (const r of rows) {
        const mapped = this.mapCatalogRow(r);
        if (!mapped.id || seenIds.has(mapped.id)) continue;
        seenIds.add(mapped.id);
        all.push(mapped);
        newOnPage++;
      }

      logServer(
        `[ProductsDilovodGateway] fetchAllGoods page=${page + 1} offset=${offset} raw=${rows.length} new=${newOnPage} total=${all.length}`
      );

      if (rows.length < pageSize || newOnPage === 0) {
        break;
      }

      offset += pageSize;
    }

    return all;
  }

  async fetchGoodsByIds(ids: string[]): Promise<DilovodCatalogGoodRow[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];

    await this.api.ensureReady();
    const results: DilovodCatalogGoodRow[] = [];

    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const resp = await this.api.makeRequest<any>({
        version: '0.25',
        key: this.api.getApiKey(),
        action: 'request',
        params: {
          from: 'catalogs.goods',
          fields: {
            id: 'id',
            productNum: 'sku',
            parent: 'parent',
            id__pr: 'name',
            isGroup: 'isGroup',
            delMark: 'delMark',
            mainUnit: 'mainUnit',
            packageRatio: 'packageRatio',
            weight: 'weight',
            accPolicy: 'accPolicy',
            printName: 'printName',
            description: 'description',
          },
          filters: [{ alias: 'id', operator: 'IL', value: chunk }],
        },
      });
      const rows = Array.isArray(resp) ? resp : [];
      results.push(...rows.map((r: any) => this.mapCatalogRow(r)));
    }

    return results;
  }

  /**
   * Прямі діти папки в Dilovod (`parent`).
   * Корінь каталогу — `parent = "0"`.
   */
  async fetchGoodsByParent(parentId: string | null): Promise<DilovodCatalogGoodRow[]> {
    await this.api.ensureReady();
    const parentValue = !parentId || parentId === 'root' ? '0' : parentId;

    const resp = await this.api.makeRequest<any>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'request',
      params: {
        from: 'catalogs.goods',
        fields: {
          id: 'id',
          productNum: 'sku',
          parent: 'parent',
          id__pr: 'name',
          isGroup: 'isGroup',
          delMark: 'delMark',
          mainUnit: 'mainUnit',
          packageRatio: 'packageRatio',
          weight: 'weight',
          accPolicy: 'accPolicy',
          printName: 'printName',
          description: 'description',
        },
        filters: [{ alias: 'parent', operator: '=', value: parentValue }],
      },
    });

    const rows = Array.isArray(resp) ? resp : [];
    return rows.map((r: any) => this.mapCatalogRow(r)).filter((g) => g.id);
  }

  async fetchUnits(): Promise<DilovodUnitRow[]> {
    const rows = await this.fetchCachedDict('units');
    return rows.map((r) => ({ id: r.id, name: r.name, code: r.code ?? null }));
  }

  /**
   * Довідник з кешем settings_base (`dilovod.cache.{type}`), TTL 24h.
   * forceRefresh=true — ігнорує кеш і тягне з Dilovod.
   */
  async fetchCachedDict(
    type: 'units' | 'priceTypes' | 'currency' | 'accPolicies',
    forceRefresh = false
  ): Promise<DilovodDictItem[]> {
    if (!forceRefresh) {
      const cached = await dilovodCacheService.getFromCache<DilovodDictItem>(type);
      if (cached) return cached;
    }

    const from = DICT_FROM[type];
    if (!from) return [];

    await this.api.ensureReady();
    try {
      const resp = await this.api.makeRequest<any>({
        version: '0.25',
        key: this.api.getApiKey(),
        action: 'request',
        params: {
          from,
          fields: {
            id: 'id',
            id__pr: 'name',
            code: 'code',
          },
        },
      });
      const rows = Array.isArray(resp) ? resp : [];
      const mapped: DilovodDictItem[] = rows
        .map((r: any) => ({
          id: String(r.id || ''),
          name: String(r.name || r.id__pr || extractUkName(r.name) || ''),
          code: r.code != null ? String(r.code) : null,
        }))
        .filter((u) => u.id);

      await dilovodCacheService.updateCache(type, mapped);
      return mapped;
    } catch (error) {
      logServer(`[ProductsDilovodGateway] fetchCachedDict(${type}) failed`, error);
      const stale = await dilovodCacheService.getFromCache<DilovodDictItem>(type);
      if (stale) return stale;
      throw error;
    }
  }

  async fetchPricesForGoods(
    goodIds: string[]
  ): Promise<Array<{ goodId: string; priceType: string; price: number; currency: string | null }>> {
    const unique = [...new Set(goodIds.filter(Boolean))];
    if (unique.length === 0) return [];

    await this.api.ensureReady();
    const results: Array<{ goodId: string; priceType: string; price: number; currency: string | null }> = [];
    const date = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Kyiv', hour12: false });

    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const resp = await this.api.makeRequest<any>({
        version: '0.25',
        key: this.api.getApiKey(),
        action: 'request',
        params: {
          from: { type: 'sliceLast', register: 'goodsPrices', date },
          fields: {
            good: 'good',
            priceType: 'priceType',
            price: 'price',
            currency: 'currency',
          },
          filters: [{ alias: 'good', operator: 'IL', value: chunk }],
        },
      });
      const rows = Array.isArray(resp) ? resp : [];
      for (const r of rows) {
        results.push({
          goodId: String(r.good || r.id || ''),
          priceType: String(r.priceType || ''),
          price: toNumberOrNull(r.price) ?? 0,
          currency: r.currency != null ? String(r.currency) : null,
        });
      }
    }

    return results.filter((p) => p.goodId && p.priceType);
  }

  async fetchBarcodesForGoods(
    goodIds: string[]
  ): Promise<
    Array<{
      goodId: string;
      dilovodRegisterId: string | null;
      code: string;
      goodPart: string | null;
      goodPartName: string | null;
      activity: boolean;
    }>
  > {
    const unique = [...new Set(goodIds.filter(Boolean))];
    if (unique.length === 0) return [];

    await this.api.ensureReady();
    const results: Array<{
      goodId: string;
      dilovodRegisterId: string | null;
      code: string;
      goodPart: string | null;
      goodPartName: string | null;
      activity: boolean;
    }> = [];

    // Власний запит з goodPart — не чіпаємо legacy getBarCodesByObjectIds
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const resp = await this.api.makeRequest<any>({
        version: '0.25',
        key: this.api.getApiKey(),
        action: 'request',
        params: {
          from: { type: 'sliceLast', register: 'barCodes' },
          fields: {
            id: 'id',
            object: 'object',
            code: 'code',
            goodPart: 'goodPart',
            activity: 'activity',
          },
          filters: [{ alias: 'object', operator: 'IL', value: chunk }],
        },
      });
      const rows = Array.isArray(resp) ? resp : [];
      for (const r of rows) {
        const goodId = String(r.object || '');
        const code = String(r.code || '');
        if (!goodId || !code) continue;
        results.push({
          goodId,
          dilovodRegisterId: r.id ? String(r.id) : null,
          code,
          goodPart:
            r.goodPart != null && String(r.goodPart).trim()
              ? String(r.goodPart).trim()
              : null,
          goodPartName:
            r.goodPart__pr != null && String(r.goodPart__pr).trim()
              ? String(r.goodPart__pr).trim()
              : null,
          activity: String(r.activity ?? '1') !== '0',
        });
      }
    }

    return results;
  }

  /** Поточна дата/час у Europe/Kyiv у форматі Dilovod (`YYYY-MM-DD HH:mm:ss`). */
  private kyivDateTime(date = new Date()): string {
    return date.toLocaleString('sv-SE', { timeZone: 'Europe/Kyiv', hour12: false });
  }

  /** Календарний день `YYYY-MM-DD` у Europe/Kyiv (унікальність goodsPrices — по дню). */
  private kyivDateKey(value: Date | string = new Date()): string {
    if (typeof value === 'string') {
      const iso = value.trim();
      // `2026-08-02 22:35:12` або `2026-08-02T22:35:12`
      const isoMatch = iso.match(/^(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) return isoMatch[1];
      // `02.08.2026` / `02.08.2026 22:35:12`
      const uaMatch = iso.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
      if (uaMatch) return `${uaMatch[3]}-${uaMatch[2]}-${uaMatch[1]}`;
    }
    return this.kyivDateTime(
      value instanceof Date ? value : new Date()
    ).slice(0, 10);
  }

  /**
   * Знайти запис goodsPrices за good+priceType на сьогоднішній календарний день (Kyiv).
   * Dilovod не дозволяє два записи на один день — повторне збереження має оновлювати існуючий.
   */
  private async findTodayPriceRecord(
    goodId: string,
    priceType: string
  ): Promise<{ id: string; date: string } | null> {
    const todayKey = this.kyivDateKey();
    const resp = await this.api.makeRequest<any>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'request',
      params: {
        from: 'informationRegisters.goodsPrices',
        fields: {
          id: 'id',
          date: 'date',
          good: 'good',
          priceType: 'priceType',
          price: 'price',
          currency: 'currency',
        },
        filters: [
          { alias: 'good', operator: '=', value: goodId },
          { alias: 'priceType', operator: '=', value: priceType },
        ],
      },
    });

    const rows = Array.isArray(resp) ? resp : [];
    for (const r of rows) {
      const id = r?.id != null ? String(r.id) : '';
      const date = r?.date != null ? String(r.date) : '';
      if (!id || !date) continue;
      if (this.kyivDateKey(date) === todayKey) {
        return { id, date };
      }
    }
    return null;
  }

  /**
   * Persist price snapshot into Dilovod informationRegisters.goodsPrices.
   * Якщо на сьогодні вже є запис — оновлює його (інакше Dilovod: «ціна вже встановлена»).
   */
  async savePrice(params: {
    goodId: string;
    priceType: string;
    price: number;
    currency?: string | null;
  }): Promise<void> {
    await this.api.ensureReady();

    const existing = await this.findTodayPriceRecord(params.goodId, params.priceType);
    const header: Record<string, unknown> = {
      id: existing?.id || 'informationRegisters.goodsPrices',
      date: existing?.date || this.kyivDateTime(),
      good: params.goodId,
      priceType: params.priceType,
      price: params.price,
    };
    if (params.currency) header.currency = params.currency;

    const resp = await this.api.makeRequest<any>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'saveObject',
      params: { header },
    });
    if (resp?.error) {
      throw formatDilovodGatewayError('savePrice', resp.error);
    }
  }

  /**
   * Persist barcode into Dilovod informationRegisters.barCodes.
   */
  async saveBarcode(params: {
    goodId: string;
    code: string;
    activity?: boolean;
    registerId?: string | null;
    goodPart?: string | null;
  }): Promise<string | null> {
    await this.api.ensureReady();
    const header: Record<string, unknown> = {
      id: params.registerId || 'informationRegisters.barCodes',
      object: params.goodId,
      code: params.code,
      activity: params.activity === false ? 0 : 1,
    };
    if (params.goodPart) {
      header.goodPart = params.goodPart;
    }

    const resp = await this.api.makeRequest<any>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'saveObject',
      params: { header },
    });
    if (resp?.error) {
      throw formatDilovodGatewayError('saveBarcode', resp.error);
    }
    return resp?.id ? String(resp.id) : params.registerId || null;
  }

  mapObjectToLocal(obj: any): {
    id: string;
    parentId: string | null;
    isGroup: boolean;
    delMark: boolean;
    name: string;
    sku: string | null;
    mainUnitId: string | null;
    packageRatio: number | null;
    weight: number | null;
    accPolicyId: string | null;
    printName: string | null;
    description: string | null;
    components: Array<{
      componentGoodId: string;
      qty: number;
      rowNum: number;
      unitId: string | null;
    }>;
  } {
    const header = obj?.header || obj || {};
    const idRaw = header.id;
    const id =
      typeof idRaw === 'object' && idRaw?.id != null
        ? String(idRaw.id)
        : String(obj?.id || idRaw || '');

    const parentRaw = header.parent;
    const parentResolved =
      parentRaw == null || parentRaw === ''
        ? null
        : typeof parentRaw === 'object'
          ? String(parentRaw.id || '') || null
          : String(parentRaw);
    // Dilovod корінь = "0"
    const parentId =
      !parentResolved || parentResolved === '0' ? null : parentResolved;

    const mainUnitRaw = header.mainUnit;
    const mainUnitId =
      mainUnitRaw == null || mainUnitRaw === ''
        ? CATALOG_DEFAULT_MAIN_UNIT_ID
        : typeof mainUnitRaw === 'object'
          ? String(mainUnitRaw.id || CATALOG_DEFAULT_MAIN_UNIT_ID)
          : String(mainUnitRaw);

    const accRaw = header.accPolicy;
    const accPolicyId =
      accRaw == null || accRaw === ''
        ? null
        : typeof accRaw === 'object'
          ? String(accRaw.id || '') || null
          : String(accRaw);

    const tp = obj?.tableParts?.tpGoods;
    const tpList: any[] = Array.isArray(tp)
      ? tp
      : tp && typeof tp === 'object'
        ? Object.values(tp)
        : [];

    const components = tpList
      .map((row, idx) => {
        const good =
          typeof row.good === 'object' ? String(row.good?.id || '') : String(row.good || '');
        if (!good) return null;
        const unitRaw = row.unit;
        const unitId =
          unitRaw == null || unitRaw === ''
            ? null
            : typeof unitRaw === 'object'
              ? String(unitRaw.id || '') || null
              : String(unitRaw);
        return {
          componentGoodId: good,
          qty: toNumberOrNull(row.qty) ?? 1,
          // Тимчасовий порядок з Dilovod; нижче перенумеровуємо 1..n без колізій
          rowNum: toNumberOrNull(row.rowNum) ?? idx + 1,
          unitId,
          note: row.remark != null && String(row.remark).trim()
            ? String(row.remark).trim()
            : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.rowNum - b!.rowNum) || a!.componentGoodId.localeCompare(b!.componentGoodId))
      .map((c, idx) => ({
        ...c!,
        rowNum: idx + 1,
      })) as Array<{
      componentGoodId: string;
      qty: number;
      rowNum: number;
      unitId: string | null;
      note: string | null;
    }>;

    return {
      id,
      parentId,
      isGroup: toBool(header.isGroup),
      delMark: toBool(header.delMark),
      name: extractUkName(header.name) || extractUkName(header.id) || '',
      sku: header.productNum != null && String(header.productNum).trim()
        ? String(header.productNum).trim()
        : null,
      mainUnitId,
      packageRatio: toNumberOrNull(header.packageRatio),
      weight: toNumberOrNull(header.weight),
      accPolicyId,
      printName: extractUkName(header.printName) || (header.printName != null ? String(header.printName) : null),
      // Dilovod description = multilang { uk, ru }; String(obj) давав "[object Object]"
      description: extractUkName(header.description) || null,
      components,
    };
  }

  private mapCatalogRow(r: any): DilovodCatalogGoodRow {
    return {
      id: String(r.id || ''),
      name: String(r.name || r.id__pr || ''),
      sku: r.sku != null && String(r.sku).trim() ? String(r.sku).trim() : (r.productNum != null && String(r.productNum).trim() ? String(r.productNum).trim() : null),
      parent: r.parent != null && String(r.parent) ? String(r.parent) : null,
      isGroup: toBool(r.isGroup),
      delMark: toBool(r.delMark),
      mainUnitId: r.mainUnit != null && String(r.mainUnit) ? String(r.mainUnit) : null,
      packageRatio: toNumberOrNull(r.packageRatio),
      weight: toNumberOrNull(r.weight),
      accPolicyId: r.accPolicy != null && String(r.accPolicy) ? String(r.accPolicy) : null,
      printName: r.printName != null ? extractUkName(r.printName) || String(r.printName) : null,
      description: r.description != null ? String(r.description) : null,
    };
  }
}

export const productsDilovodGateway = new ProductsDilovodGateway();
