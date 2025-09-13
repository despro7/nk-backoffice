import { Router, Request, Response } from 'express';
import { salesDriveService } from '../services/salesDriveService.js';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
import { ordersCacheService } from '../services/ordersCacheService.js';

// Добавляем типизацию для webhook payload
interface SalesDriveWebhookPayload {
  info: {
    webhookType: string;
    webhookEvent: string;
    account: string;
  };
  data: {
    id: number;
    externalId?: string;
    statusId?: number;
    [key: string]: any;
  };
  meta?: any;
}

const router = Router();

// Middleware для логирования webhook запросов
router.use('/salesdrive/order-update', (req, res, next) => {
  console.log('🔍 Webhook middleware - Request details:');
  console.log(`   Method: ${req.method}`);
  console.log(`   URL: ${req.url}`);
  console.log(`   Content-Type: ${req.headers['content-type']}`);
  console.log(`   User-Agent: ${req.headers['user-agent']}`);
  console.log(`   Origin: ${req.headers['origin']}`);
  console.log(`   Body exists: ${!!req.body}`);
  console.log(`   Body keys: ${req.body ? Object.keys(req.body).join(', ') : 'none'}`);

  // Продолжаем обработку
  next();
});


/**
 * POST /api/webhooks/salesdrive/order-update
 * WebHook от SalesDrive для обновления заказов
 */
router.post('/salesdrive/order-update', async (req: Request, res: Response) => {
  try {
    // console.log('🔔 WebHook received - Raw body:', JSON.stringify(req.body, null, 2));
    console.log(`🔍 Webhook event: ${req.body.info?.webhookEvent}`);

    const { data } = req.body;
    const orderId = data?.id?.toString();
    const externalId = data?.externalId;

    console.log(`🔔 WebHook received: status_change for order ${externalId || orderId}`);
    console.log(`   - data.id: ${data?.id}`);
    console.log(`   - data.externalId: ${data?.externalId}`);
    console.log(`   - orderId: ${orderId}`);
    console.log(`   - externalId: ${externalId}`);

    if (!orderId && !externalId) {
      console.log('❌ Missing order identifier - returning 400');
      return res.status(400).json({
        success: false,
        error: 'Missing order identifier'
      });
    }

    const orderIdentifier = externalId || orderId;

    // For status_change events, we always update the order
    if ( req.body.info?.webhookEvent === 'status_change' || req.body.info?.webhookEvent === 'new_order' ) {
      // Синхронизируем конкретный заказ
      try {
        console.log(`🔍 Looking for existing order in database first...`);

        // Маппинг статусов из SalesDrive в нашу систему
        // В БД статусы хранятся как строки '1', '2', '3' и т.д.
        const statusMapping: { [key: number]: string } = {
          1: '1', // Новий
          2: '2', // Підтверджено
          3: '3', // На відправку
          4: '4', // Відправлено
          5: '5', // Продаж
          6: '6', // Відмова
          7: '7', // Повернення
          8: '8'  // Видалений
        };

        // Функция для получения текста статуса
        const getStatusText = (status: string): string => {
          const statusTexts: { [key: string]: string } = {
            '1': 'Новий',
            '2': 'Підтверджено',
            '3': 'На відправку',
            '4': 'Відправлено',
            '5': 'Продаж',
            '6': 'Відмова',
            '7': 'Повернення',
            '8': 'Видалений'
          };
          return statusTexts[status] || 'Невідомий статус';
        };

        // Сначала проверим, есть ли заказ в нашей БД
        let existingOrder = await orderDatabaseService.getOrderByExternalId(orderIdentifier);
        let orderDetails = null;
        
        const webhookData = req.body.data;
        const webhookMeta = req.body.meta.fields;
        console.log('================= \n webhookMeta:', webhookMeta);

        // Сериализуем items из webhookData.products в нужный формат
        const items = Array.isArray(webhookData.products) ? webhookData.products.map(p => ({
            productName: p.name || '',
            quantity: p.amount || 0,
            price: p.price || 0,
            sku: p.sku || ''
          }))
        : [];

        // Добавляем информацию о клиенте
        let customerName = '';
        let customerPhone = '';

        if (webhookData.contacts) {
          const contact = webhookData.contacts;
          customerName = `${contact[0]?.lName || ''} ${contact[0]?.fName || ''} ${contact[0]?.mName || ''}`.trim();
          customerPhone = Array.isArray(contact[0].phone) ? contact[0].phone[0] : contact[0].phone || '';
        }

        // Добавляем информацию о доставке
        let shippingMethod = '';
        let paymentMethod = '';

        if (webhookMeta.shipping_method.options) {
          shippingMethod = webhookMeta.shipping_method.options[0]?.text?.toString() || '';
        }
        if (webhookMeta.payment_method.options) {
          paymentMethod = webhookMeta.payment_method.options[0]?.text?.toString() || '';
        }

        if (existingOrder) {
          // Для существующего заказа используем данные из webhook, если они есть, иначе из БД
          orderDetails = {
            id: existingOrder.id,
            orderNumber: existingOrder.externalId,
            status: existingOrder.status,
            statusText: existingOrder.statusText,
            // Товары: webhook имеет приоритет над данными из БД
            items: items || existingOrder.items,
            // Контактные данные: webhook имеет приоритет
            customerName: customerName || existingOrder.customerName,
            customerPhone: customerPhone || existingOrder.customerPhone,
            // Адрес доставки: webhook имеет приоритет
            deliveryAddress: webhookData.shipping_address || existingOrder.deliveryAddress,
            // Сумма: webhook имеет приоритет
            totalPrice: webhookData.paymentAmount || existingOrder.totalPrice,
            // Дата заказа: webhook имеет приоритет, с обработкой ошибок
            orderDate: webhookData.orderTime ? new Date(webhookData.orderTime).toISOString() : existingOrder.orderDate,
            // Способы доставки/оплаты: webhook имеет приоритет
            shippingMethod: shippingMethod || existingOrder.shippingMethod,
            paymentMethod: paymentMethod || existingOrder.paymentMethod,
            // Город: webhook имеет приоритет
            cityName: existingOrder.cityName,
            provider: existingOrder.provider, // Provider всегда из БД
            // Другие поля: webhook имеет приоритет
            pricinaZnizki: webhookData.pricinaZnizki != null ? String(webhookData.pricinaZnizki) : existingOrder.pricinaZnizki,
            sajt: webhookData.sajt != null ? String(webhookData.sajt) : existingOrder.sajt,
            ttn: webhookData.ord_novaposhta?.EN || existingOrder.ttn,
            quantity: webhookData.kilTPorcij || existingOrder.quantity
          };
        } else {
          // Если новый заказ – создаем заказ на основе данных из webhook, без обращения к SalesDrive API
          orderDetails = {
            id: parseInt(webhookData.id) || 0, // Используем внутренний ID из webhook
            orderNumber: webhookData.externalId || orderIdentifier, // Используем externalId как orderNumber
            status: webhookData.statusId ? statusMapping[webhookData.statusId] || '1' : '1',
            statusText: 'Новий', // По умолчанию
            items: items,
            customerName: customerName || 'Невідомий клієнт',
            customerPhone: customerPhone || '',
            deliveryAddress: webhookData.shipping_address || '',
            totalPrice: webhookData.paymentAmount || 0,
            orderDate: webhookData.orderTime ? new Date(webhookData.orderTime).toISOString() : null,
            shippingMethod: shippingMethod || '',
            paymentMethod: paymentMethod || '',
            cityName: webhookData.ord_novaposhta?.cityTemplateName || webhookData.ord_ukrposhta?.cityName || '',
            provider: 'SalesDrive',
            pricinaZnizki: webhookData.pricinaZnizki != null ? String(webhookData.pricinaZnizki) : '',
            sajt: webhookData.sajt != null ? String(webhookData.sajt) : '',
            ttn: webhookData.ord_novaposhta?.EN || '',
            quantity: webhookData.kilTPorcij || 1
          };
          console.log(`📋 Created order details from webhook data: id=${orderDetails.id}, orderNumber=${orderDetails.orderNumber}`);
        }

        if (orderDetails) {
          console.log(`📋 Order details received:`);
          console.log(`   - orderIdentifier (from webhook): ${orderIdentifier}`);
          console.log(`   - orderDetails.orderNumber: ${orderDetails.orderNumber}`);
          console.log(`   - orderDetails.id: ${orderDetails.id}`);


          if (existingOrder) {
            console.log(`🔄 Updating existing order ${existingOrder.externalId}`);

            const newStatus = statusMapping[webhookData.statusId] || orderDetails.status;

            console.log(`🔄 Status mapping: webhook statusId=${webhookData.statusId} -> status='${newStatus}'`);

            // Проверяем, какие поля действительно изменились
            const changes: { [key: string]: any } = {};

            // Статус всегда обновляем (главное изменение в webhook)
            if (newStatus !== existingOrder.status) {
              changes.status = newStatus;
              changes.statusText = getStatusText(newStatus);
            }

            // RawData всегда обновляем (для истории изменений)
            changes.rawData = webhookData;

            // Сравниваем остальные поля с данными из БД
            const fieldsToCheck = [
              { key: 'customerName', newValue: orderDetails.customerName, oldValue: existingOrder.customerName },
              { key: 'customerPhone', newValue: orderDetails.customerPhone, oldValue: existingOrder.customerPhone },
              { key: 'deliveryAddress', newValue: orderDetails.deliveryAddress, oldValue: existingOrder.deliveryAddress },
              { key: 'totalPrice', newValue: orderDetails.totalPrice, oldValue: existingOrder.totalPrice },
              { key: 'orderDate', newValue: orderDetails.orderDate, oldValue: existingOrder.orderDate },
              { key: 'shippingMethod', newValue: orderDetails.shippingMethod, oldValue: existingOrder.shippingMethod },
              { key: 'paymentMethod', newValue: orderDetails.paymentMethod, oldValue: existingOrder.paymentMethod },
              { key: 'cityName', newValue: orderDetails.cityName, oldValue: existingOrder.cityName },
              { key: 'pricinaZnizki', newValue: orderDetails.pricinaZnizki, oldValue: existingOrder.pricinaZnizki },
              { key: 'sajt', newValue: orderDetails.sajt, oldValue: existingOrder.sajt },
              { key: 'ttn', newValue: orderDetails.ttn, oldValue: existingOrder.ttn },
              { key: 'quantity', newValue: orderDetails.quantity, oldValue: existingOrder.quantity }
            ];

            // Проверяем товары отдельно (массив)
            const itemsChanged = JSON.stringify(orderDetails.items) !== JSON.stringify(existingOrder.items);
            if (itemsChanged) {
              changes.items = orderDetails.items;
            }

            // Добавляем только изменившиеся поля
            fieldsToCheck.forEach(({ key, newValue, oldValue }) => {
              if (newValue !== oldValue) {
                changes[key] = newValue;
              }
            });

            const updateData = changes;

            console.log(`📊 Update data (${Object.keys(updateData).length} fields changed):`, {
              changedFields: Object.keys(updateData).map(
                key => ({
                  field: key,
                  from: existingOrder[key],
                  to: updateData[key]
                })
              ),
              oldStatus: existingOrder.status,
              newStatus: updateData.status || 'no change',
              hasItems: !!updateData.items,
              hasRawData: !!updateData.rawData
            });


            // Проверяем items перед передачей
            if (updateData.items) {
              try {
                const testSerialize = JSON.stringify(updateData.items);
                console.log(`✅ Items serialization test passed, length: ${testSerialize.length}`);

                // Дополнительная проверка: если items пустой массив, не передаем его
                if (Array.isArray(updateData.items) && updateData.items.length === 0) {
                  console.log(`ℹ️ Items array is empty, not updating items in database`);
                  updateData.items = undefined; // Не передаем пустой массив
                }
              } catch (serializeError) {
                console.error(`❌ Items serialization failed:`, serializeError);
                console.log(`   Items type: ${typeof updateData.items}`);
                console.log(`   Items isArray: ${Array.isArray(updateData.items)}`);
                // Не передаем items если они не сериализуются
                updateData.items = null;
              }
            }

            // Проверяем, изменились ли товары (теперь проверяем только если items в updateData)
            const webhookHasNewItems = !!updateData.items;

            console.log(`📦 Webhook items check: itemsChanged=${itemsChanged}, hasNewItems=${!!updateData.items}, willUpdateCache=${webhookHasNewItems}`);

            // Если ничего не изменилось, пропускаем обновление
            if (Object.keys(updateData).length === 0) {
              console.log(`ℹ️ No changes detected for order ${existingOrder.externalId}, skipping update`);
              return res.json({
                success: true,
                message: `No changes for order ${orderIdentifier}`,
                timestamp: new Date().toISOString()
              });
            }

            // Обновляем существующий заказ
            await orderDatabaseService.updateOrder(existingOrder.externalId, updateData);

            console.log(`✅ Order ${orderDetails.orderNumber} updated via webhook`);

            // Логируем изменение статуса только если оно было
            if (updateData.status) {
              console.log(`   Status changed: ${existingOrder.status} -> ${updateData.status}`);
              console.log(`🎉 Status successfully updated to: ${updateData.status}`);
            }

            // Обновляем кеш только если в webhook пришли новые товары
            if (webhookHasNewItems) {
              try {
                await orderDatabaseService.updateOrderCache(existingOrder.externalId);
                console.log(`✅ Cache updated for order ${existingOrder.externalId} (items changed)`);
              } catch (cacheError) {
                console.warn(`⚠️ Failed to update cache for order ${existingOrder.externalId}:`, cacheError);
                // Не прерываем выполнение из-за ошибки кеширования
              }
            } else {
              console.log(`ℹ️ Cache not updated for order ${existingOrder.externalId} (no items change)`);
            }
          } else {
            // Создаем новый заказ с данными из webhook
            console.log(`🆕 Creating new order ${orderDetails.orderNumber}`);

            // Маппинг статуса для нового заказа из webhook
            const newOrderStatus = statusMapping[webhookData.statusId] || '1'; // По умолчанию '1' (Новий)
            const newOrderStatusText = getStatusText(newOrderStatus);

            // Валидация обязательных полей перед созданием
            const requiredFields = {
              id: orderDetails.id,
              externalId: orderDetails.orderNumber,
              orderNumber: orderDetails.orderNumber
            };

            if (!requiredFields.id) {
              console.error(`❌ Missing required field: id`);
              return res.status(400).json({
                success: false,
                error: 'Missing required field: id'
              });
            }

            if (!requiredFields.externalId) {
              console.error(`❌ Missing required field: externalId`);
              return res.status(400).json({
                success: false,
                error: 'Missing required field: externalId'
              });
            }

            if (!requiredFields.orderNumber) {
              console.error(`❌ Missing required field: orderNumber`);
              return res.status(400).json({
                success: false,
                error: 'Missing required field: orderNumber'
              });
            }

            const createData = {
              id: typeof orderDetails.id === 'string' ? parseInt(orderDetails.id) : orderDetails.id,
              externalId: orderDetails.orderNumber,
              orderNumber: orderDetails.orderNumber,
              ttn: orderDetails.ttn,
              quantity: orderDetails.quantity,
              status: newOrderStatus,
              statusText: newOrderStatusText,
              items: orderDetails.items,
              rawData: webhookData,
              customerName: orderDetails.customerName,
              customerPhone: orderDetails.customerPhone,
              deliveryAddress: orderDetails.deliveryAddress,
              totalPrice: orderDetails.totalPrice,
              orderDate: orderDetails.orderDate,
              shippingMethod: orderDetails.shippingMethod,
              paymentMethod: orderDetails.paymentMethod,
              cityName: orderDetails.cityName,
              provider: orderDetails.provider,
              pricinaZnizki: orderDetails.pricinaZnizki,
              sajt: orderDetails.sajt
            };

            console.log(`📋 Create data:`, {
              id: createData.id,
              externalId: createData.externalId,
              status: createData.status,
              statusText: createData.statusText,
              customerName: createData.customerName,
              totalPrice: createData.totalPrice,
              hasItems: !!createData.items
            });

            // Проверяем сериализацию данных перед созданием
            try {
              const testItems = createData.items ? JSON.stringify(createData.items) : null;

              console.log(`✅ Data serialization test passed: items=${testItems?.length || 0} chars`);
            } catch (serializeError) {
              console.error(`❌ Data serialization failed:`, serializeError);
              console.log(`   Items type: ${typeof createData.items}`);
              // Не создаем заказ если данные не сериализуются
              return res.status(500).json({
                success: false,
                error: 'Data serialization failed',
                details: serializeError.message
              });
            }

            try {
              const createdOrder = await orderDatabaseService.createOrder(createData);
              console.log(`✅ Order ${createData.externalId} created via webhook`);

              // Проверяем, что кеш был создан автоматически
              try {
                const cacheExists = await ordersCacheService.hasOrderCache(createData.externalId);
                if (cacheExists) {
                  console.log(`✅ Cache automatically created for new order ${createData.externalId}`);
                } else {
                  console.warn(`⚠️ Cache not found for new order ${createData.externalId}, attempting manual creation...`);
                  // Попытка создать кеш вручную
                  await orderDatabaseService.updateOrderCache(createData.externalId);
                  console.log(`✅ Cache manually created for new order ${createData.externalId}`);
                }
              } catch (cacheCheckError) {
                console.warn(`⚠️ Failed to check/create cache for new order ${createData.externalId}:`, cacheCheckError);
                // Не прерываем выполнение из-за ошибки кеширования
              }

            } catch (createError) {
              console.error(`❌ Failed to create order:`, createError);
              console.error(`   Create error details:`, {
                message: createError.message,
                code: createError.code,
                meta: createError.meta
              });
              return res.status(500).json({
                success: false,
                error: 'Failed to create order',
                details: createError.message
              });
            }
          }
        } else {
          console.warn(`⚠️ Order ${orderIdentifier} not found in SalesDrive`);
        }
      } catch (error) {
        console.error(`❌ Error processing webhook for order ${orderIdentifier}:`, error);
        console.error(`   Error details:`, {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        return res.status(500).json({
          success: false,
          error: 'Failed to process order update',
          details: error.message
        });
      }
    } else {
      console.log(`⚠️ Unsupported webhook event: ${req.body.info?.webhookEvent}`);
    }
    
    res.json({
      success: true,
      message: `Webhook processed: ${req.body.info?.webhookEvent} for order ${orderIdentifier}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * POST /api/webhooks/salesdrive/test
 * Тестовый endpoint для проверки webhook
 */
router.post('/salesdrive/test', (req, res) => {
  console.log('🧪 Test webhook received:', JSON.stringify(req.body, null, 2));
  res.json({
    success: true,
    message: 'Test webhook received',
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/webhooks/salesdrive/health
 * Проверка работоспособности webhook endpoint
 */
router.get('/salesdrive/health', (req, res) => {
  res.json({
    success: true,
    message: 'SalesDrive webhook endpoint is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
