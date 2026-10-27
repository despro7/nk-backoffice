export type DilovodInsufficientStockRow = {
  name: string;
  sku: string;
  batch: string;
  needed: string;
  stock: string;
  missing: string;
};

function stripQtyUnit(value: string): string {
  return value.replace(/\s*шт\.?$/i, '').trim();
}

function parseBlock(productName: string, block: string): DilovodInsufficientStockRow | null {
  const sku = block.match(/Артикул:\s*(\S+)/i)?.[1]?.replace(/\s*\|.*$/, '').trim() ?? '';
  const batch = block.match(/Партія:\s*(\S+)/i)?.[1]?.replace(/\s*\|.*$/, '').trim() ?? '';
  const needed = stripQtyUnit(block.match(/Потрібно:\s*([\d.,]+\s*шт\.?)/i)?.[1]?.trim() ?? '');
  const stock = stripQtyUnit(block.match(/Вільний залишок:\s*([\d.,]+\s*шт\.?)/i)?.[1]?.trim() ?? '');
  const missing = stripQtyUnit(block.match(/Недостатньо:\s*([\d.,]+\s*шт\.?)/i)?.[1]?.trim() ?? '');

  if (!sku && !productName) return null;

  return {
    name: productName || '—',
    sku: sku || '—',
    batch: batch || '—',
    needed: needed || '—',
    stock: stock || '—',
    missing: missing || '—',
  };
}

/** Розбір applicationLayerError з HTML <span> (недостатній залишок по позиціях). */
export function parseDilovodInsufficientStockRows(raw: string): DilovodInsufficientStockRow[] {
  const input = String(raw ?? '').trim();
  if (!input) return [];

  let cleaned = input
    .replace(/^applicationLayerError\s*/i, '')
    .replace(/^multithreadApiSession\s*/i, '')
    .trim();

  if (cleaned.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned) as { error?: unknown };
      if (parsed.error != null) {
        cleaned = String(parsed.error);
      }
    } catch {
      // keep as text
    }
  }

  const rows: DilovodInsufficientStockRow[] = [];
  const blockRegex = /<span[^>]*>([^<]+)<\/span>([\s\S]*?)(?=<span|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(cleaned)) !== null) {
    const row = parseBlock(match[1].trim(), match[2]);
    if (row) rows.push(row);
  }
  if (rows.length > 0) return rows;

  const plain = cleaned
    .replace(/<span[^>]*>([^<]+)<\/span>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const segments = plain.split(/\s+(?=[А-ЯA-ZЇІЄҐ])/).filter((part) => /Артикул:/i.test(part));
  for (const segment of segments) {
    const name = segment.split('|')[0]?.trim() ?? '';
    const row = parseBlock(name, segment);
    if (row) rows.push(row);
  }

  return rows;
}
