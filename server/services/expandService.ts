import { prisma, logServer } from '../lib/utils.js';

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
      // Normalize initial SKUs
      const initial = Array.from(new Set(skus.map(s => String(s).trim().toLowerCase()))).filter(Boolean);

      // We'll iteratively fetch discovered SKUs (BFS style) so we return the full closure
      const toFetch = new Set(initial);
      const fetched = new Set<string>();

      // Limit chunk size to avoid huge DB IN lists
      const CHUNK_SIZE = 200;
      while (toFetch.size > 0) {
        const batch = Array.from(toFetch).filter(s => !fetched.has(s)).slice(0, CHUNK_SIZE);
        if (batch.length === 0) break;

        // Fetch existing products for this batch
        const products = await prisma.product.findMany({ where: { sku: { in: batch } } });

        // Mark found
        for (const p of products) {
          const key = String(p.sku).trim().toLowerCase();
          // parse some JSON fields safely
          const parsed = {
            ...p,
            set: p.set ? (() => { try { return typeof p.set === 'string' ? JSON.parse(p.set) : p.set; } catch { return null; } })() : null,
            additionalPrices: (p as any).additionalPrices ? (() => { try { return typeof (p as any).additionalPrices === 'string' ? JSON.parse((p as any).additionalPrices) : (p as any).additionalPrices; } catch { return null; } })() : null,
            stockBalanceByStock: (p as any).stockBalanceByStock ? (() => { try { return typeof (p as any).stockBalanceByStock === 'string' ? JSON.parse((p as any).stockBalanceByStock) : (p as any).stockBalanceByStock; } catch { return null; } })() : null
          };
          result[key] = parsed;
          fetched.add(key);

          // Enqueue nested SKUs from set composition
          if (parsed.set && Array.isArray(parsed.set)) {
            for (const s of parsed.set) {
              if (s && s.id) {
                const child = String(s.id).trim().toLowerCase();
                if (!fetched.has(child)) toFetch.add(child);
              }
            }
          }
        }

        // Any batch items not returned by DB are missing
        for (const sku of batch) {
          if (!result[sku]) {
            result[sku] = null;
            notFound.push(sku);
            fetched.add(sku); // considered processed
          }
        }

        // Remove processed from toFetch
        for (const k of batch) toFetch.delete(k);
      }

      // Now compute aggregates for each found product (sumPortionsOne, weightKgOne)
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
        // Normalize: if weight looks like kilograms (e.g. 0.42 or <= 10), convert to grams
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

          // Simple product
          const unitRatio = (typeof prod.unitRatio === 'number') ? prod.unitRatio : deriveUnitRatioFromWeight(prod.weight);
          const weightKgOne = calculateExpectedWeight(prod, 1);
          const simple = { sumPortionsOne: unitRatio || 1, weightKgOne };
          calcCache.set(sku, simple);
          visited.delete(sku);
          return simple;
        } catch (err) {
          visited.delete(sku);
          return { sumPortionsOne: 1, weightKgOne: 0 };
        }
      };

      // compute for all keys present in result (excluding nulls)
      const keys = Object.keys(result);
      for (const k of keys) {
        if (result[k]) {
          const calc = await computeAggregates(k);
          // attach calc to product payload
          result[k].calc = calc;
        }
      }

      const durationMs = Date.now() - start;
      const foundCount = Object.values(result).filter(v => v).length;

      logServer(`✅ ExpandService.flattenBatch: requested=${skus.length}, closure=${Object.keys(result).length}, found=${foundCount}, missing=${notFound.length}, time=${durationMs}ms`);

      return { products: result, notFound, foundCount, durationMs };
    } catch (error) {
      logServer('Error in ExpandService.flattenBatch', error);
      throw error;
    }
  }
}

export default ExpandService;
