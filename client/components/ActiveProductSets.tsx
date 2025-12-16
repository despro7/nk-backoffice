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
 * 📦 Компонент для відображення активних комплектів в замовленні
 */
export function ActiveProductSets({ orderItems, className = '' }: ActiveProductSetsProps) {
  const { apiCall } = useApi();
  const [productSets, setProductSets] = useState<ProductSetInfo[]>([]);
  const [loading, setLoading] = useState(true);

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
            const response = await apiCall(`/api/products/${item.sku}`);
            if (response.ok) {
              const product: Product = await response.json();

              // Перевіряємо, чи це комплект
              if (product.set && Array.isArray(product.set) && product.set.length > 0) {
                sets.push({
                  name: item.productName,
                  quantity: item.quantity,
                  sku: item.sku,
                });
              }
            }
          } catch (error) {
            console.warn(`⚠️ Помилка при отриманні товару ${item.sku}:`, error);
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
  }, [orderItems, apiCall]);

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
