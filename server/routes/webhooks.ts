import { Router, Request, Response } from 'express';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
import { ordersCacheService } from '../services/ordersCacheService.js';
import { mapSalesDriveStatus, getStatusText, isDeletedStatus } from '../services/salesdrive/statusMapper.js';
import { generateExternalId } from '../services/salesdrive/externalIdHelper.js';

const router = Router();

// Middleware for logging webhook requests
router.use('/salesdrive/order-update', (req, res, next) => {
  console.log('🔍 Webhook middleware - Request details:');
  console.log(`   Method: ${req.method}`);
  console.log(`   URL: ${req.url}`);
  console.log(`   Content-Type: ${req.headers['content-type']}`);
  console.log(`   User-Agent: ${req.headers['user-agent']}`);
  console.log(`   Origin: ${req.headers['origin']}`);
  console.log(`   Body exists: ${!!req.body}`);
  console.log(`   Body keys: ${req.body ? Object.keys(req.body).join(', ') : 'none'}`);

  // Continue processing
  next();
});


/**
 * POST /api/webhooks/salesdrive/order-update
 * WebHook from SalesDrive for updating orders
 */
router.post('/salesdrive/order-update', async (req: Request, res: Response) => {
  try {
    // console.log('🔔 WebHook received - Raw body:', JSON.stringify(req.body, null, 2));
    console.log(`🔍 Webhook event: ${req.body.info?.webhookEvent}`);

    const { data } = req.body;
    const orderId = data?.id?.toString();
    
    // Використовуємо централізовану функцію генерації externalId
    const externalId = generateExternalId(data);

    console.log(`🔔 WebHook received: status_change for order #${externalId} (ID: ${orderId})`);
    console.log(`   - data.id: ${data?.id}`);
    console.log(`   - data.externalId: ${externalId}`);
    console.log(`   - data.sajt: ${data?.sajt}`);

    if (!orderId) {
      console.log('❌ Missing order ID - returning 400');
      return res.status(400).json({
        success: false,
        error: 'Missing order ID'
      });
    }

    // For status_change events, we always update the order
    if ( req.body.info?.webhookEvent === 'status_change' || req.body.info?.webhookEvent === 'new_order' ) {
      // Синхронізуємо конкретне замовлення
      try {
        console.log(`🔍 Looking for existing order in database first...`);

        // Спочатку перевіримо, чи є замовлення в нашій БД
        const existingOrder = await orderDatabaseService.getOrderById(orderId);
        
        const webhookData = req.body.data;
        const webhookMeta = req.body.meta.fields;
        
        // Перевірка спеціального випадку для статусу "Видалений" (8)
        const incomingStatus = mapSalesDriveStatus(webhookData.statusId, '1');
        const isDeleted = isDeletedStatus(incomingStatus);
        
        if (isDeleted && existingOrder) {
          // Для видалених замовлень лише оновлюємо статус, без інших змін
          console.log(`🗑️ Order ${existingOrder.externalId} marked as deleted (status 8), updating status only`);
          
          const updateData = {
            status: '8',
            statusText: getStatusText('8'),
            rawData: webhookData
          };
          
          await orderDatabaseService.updateOrder(existingOrder.externalId, updateData);
          
          console.log(`✅ Order ${existingOrder.externalId} status updated to deleted (8)`);
          
          return res.json({
            success: true,
            message: `Order ID ${orderId} marked as deleted`,
            timestamp: new Date().toISOString()
          });
        }
        
        let orderDetails = null;
        console.log('================= \n webhookMeta:', webhookMeta);

        // Серіалізуємо items з webhookData.products у потрібний формат
        const items = Array.isArray(webhookData.products) ? webhookData.products.map(p => ({
            productName: p.name || '',
            quantity: p.amount || 0,
            price: p.price || 0,
            sku: p.sku || ''
          }))
        : [];

        // Додаємо інформацію про клієнта
        let customerName = '';
        let customerPhone = '';

        if (webhookData.contacts) {
          const contact = webhookData.contacts;
          customerName = `${contact[0]?.lName || ''} ${contact[0]?.fName || ''} ${contact[0]?.mName || ''}`.trim();
          customerPhone = Array.isArray(contact[0].phone) ? contact[0].phone[0] : contact[0].phone || '';
        }

        // Додаємо інформацію про доставку
        let shippingMethod = '';
        let paymentMethod = '';

        if (webhookMeta.shipping_method.options) {
          shippingMethod = webhookMeta.shipping_method.options[0]?.text?.toString() || '';
        }
        if (webhookMeta.payment_method.options) {
          paymentMethod = webhookMeta.payment_method.options[0]?.text?.toString() || '';
        }

        if (existingOrder) {
          // Для існуючого замовлення використовуємо дані з webhook, якщо вони є, інакше з БД
          orderDetails = {
            id: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            status: existingOrder.status,
            statusText: existingOrder.statusText,
            items: items || existingOrder.items,
            customerName: customerName || existingOrder.customerName,
            customerPhone: customerPhone || existingOrder.customerPhone,
            deliveryAddress: webhookData.shipping_address || existingOrder.deliveryAddress,
            totalPrice: webhookData.paymentAmount || existingOrder.totalPrice,
            orderDate: webhookData.orderTime ? new Date(webhookData.orderTime).toISOString() : existingOrder.orderDate,
            shippingMethod: shippingMethod || existingOrder.shippingMethod,
            paymentMethod: paymentMethod || existingOrder.paymentMethod,
            cityName: existingOrder.cityName,
            provider: existingOrder.provider,
            pricinaZnizki: webhookData.pricinaZnizki != null ? String(webhookData.pricinaZnizki) : existingOrder.pricinaZnizki,
            sajt: webhookData.sajt != null ? String(webhookData.sajt) : existingOrder.sajt,
            ttn: webhookData.ord_novaposhta?.EN || existingOrder.ttn,
            quantity: webhookData.kilTPorcij || existingOrder.quantity
          };
        } else {
          // Якщо нове замовлення – створюємо замовлення на основі даних з webhook, без звернення до SalesDrive API
          orderDetails = {
            id: parseInt(webhookData.id) || 0, // Використовуємо внутрішній ID з webhook
            orderNumber: externalId, // Використовуємо externalId з префіксом SD (якщо додано)
            status: mapSalesDriveStatus(webhookData.statusId, '1'),
            statusText: 'Новий', // За замовчуванням
            items: items,
            customerName: customerName || 'Невідомий клієнт',
            customerPhone: customerPhone || '',
            deliveryAddress: webhookData.shipping_address || '',
            totalPrice: webhookData.paymentAmount || 0,
            orderDate: webhookData.orderTime ? new Date(webhookData.orderTime).toISOString() : null,
            shippingMethod: shippingMethod || '',
            paymentMethod: paymentMethod || '',
            cityName: webhookData.ord_novaposhta?.cityTemplateName || webhookData.ord_ukrposhta?.cityName || '',
            provider: webhookData.ord_novaposhta ? 'novaposhta' : webhookData.ord_ukrposhta ? 'ukrposhta' : 'novaposhta',
            pricinaZnizki: webhookData.pricinaZnizki != null ? String(webhookData.pricinaZnizki) : '',
            sajt: webhookData.sajt != null ? String(webhookData.sajt) : '',
            ttn: webhookData.ord_novaposhta?.EN || '',
            quantity: webhookData.kilTPorcij || 1
          };
          console.log(`📋 Created order details from webhook data: id=${orderDetails.id}, orderNumber=${orderDetails.orderNumber}`);
        }

        if (orderDetails) {
          console.log(`📋 Order details received:`);
          console.log(`   - orderDetails.id: ${orderDetails.id}`);
          console.log(`   - orderDetails.orderNumber: ${orderDetails.orderNumber}`);


          if (existingOrder) {
            console.log(`🔄 Updating existing order ${existingOrder.externalId}`);

            const newStatus = mapSalesDriveStatus(webhookData.statusId, orderDetails.status);

            console.log(`🔄 Status mapping: webhook statusId=${webhookData.statusId} -> status='${newStatus}'`);

            // Перевіряємо, які поля дійсно змінилися
            const changes: { [key: string]: any } = {};

            // Статус завжди оновлюємо (головна зміна в webhook)
            if (newStatus !== existingOrder.status) {
              changes.status = newStatus;
              changes.statusText = getStatusText(newStatus);
            }

            // RawData завжди оновлюємо (для історії змін)
            changes.rawData = webhookData;

            // Порівнюємо решту полів з даними з БД
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

            // Перевіряємо товари окремо (масив)
            const itemsChanged = JSON.stringify(orderDetails.items) !== JSON.stringify(existingOrder.items);
            if (itemsChanged) {
              changes.items = orderDetails.items;
            }

            // Додаємо тільки змінені поля
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


            // Перевіряємо items перед передачею
            if (updateData.items) {
              try {
                const testSerialize = JSON.stringify(updateData.items);
                console.log(`✅ Items serialization test passed, length: ${testSerialize.length}`);

                // Додаткова перевірка: якщо items порожній масив, не передаємо його
                if (Array.isArray(updateData.items) && updateData.items.length === 0) {
                  console.log(`ℹ️ Items array is empty, not updating items in database`);
                  updateData.items = undefined; // Не передаємо порожній масив
                }
              } catch (serializeError) {
                console.error(`❌ Items serialization failed:`, serializeError);
                console.log(`   Items type: ${typeof updateData.items}`);
                console.log(`   Items isArray: ${Array.isArray(updateData.items)}`);
                // Не передаємо items якщо вони не серіалізуються
                updateData.items = null;
              }
            }

            // Перевіряємо, чи змінилися товари (тепер перевіряємо тільки якщо items в updateData)
            const webhookHasNewItems = !!updateData.items;

            console.log(`📦 Webhook items check: itemsChanged=${itemsChanged}, hasNewItems=${!!updateData.items}, willUpdateCache=${webhookHasNewItems}`);

            // Якщо нічого не змінилося, пропускаємо оновлення
            if (Object.keys(updateData).length === 0) {
              console.log(`ℹ️ No changes detected for order ${existingOrder.externalId}, skipping update`);
              return res.json({
                success: true,
                message: `No changes for order ${externalId}`,
                timestamp: new Date().toISOString()
              });
            }

            // Оновлюємо існуюче замовлення
            await orderDatabaseService.updateOrder(existingOrder.externalId, updateData);

            console.log(`✅ Order ${orderDetails.orderNumber} updated via webhook`);

            // Логуємо зміну статусу тільки якщо вона була
            if (updateData.status) {
              console.log(`   Status changed: ${existingOrder.status} -> ${updateData.status}`);
              console.log(`🎉 Status successfully updated to: ${updateData.status}`);
            }

            // Оновлюємо кеш тільки якщо в webhook прийшли нові товари
            if (webhookHasNewItems) {
              try {
                await orderDatabaseService.updateOrderCache(existingOrder.externalId);
                console.log(`✅ Cache updated for order ${existingOrder.externalId} (items changed)`);
              } catch (cacheError) {
                console.warn(`⚠️ Не вдалося оновити кеш для замовлення ${existingOrder.externalId}:`, cacheError);
                // Не припиняємо виконання через помилку кешування
              }
            } else {
              console.log(`ℹ️ Cache not updated for order ${existingOrder.externalId} (no items change)`);
            }
          } else {
            // Створюємо нове замовлення з даними з webhook
            console.log(`🆕 Creating new order ${orderDetails.orderNumber}`);

            // Маппінг статусу для нового замовлення з webhook
            const newOrderStatus = mapSalesDriveStatus(webhookData.statusId, '1'); // За замовчуванням '1' (Новий)
            const newOrderStatusText = getStatusText(newOrderStatus);

            // Валідація обов'язкових полів перед створенням
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

            // Перевіряємо серіалізацію даних перед створенням
            try {
              const testItems = createData.items ? JSON.stringify(createData.items) : null;

              console.log(`✅ Data serialization test passed: items=${testItems?.length || 0} chars`);
            } catch (serializeError) {
              console.error(`❌ Data serialization failed:`, serializeError);
              console.log(`   Items type: ${typeof createData.items}`);
              // Не створюємо замовлення якщо дані не серіалізуються
              return res.status(500).json({
                success: false,
                error: 'Data serialization failed',
                details: serializeError.message
              });
            }

            try {
              const createdOrder = await orderDatabaseService.createOrder(createData);
              console.log(`✅ Order ${createData.externalId} created via webhook`);

              // Перевіряємо, що кеш був створений автоматично
              try {
                const cacheExists = await ordersCacheService.hasOrderCache(createData.externalId);
                if (cacheExists) {
                  console.log(`✅ Cache automatically created for new order ${createData.externalId}`);
                } else {
                  console.warn(`⚠️ Cache not found for new order ${createData.externalId}, attempting manual creation...`);
                  // Спроба створити кеш вручну
                  await orderDatabaseService.updateOrderCache(createData.externalId);
                  console.log(`✅ Cache manually created for new order ${createData.externalId}`);
                }
              } catch (cacheCheckError) {
                console.warn(`⚠️ Не вдалося перевірити/створити кеш для нового замовлення ${createData.externalId}:`, cacheCheckError);
                // Не припиняємо виконання через помилку кешування
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
          console.warn(`⚠️ Order ${externalId} not found in SalesDrive`);
        }
      } catch (error) {
        console.error(`❌ Error processing webhook for order ${externalId}:`, error);
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
      message: `Webhook processed: ${req.body.info?.webhookEvent} for order ${externalId}`,
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
 * Тестовий endpoint для перевірки webhook
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
 * Перевірка працездатності webhook endpoint
 */
router.get('/salesdrive/health', (req, res) => {
  res.json({
    success: true,
    message: 'SalesDrive webhook endpoint is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
