import { useEffect, useState } from 'react';
import { Card, CardBody, Chip } from '@heroui/react';
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
  name: string;
  quantity: number;
  sku: string;
}

interface ActiveProductSetsProps {
  orderItems: OrderItem[];
  className?: string;
}

/**
 * 📦 Компонент для відображення активних комплектів в замовленні (включаючи вкладені)
 */
export function ActiveProductSets({ orderItems, className = '' }: ActiveProductSetsProps) {
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
        const displayName = parentName 
          ? `↘ ${product.name}` 
          : product.name;
        
        sets.push({
          name: displayName,
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
    <Card className={`w-full ${className}`}>
      <CardBody className="gap-3">
        {/* Заголовок */}
        <div className="flex items-center">
          <h3 className="font-semibold text-danger">Активні комплекти</h3>
        </div>

        {/* Список комплектів */}
        <div className="flex flex-col gap-2">
          {productSets.map((set, index) => (
            <div
              key={`${set.sku}-${index}`}
              className="flex items-center justify-between gap-2"
            >
              {/* Назва комплекту */}
              <div className="flex items-center flex-1 min-w-0">
                <span className="text-sm font-medium text-neutral-800">
                  {set.name}
                </span>
              </div>

              {/* Кількість */}
              <Chip
                size="sm"
                variant="flat"
                color="primary"
                classNames={{
                  base: 'bg-primary/10',
                  content: 'text-primary font-semibold',
                }}
              >
                ×{set.quantity}
              </Chip>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
