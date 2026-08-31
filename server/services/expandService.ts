import { logServer } from '../lib/utils.js';
import { catalogOpsLookup } from '../modules/Products/CatalogOpsLookup.js';
import { productOpsCache, type OpsCachedProduct } from '../modules/Products/ProductOpsCache.js';

export class ExpandService {
  /**
   * Batch fetch products by SKU and return parsed payloads along with metrics.
   * Returns: { products: Record<sku, parsedProduct|null>, notFound: string[], foundCount, durationMs }
   */
  static async flattenBatch(skus: string[]): Promise<{ products: Record<string, any>; notFound: string[]; foundCount: number; durationMs: number }> {
    const start = Date.now();

    if (!Array.isArray(skus) || skus.length === 0) {
      return { products: {}, notFound: [], foundCount: 0, durationMs: 0 };
    }

    const result: Record<string, any> = {};
    const notFound: string[] = [];

    try {
      const initial = Array.from(new Set(skus.map(s => String(s).trim().toLowerCase()))).filter(Boolean);

      const snap = await productOpsCache.getMap();

      const toFetch = new Set(initial);
      const fetched = new Set<string>();

      const CHUNK_SIZE = 200;
      while (toFetch.size > 0) {
        const batch = Array.from(toFetch).filter(s => !fetched.has(s)).slice(0, CHUNK_SIZE);
        if (batch.length === 0) break;

        const putParsed = (parsed: OpsCachedProduct, requestKey: string) => {
          const copy = { ...parsed };
          const skuKey = String(copy.sku ?? requestKey).trim().toLowerCase();
          result[skuKey] = copy;
          result[requestKey] = copy;
          fetched.add(skuKey);
          fetched.add(requestKey);
          const dilovodId = copy.dilovodId ? String(copy.dilovodId).trim().toLowerCase() : '';
          if (dilovodId) {
            result[dilovodId] = copy;
            fetched.add(dilovodId);
          }
          const set = copy.set;
          if (Array.isArray(set)) {
            for (const s of set as Array<{ id?: string }>) {
              if (s?.id) {
                const child = String(s.id).trim().toLowerCase();
                if (!fetched.has(child)) toFetch.add(child);
              }
            }
          }
        };

        const missingAfterCache: string[] = [];
        for (const sku of batch) {
          const row = snap.get(sku);
          if (!row) {
            missingAfterCache.push(sku);
            continue;
          }
          putParsed(row, sku);
        }

        if (missingAfterCache.length > 0) {
          const found = await catalogOpsLookup.getBySkus(missingAfterCache);
          for (const sku of missingAfterCache) {
            const p = found.get(sku) ?? found.get(sku.toLowerCase()) ?? null;
            if (!p) {
              result[sku] = null;
              notFound.push(sku);
              fetched.add(sku);
              continue;
            }
            putParsed(catalogOpsLookup.toApiShape(p) as OpsCachedProduct, sku);
          }
        }

        for (const k of batch) toFetch.delete(k);
      }

      const calcCache = new Map<string, { sumPortionsOne: number; weightKgOne: number }>();
      const MAX_DEPTH = 10;

      const deriveUnitRatioFromWeight = (weightGrams?: number): number => {
        const GRADATIONS = [
          { min: 525, value: 1.5 },
          { min: 420, value: 1.25 },
          { min: 280, value: 1.0 },
          { min: 185, value: 0.75 },
          { min: 90, value: 0.5 },
          { min: 0, value: 0.25 }
        ];
        if (!weightGrams || typeof weightGrams !== 'number') return 1;
        let grams = weightGrams;
        if (grams > 0 && grams <= 10) grams = grams * 1000;
        for (const g of GRADATIONS) if (grams >= g.min) return g.value;
        return 1;
      };

      const calculateExpectedWeight = (product: any, quantity: number): number => {
        if (product && typeof product.weight === 'number' && product.weight > 0) {
          return (product.weight * quantity) / 1000;
        }
        const defaultWeight = product && product.categoryId === 1 ? 420 : 330;
        return (defaultWeight * quantity) / 1000;
      };

      const computeAggregates = async (sku: string, visited: Set<string> = new Set(), depth: number = 0): Promise<{ sumPortionsOne: number; weightKgOne: number }> => {
        if (calcCache.has(sku)) return calcCache.get(sku)!;
        if (depth > MAX_DEPTH) return { sumPortionsOne: 1, weightKgOne: 0 };
        if (visited.has(sku)) return { sumPortionsOne: 1, weightKgOne: 0 };
        visited.add(sku);

        const prod = result[sku];
        if (!prod) {
          visited.delete(sku);
          return { sumPortionsOne: 1, weightKgOne: 0 };
        }

        try {
          if (prod.set && Array.isArray(prod.set) && prod.set.length > 0) {
            let sumP = 0;
            let weightKg = 0;
            for (const si of prod.set) {
              if (!si || !si.id) continue;
              const childSku = String(si.id).trim().toLowerCase();
              const agg = await computeAggregates(childSku, new Set(visited), depth + 1);
              const qty = (si.quantity && typeof si.quantity === 'number') ? si.quantity : 1;
              sumP += agg.sumPortionsOne * qty;
              weightKg += agg.weightKgOne * qty;
            }
            if (!sumP) sumP = 1;
            const res = { sumPortionsOne: sumP, weightKgOne: weightKg };
            calcCache.set(sku, res);
            visited.delete(sku);
            return res;
          }

          const unitRatio = (typeof prod.unitRatio === 'number') ? prod.unitRatio : deriveUnitRatioFromWeight(prod.weight);
          const weightKgOne = calculateExpectedWeight(prod, 1);
          const simple = { sumPortionsOne: unitRatio || 1, weightKgOne };
          calcCache.set(sku, simple);
          visited.delete(sku);
          return simple;
        } catch {
          visited.delete(sku);
          return { sumPortionsOne: 1, weightKgOne: 0 };
        }
      };

      const keys = Object.keys(result);
      for (const k of keys) {
        if (result[k]) {
          const calc = await computeAggregates(k);
          result[k].calc = calc;
        }
      }

      const durationMs = Date.now() - start;
      const foundCount = new Set(
        Object.values(result).filter(Boolean).map((p) => String(p.sku).trim().toLowerCase())
      ).size;

      logServer(`✅ ExpandService.flattenBatch: requested=${skus.length}, closure=${Object.keys(result).length}, found=${foundCount}, missing=${notFound.length}, time=${durationMs}ms`);

      return { products: result, notFound, foundCount, durationMs };
    } catch (error) {
      logServer('Error in ExpandService.flattenBatch', error);
      throw error;
    }
  }
}

export default ExpandService;
