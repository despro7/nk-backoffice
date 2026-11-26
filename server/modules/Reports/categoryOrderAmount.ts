/**
 * Частка суми замовлення, що припадає на відфільтровані листові товари (звіт по продажам).
 */

export type CategoryAmountOrderLine = {
  sku?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
};

export type CategoryAmountProduct = {
  sku: string;
  name?: string | null;
  set?: unknown;
};

export type CategoryAmountProductLookup = (sku: string) => Promise<CategoryAmountProduct | null | undefined>;

type Leaf = { sku: string; name: string; portions: number };

const MAX_DEPTH = 10;

/** Правила розгортання ті самі, що в `orderDatabaseService.expandProductRecursively`. */
async function expandLeaves(
  sku: string,
  quantity: number,
  lookup: CategoryAmountProductLookup,
  leaves: Leaf[],
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<void> {
  if (depth > MAX_DEPTH || visited.has(sku)) return;

  let product: CategoryAmountProduct | null | undefined;
  try {
    product = await lookup(sku);
  } catch (error) {
    console.error(`❌ Помилка розгортання товару ${sku}:`, error);
    return;
  }
  if (!product) return;

  const components = Array.isArray(product.set)
    ? (product.set as Array<{ id?: string; quantity?: number } | null>).filter(
        (component): component is { id: string; quantity: number } =>
          Boolean(component && typeof component === 'object' && component.id && component.quantity),
      )
    : [];

  if (components.length === 0) {
    leaves.push({ sku: product.sku, name: product.name || product.sku, portions: quantity });
    return;
  }

  const nextVisited = new Set(visited).add(sku);
  for (const component of components) {
    await expandLeaves(component.id, quantity * component.quantity, lookup, leaves, nextVisited, depth + 1);
  }
}

/**
 * Суми по листових SKU замовлення (без округлення). Сума рядка комплекту ділиться між
 * компонентами пропорційно порціям, результат масштабується до `totalPrice` замовлення
 * (знижки, доставка тощо). Якщо в рядках немає цін, `totalPrice` ділиться пропорційно порціям.
 */
export async function getOrderLeafAmounts(params: {
  items: CategoryAmountOrderLine[] | null | undefined;
  totalPrice: number | string | null | undefined;
  lookup: CategoryAmountProductLookup;
}): Promise<Map<string, { name: string; amount: number }>> {
  const { items, lookup } = params;
  const totalPrice = Number(params.totalPrice) || 0;

  let linesAmount = 0;
  let allPortions = 0;
  const bySku = new Map<string, { name: string; portions: number; lineAmount: number }>();

  for (const line of Array.isArray(items) ? items : []) {
    if (!line || typeof line !== 'object') continue;

    const quantity = Number(line.quantity) || 0;
    const lineAmount = (Number(line.price) || 0) * quantity;
    linesAmount += lineAmount;

    if (!line.sku || quantity <= 0) continue;

    const leaves: Leaf[] = [];
    await expandLeaves(String(line.sku), quantity, lookup, leaves);

    const linePortions = leaves.reduce((sum, leaf) => sum + leaf.portions, 0);
    if (linePortions <= 0) continue;

    allPortions += linePortions;
    for (const leaf of leaves) {
      const entry = bySku.get(leaf.sku) ?? { name: leaf.name, portions: 0, lineAmount: 0 };
      entry.portions += leaf.portions;
      entry.lineAmount += lineAmount * (leaf.portions / linePortions);
      bySku.set(leaf.sku, entry);
    }
  }

  return new Map(
    Array.from(bySku, ([sku, entry]) => {
      let amount = 0;
      if (linesAmount > 0) {
        amount = entry.lineAmount * (totalPrice / linesAmount);
      } else if (allPortions > 0) {
        amount = totalPrice * (entry.portions / allPortions);
      }
      return [sku, { name: entry.name, amount }];
    }),
  );
}

/** Частка суми замовлення, що припадає на листові товари, які проходять фільтр. */
export async function getCategoryOrderAmount(params: {
  items: CategoryAmountOrderLine[] | null | undefined;
  totalPrice: number | string | null | undefined;
  lookup: CategoryAmountProductLookup;
  isIncluded: (leafSku: string, leafName: string) => boolean;
}): Promise<number> {
  let amount = 0;
  for (const [sku, leaf] of await getOrderLeafAmounts(params)) {
    if (params.isIncluded(sku, leaf.name)) amount += leaf.amount;
  }

  return Math.round(amount * 100) / 100;
}
