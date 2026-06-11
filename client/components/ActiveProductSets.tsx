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
  const collectSetsRecursively = async (
    sku: string,
    quantity: number,
    sets: ProductSetInfo[],
    visitedSets: Set<string> = new Set(),
    depth: number = 0,
    parentName: string = ''
  ): Promise<void> => {
    // Захист від нескінченної рекурсії
    const MAX_DEPTH = 10;
    if (depth > MAX_DEPTH || visitedSets.has(sku)) {
      return;
    }

    try {
      const response = await apiCall(`/api/products/${sku}`);
      if (!response.ok) return;

      const product: Product = await response.json();

      // Якщо товар має set і він не порожній - це комплект
      if (product.set && Array.isArray(product.set) && product.set.length > 0) {
        // Додаємо цей комплект до списку
        // const displayName = parentName ? product.name : product.name;
        
        sets.push({
          name: product.name,
          hasParents: !!parentName,
          quantity: quantity,
          sku: sku,
        });

        // Додаємо до відвіданих
        visitedSets.add(sku);

        // Рекурсивно обробляємо компоненти комплекту
        for (const setItem of product.set) {
          if (!setItem.id) continue;

          const componentQuantity = quantity * setItem.quantity;

          // 🔄 РЕКУРСИВНИЙ ВИКЛИК - шукаємо вкладені комплекти
          await collectSetsRecursively(
            setItem.id,
            componentQuantity,
            sets,
            new Set(visitedSets), // Копія Set для кожної гілки
            depth + 1,
            product.name // Передаємо назву батьківського комплекту
          );
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
        const sets: ProductSetInfo[] = [];

        for (const item of orderItems) {
          try {
            // Рекурсивно збираємо всі комплекти (включаючи вкладені)
            await collectSetsRecursively(
              item.sku, 
              item.quantity, 
              sets, 
              new Set(), 
              0,
              '' // Початково немає батьківського комплекту
            );
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

  // Не показуємо компонент, якщо немає комплектів
  if (loading || productSets.length === 0) {
    return null;
  }

  return (
    <Card classNames={{ 
      base: 'w-full bg-transparent shadow-none bg-danger rounded-lg p-1',
      header: 'text-sm text-white font-medium py-2',
      body: 'bg-white gap-2 rounded-[14px] shadow',
    }}>
      <CardHeader>Активні комплекти</CardHeader>
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
