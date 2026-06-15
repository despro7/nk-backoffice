import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useApi } from '@/hooks/useApi';

interface Product {
  id: number;
  sku: string;
  name: string;
  set: Array<{ id: string; quantity: number }> | null;
}

interface OrderItem {
  productName: string;
  quantity: number;
  price: number;
  sku: string;
}

interface ProductSetInfo {
  name: string | React.ReactNode;
  hasParents: boolean;
  quantity: number;
  sku: string;
}

interface ActiveProductSetsProps {
  orderItems: OrderItem[];
}

/**
 * 📦 Компонент для відображення активних комплектів в замовленні (включаючи вкладені)
 */
export function ActiveProductSets({ orderItems }: ActiveProductSetsProps) {
  const { apiCall } = useApi();
  const [productSets, setProductSets] = useState<ProductSetInfo[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Рекурсивно збирає всі комплекти (включаючи вкладені) з товару
   * @param sku - SKU товару для обробки
   * @param quantity - Кількість товару
   * @param sets - Масив для накопичення знайдених комплектів
   * @param visitedSets - Set для відстеження відвіданих SKU
   * @param depth - Поточна глибина рекурсії
   * @param parentName - Назва батьківського комплекту (для вкладених)
   */
  const collectSetsFromMap = async (
    sku: string,
    quantity: number,
    sets: ProductSetInfo[],
    visitedSets: Set<string> = new Set(),
    depth: number = 0,
    parentName: string = ''
  ): Promise<void> => {
    // Використовуємо productsMap (отримаємо його в замиканні) — ця функція
    // буде викликана тільки після batch-fetch; тут реалізовано локальну рекурсію
    const MAX_DEPTH = 10;
    if (depth > MAX_DEPTH || visitedSets.has(sku)) return;

    try {
      // productsMap буде доступний через зовнішню змінну в useEffect
      // Але у випадку відсутності запису — робимо мінімальний fallback
      // (не кілька фетчів підряд)
      // @ts-ignore
      const productsMap: Record<string, Product> = (collectSetsFromMap as any).productsMap || {};

      let product = productsMap[sku];
      if (!product) {
        // Лише один мінімальний fallback GET якщо батч не повернув SKU
        try {
          const r = await apiCall(`/api/products/${sku}`);
          if (r && r.ok) product = await r.json();
        } catch (e) {
          // ignore
        }
      }

      if (!product) return;

      if (product.set && Array.isArray(product.set) && product.set.length > 0) {
        sets.push({ name: product.name, hasParents: !!parentName, quantity, sku });
        visitedSets.add(sku);

        for (const setItem of product.set) {
          if (!setItem.id) continue;
          const componentQuantity = quantity * setItem.quantity;
          await collectSetsFromMap(setItem.id, componentQuantity, sets, new Set(visitedSets), depth + 1, product.name);
        }

        visitedSets.delete(sku);
      }
    } catch (error) {
      console.warn(`⚠️ Помилка при обробці товару ${sku}:`, error);
    }
  };

  useEffect(() => {
    const fetchProductSets = async () => {
      if (!orderItems || orderItems.length === 0) {
        setLoading(false);
        return;
      }

      try {
        // Batch-fetch initial SKUs and their closure using server endpoint
        const initialSkus = orderItems.map(i => i.sku).filter(Boolean);
        const res = await apiCall('/api/expand/flatten', { method: 'POST', body: JSON.stringify({ skus: initialSkus }), headers: { 'Content-Type': 'application/json' } });
        let productsMap: Record<string, Product> = {};
        if (res && res.ok) {
          const json = await res.json();
          productsMap = (json && json.products) ? json.products : {};
        }

        // Прив'язуємо productsMap до функції для локального доступу в рекурсії
        (collectSetsFromMap as any).productsMap = productsMap;

        const sets: ProductSetInfo[] = [];
        for (const item of orderItems) {
          try {
            await collectSetsFromMap(item.sku, item.quantity, sets, new Set(), 0, '');
          } catch (error) {
            console.warn(`⚠️ Помилка при обробці товару ${item.sku}:`, error);
          }
        }

        setProductSets(sets);
      } catch (error) {
        console.error('❌ Помилка при завантаженні комплектів:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProductSets();
  }, [orderItems]); // Removed apiCall from dependencies

  // Показуємо стан завантаження; якщо немає комплектів після завантаження — не рендеримо
  if (loading) {
    return (
      <Card classNames={{ base: 'w-full shadow-none bg-danger rounded-lg p-1', header: 'text-sm text-white font-medium py-2 px-2 flex items-center gap-1.5', body: 'bg-white gap-2 rounded-[14px] shadow' }}>
        <CardHeader>
          <DynamicIcon name="package-2" size={16} strokeWidth={1.5} className="text-white shrink-0" />
          Активні комплекти
        </CardHeader>
        <CardBody className="gap-3">
          <div className="text-sm text-neutral-500 flex items-center gap-2"> 
            <DynamicIcon name="loader" size={16} />
            Завантаження комплектів...
          </div>
        </CardBody>
      </Card>
    );
  }

  if (!loading && productSets.length === 0) return null;

  return (
    <Card classNames={{ 
      base: 'w-full shadow-none bg-danger rounded-[18px] p-1',
      header: 'text-sm text-white font-medium pt-1.5 pb-2 px-2 flex items-center gap-1.5',
      body: 'bg-white gap-2 rounded-[14px] shadow',
    }}>
      <CardHeader>
        <DynamicIcon name="package-2" size={16} strokeWidth={1.5} className="text-white shrink-0" />
        Активні комплекти
      </CardHeader>
      <CardBody className="gap-3">
        {/* Список комплектів */}
        {/* <div className={`flex flex-col gap-2 ${productSets.some(set => set.hasParents) ? '[&>div+div]:border-t [&>div+div]:border-gray-200 [&>div+div]:pt-2' : ''}`}> */}
        <div className={`flex flex-col`}>
          {productSets.map((set, index) => (
            <div
              key={`${set.sku}-${index}`}
              // className="flex items-center justify-between gap-1"
              className={`flex items-center justify-between gap-2 ${!set.hasParents && index > 0 ? 'border-t-1 border-gray-100 pt-2 mt-2' : ''}`}
            >
              {/* Назва комплекту */}
              <div className={`flex items-center gap-1 flex-1 min-w-0 text-sm ${!set.hasParents ? 'font-semibold text-neutral-800' : 'text-neutral-600'}`}>
                {set.hasParents && <DynamicIcon name="corner-down-right" size={16} />}
                {set.name}
              </div>

              {/* Кількість */}
              <Chip
                size="md"
                variant="light"
                color="danger"
                classNames={{
                  base: `text-[13px] ${set.hasParents ? 'bg-none' : 'bg-danger/10'}`,
                  content: `${set.hasParents ? 'text-gray-500' : 'text-danger font-semibold'}`,
                }}
              >
                {set.quantity}
              </Chip>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
