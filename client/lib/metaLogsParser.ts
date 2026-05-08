import type { MetaLogRow } from '@shared/types/metaLog';

export type ParsedItems = {
  names: string[];
  skus: string[];
  needed: string[];
  stock: string[];
  missing: string[];
};

export function parseShipmentMessage(row: MetaLogRow): ParsedItems {
  const raw = String((row.rawMessage ?? (row as any).message ?? (row.data && ((row.data.error as string) ?? (row.data.dilovodResponse && (row.data.dilovodResponse.error as string))))) ?? '');

  // try to extract content after "Недостатня кількість" or similar phrase
  const headerMatch = raw.match(/Недостатн[а-яі]*[^:]*:\s*([\s\S]*)/i) || raw.match(/Недостатньо[:\s]*([\s\S]*)/i);
  let itemsText = headerMatch ? headerMatch[1] : (() => {
    // fallback: find first occurrence of the token and take rest of string
    const idx = raw.search(/Недостатн[а-яі]*/i);
    return idx >= 0 ? raw.substring(idx) : raw;
  })();

  const rawItems = itemsText.split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);

  // filter out header-like fragments that are not actual items
  const filteredItems = rawItems.filter(it => {
    if (!it) return false;
    const low = it.toLowerCase();
    // exclude header-like fragments and messages
    if (/^не?достатn/i.test(low)) return false; // starts with 'Недостатня...'
    if (/помилка відвантаження|помилка/i.test(low)) return false;
    if (/обов|поле відсут|відсутн|покупець|відсутні/i.test(low)) return false;
    // exclude lines containing em-dash separators that usually indicate field errors
    if (it.includes('—') || it.includes('--')) return false;
    // product-like heuristics: keep only lines that contain SKU or unit or comma+digits
    const isSku = /(?<!\p{L})арт[:\s]*[0-9A-Za-z\-]+/iu.test(it);
    const isUnit = /,\s*\d+[\d.,]*\s*(г|кг|шт|шт\.|мл|л)/i.test(it) || /\b\d+[\d.,]*\s*(шт|шт\.)/i.test(it) || /\d+\s*г/i.test(it);
    if (!isSku && !isUnit) return false;
    return true;
  });

  const names: string[] = [];
  const skus: string[] = [];
  const needed: string[] = [];
  const stock: string[] = [];
  const missing: string[] = [];

  for (const it of filteredItems) {
    const skuMatch = it.match(/(?<!\p{L})арт[:\s]*([^|]+)/iu);
    const needMatch = it.match(/потрібн[оа]*[:\s]*([^|]+)/i);
    const stockMatch = it.match(/залишок[:\s]*([^|]+)/i);
    const missingMatch = it.match(/бракує[:\s]*([^|]+)/i);

    let name = it.split('|')[0].trim();
    if (!name && skuMatch) name = it.replace(skuMatch[0], '').trim();
    if (!name && row.productName) name = String(row.productName);

    names.push(name || '—');
    let skuVal = (skuMatch && skuMatch[1].trim()) || (row.sku ? String(row.sku) : '—');
    // clean sku: take first token of captured group and remove non-alphanumerics
    if (skuVal && skuVal !== '—') {
      const tok = String(skuVal).trim().split(/[\s|,]+/)[0];
      const cleaned = (tok.match(/[0-9A-Za-z\-]+/) || [tok])[0];
      skuVal = cleaned || skuVal;
    }
    skus.push(skuVal);
    needed.push((needMatch && needMatch[1].trim()) || (row.needed != null ? String(row.needed) : '—'));
    stock.push((stockMatch && stockMatch[1].trim()) || (row.stock != null ? String(row.stock) : '—'));
    missing.push((missingMatch && missingMatch[1].trim()) || (row.missing != null ? String(row.missing) : '—'));
  }

  if (names.length === 0) {
    // fallback only if productName/sku looks like a product (contains unit or SKU)
    const pn = row.productName ? String(row.productName) : '';
    const hasSku = row.sku ? true : false;
    const pnIsProduct = /,\s*\d+[\d.,]*\s*(г|кг|шт|шт\.|мл|л)/i.test(pn) || /(?<!\p{L})арт[:\s]*[0-9A-Za-z\-]+/iu.test(pn);
    if (pnIsProduct || hasSku) {
      return {
        names: [row.productName ?? '—'],
        skus: [row.sku ?? '—'],
        needed: [row.needed == null ? '—' : String(row.needed)],
        stock: [row.stock == null ? '—' : String(row.stock)],
        missing: [row.missing == null ? '—' : String(row.missing)]
      };
    }
    return { names: [], skus: [], needed: [], stock: [], missing: [] };
  }

  return { names, skus, needed, stock, missing };
}

export function dedupeAndNormalize(parsed: ParsedItems): ParsedItems {
  const allNames = parsed.names;
  const allSkus = parsed.skus;
  const allNeeded = parsed.needed;
  const allStock = parsed.stock;
  const allMissing = parsed.missing;

  const itemMap = new Map<string, { name: string; sku: string; need: string; stock: string; miss: string }>();
  const maxLen = Math.max(allNames.length, allSkus.length, allNeeded.length, allStock.length, allMissing.length);
  const normalize = (v?: string) => {
    if (!v) return '—';
    let s = String(v).replace(/\s*шт\.?$/i, '').trim();
    // normalize numeric like 2.000 -> 2 and 1.000 -> 1
    if (/^[0-9]+(?:[.,][0-9]+)?$/.test(s)) {
      const num = Number(String(s).replace(',', '.'));
      if (!Number.isNaN(num)) {
        return Number.isInteger(num) ? String(Math.trunc(num)) : String(num).replace(/(?:\.0+|(?<=\.[0-9]*?)0+$)/, '').replace(/\.$/, '');
      }
    }
    return s;
  };
  for (let i = 0; i < maxLen; i++) {
    const name = (allNames[i] ?? '—') || '—';
    const sku = (allSkus[i] ?? '—') || '—';
    const need = normalize(allNeeded[i] ?? '—');
    const st = normalize(allStock[i] ?? '—');
    const miss = normalize(allMissing[i] ?? '—');
    const key = sku !== '—' ? sku : `${name}::${i}`;
    if (!itemMap.has(key)) {
      itemMap.set(key, { name, sku, need, stock: st, miss });
    } else {
      const ex = itemMap.get(key)!;
      if ((ex.name === '—' || !ex.name) && name !== '—') ex.name = name;
      if ((ex.sku === '—' || !ex.sku) && sku !== '—') ex.sku = sku;
      if ((ex.need === '—' || !ex.need) && need !== '—') ex.need = need;
      if ((ex.stock === '—' || !ex.stock) && st !== '—') ex.stock = st;
      if ((ex.miss === '—' || !ex.miss) && miss !== '—') ex.miss = miss;
    }
  }

  const dedupNames: string[] = [];
  const dedupSkus: string[] = [];
  const dedupNeeded: string[] = [];
  const dedupStock: string[] = [];
  const dedupMissing: string[] = [];
  for (const v of itemMap.values()) {
    dedupNames.push(v.name);
    dedupSkus.push(v.sku);
    dedupNeeded.push(v.need);
    dedupStock.push(v.stock);
    dedupMissing.push(v.miss);
  }
  return { names: dedupNames, skus: dedupSkus, needed: dedupNeeded, stock: dedupStock, missing: dedupMissing };
}
