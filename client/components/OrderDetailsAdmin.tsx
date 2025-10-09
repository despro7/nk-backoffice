import { Card, CardBody, CardHeader, Code } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDateOnly, formatTimeOnly } from '../lib/formatUtils';

interface OrderDetailsAdminProps {
  order: any;
  externalId: string;
}

export function OrderDetailsAdmin({ order, externalId }: OrderDetailsAdminProps) {
  const hasItems = order?.items && order.items.length > 0;

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-800 mt-20 border-t border-gray-300 pt-16 mb-4">
        Деталі замовлення №{order.orderNumber || externalId}{' '}
        <Code color="danger" className="bg-danger-500 text-white text-base">
          лише для адміністраторів
        </Code>
      </h2>
      
      <div className="flex w-full gap-6">
        <div className="flex flex-1 min-w-0 flex-col gap-6">
          {/* Основна інформація */}
          <Card>
            <CardHeader className="border-b border-gray-200">
              <DynamicIcon name="info" size={20} className="text-gray-600 mr-2" />
              <h4 className="text-base font-semibold">Основна інформація</h4>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p><strong>ID:</strong> {order.id}</p>
                  <p><strong>Номер замовлення:</strong> {order.orderNumber || 'Не вказано'}</p>
                  <p><strong>ТТН:</strong> {order.ttn || 'Не вказано'}</p>
                  <p><strong>Кількість порцій:</strong> {order.quantity}</p>
                  <p><strong>Статус:</strong> {order.statusText}</p>
                </div>
                <div>
                  <p><strong>Дата створення:</strong> {order.orderDate ? formatDateOnly(order.orderDate) : 'Не вказано'} {order.orderDate && formatTimeOnly(order.orderDate)}</p>
                  <p><strong>Сума:</strong> {order.totalPrice} грн</p>
                  <p><strong>Спосіб доставки:</strong> {order.shippingMethod}</p>
                  <p><strong>Спосіб оплати:</strong> {order.paymentMethod}</p>
                  <p><strong>Коментар:</strong> {order.comment || 'Без коментаря'}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Інформація про клієнта */}
          <Card>
            <CardHeader className="border-b border-gray-200">
              <DynamicIcon name="user" size={20} className="text-gray-600 mr-2" />
              <h4 className="text-base font-semibold">Клієнт</h4>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p><strong>ПІБ:</strong> {order.customerName || 'Не вказано'}</p>
                  <p><strong>Телефон:</strong> {order.customerPhone || 'Не вказано'}</p>
                </div>
                <div>
                  <p><strong>Адреса доставки:</strong></p>
                  <p className="text-sm text-gray-600">{order.deliveryAddress || 'Не вказано'}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Склад замовлення */}
          <Card>
            <CardHeader className="border-b border-gray-200">
              <DynamicIcon name="box" size={20} className="text-gray-600 mr-2" />
              <h4 className="text-base font-semibold">Склад замовлення</h4>
            </CardHeader>
            <CardBody>
              {!hasItems ? (
                <p className="text-gray-500 text-center py-4">Склад замовлення порожній</p>
              ) : order.items && order.items.length > 0 ? (
                <div className="space-y-2">
                  {order.items.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-50 border-l-4 border-gray-300 rounded">
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-sm text-gray-600">SKU: {item.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{item.quantity} шт.</p>
                        <p className="text-sm text-gray-600">{item.price} грн</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Склад замовлення не вказано</p>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Сирі дані */}
        <div className="flex flex-1 min-w-0 flex-col gap-8">
          <Card className="flex-1">
            <CardHeader className="border-b border-gray-200">
              <DynamicIcon name="code" size={20} className="text-gray-600 mr-2" />
              <h4 className="text-base font-semibold">
                Сирі дані з SalesDrive API для замовлення №{order.orderNumber || externalId}
              </h4>
            </CardHeader>
            <CardBody>
              <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto h-full font-mono">
                {JSON.stringify(order.rawData || order, null, 2)}
              </pre>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

