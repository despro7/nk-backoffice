/**
 * Dilovod gateway for catalogs.goods + related registers (prices, barcodes, units).
 */

import { DilovodApiClient } from '../../services/dilovod/DilovodApiClient.js';
import { logServer } from '../../lib/utils.js';
import {
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  DilovodCatalogGoodRow,
  DilovodSaveGoodParams,
  DilovodSaveResult,
  DilovodUnitRow,
  extractUkName,
  toBool,
  toNumberOrNull,
} from './ProductsTypes.js';
import { allocateNextSku, isSkuDuplicateError } from './skuUtils.js';

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
      throw new Error(`Dilovod setDelMark failed: ${resp.error}`);
    }
    return { id, ...(resp || {}) };
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
      throw new Error(`Dilovod saveObject failed: ${resp.error}`);
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

  async fetchUnits(): Promise<DilovodUnitRow[]> {
    await this.api.ensureReady();
    const resp = await this.api.makeRequest<any>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'request',
      params: {
        from: 'catalogs.units',
        fields: {
          id: 'id',
          id__pr: 'name',
          code: 'code',
        },
      },
    });
    const rows = Array.isArray(resp) ? resp : [];
    return rows.map((r: any) => ({
      id: String(r.id || ''),
      name: String(r.name || r.id__pr || ''),
      code: r.code != null ? String(r.code) : null,
    })).filter((u) => u.id);
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

  /**
   * Persist price snapshot into Dilovod informationRegisters.goodsPrices.
   */
  async savePrice(params: {
    goodId: string;
    priceType: string;
    price: number;
    currency?: string | null;
  }): Promise<void> {
    await this.api.ensureReady();
    const header: Record<string, unknown> = {
      id: 'informationRegisters.goodsPrices',
      date: new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Kyiv', hour12: false }),
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
      throw new Error(`Dilovod save price failed: ${resp.error}`);
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
      throw new Error(`Dilovod save barcode failed: ${resp.error}`);
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
    components: Array<{ componentGoodId: string; qty: number; rowNum: number }>;
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
        return {
          componentGoodId: good,
          qty: toNumberOrNull(row.qty) ?? 1,
          rowNum: toNumberOrNull(row.rowNum) ?? idx + 1,
        };
      })
      .filter(Boolean) as Array<{ componentGoodId: string; qty: number; rowNum: number }>;

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
      description: header.description != null ? String(header.description) : null,
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
