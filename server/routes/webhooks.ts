import { Router, Request, Response } from 'express';
import { salesDriveService } from '../services/salesDriveService.js';
import { orderDatabaseService } from '../services/orderDatabaseService.js';

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

// Helper function to parse SalesDrive date format to ISO-8601
function parseSalesDriveDate(dateString: string | null | undefined): string | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  try {
    // SalesDrive format: "YYYY-MM-DD HH:mm:ss"
    // Convert to ISO-8601: "YYYY-MM-DDTHH:mm:ss.sssZ"
    const isoString = dateString.replace(' ', 'T') + '.000Z';
    const date = new Date(isoString);

    // Validate the date
    if (isNaN(date.getTime())) {
      console.warn(`⚠️ Invalid SalesDrive date format: ${dateString}`);
      return null;
    }

    return date.toISOString();
  } catch (error) {
    console.error(`❌ Failed to parse SalesDrive date: ${dateString}`, error);
    return null;
  }
}

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

        if (existingOrder) {
          console.log(`✅ Found existing order ${existingOrder.externalId} in database`);
          // Используем данные из БД как orderDetails
          // existingOrder.items уже распарсено в getOrderByExternalId
          orderDetails = {
            id: existingOrder.id,
            orderNumber: existingOrder.externalId,
            status: existingOrder.status,
            statusText: existingOrder.statusText,
            items: existingOrder.items, // Уже распарсено в getOrderByExternalId
            customerName: existingOrder.customerName,
            customerPhone: existingOrder.customerPhone,
            deliveryAddress: existingOrder.deliveryAddress,
            totalPrice: existingOrder.totalPrice,
            orderDate: existingOrder.orderDate,
            shippingMethod: existingOrder.shippingMethod,
            paymentMethod: existingOrder.paymentMethod,
            cityName: existingOrder.cityName,
            provider: existingOrder.provider,
            pricinaZnizki: existingOrder.pricinaZnizki,
            sajt: existingOrder.sajt,
            ttn: existingOrder.ttn,
            quantity: existingOrder.quantity
          };
        } else {
          console.log(`❌ Order ${orderIdentifier} not found in database, creating from webhook data...`);

          // Создаем заказ на основе данных из webhook, без обращения к SalesDrive API
          // Это более надежный подход, так как webhook содержит все необходимые данные
          const webhookData = req.body.data;
          orderDetails = {
            id: parseInt(webhookData.id) || 0, // Используем внутренний ID из webhook
            orderNumber: webhookData.externalId || orderIdentifier, // Используем externalId как orderNumber
            status: webhookData.statusId ? statusMapping[webhookData.statusId] || '1' : '1',
            statusText: 'Новий', // По умолчанию
            items: webhookData.products || [],
            customerName: webhookData.contacts?.[0]?.fName + ' ' + webhookData.contacts?.[0]?.lName || 'Невідомий клієнт',
            customerPhone: webhookData.contacts?.[0]?.phone?.[0] || '',
            deliveryAddress: webhookData.shipping_address || '',
            totalPrice: webhookData.paymentAmount || 0,
            orderDate: parseSalesDriveDate(webhookData.orderTime) || new Date().toISOString(),
            shippingMethod: webhookData.shipping_method?.toString() || '',
            paymentMethod: webhookData.payment_method?.toString() || '',
            cityName: webhookData.ord_novaposhta?.cityName || '',
            provider: 'SalesDrive',
            pricinaZnizki: webhookData.pricinaZnizki || '',
            sajt: webhookData.sajt ? String(webhookData.sajt) : '',
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

          // Проверяем существование в БД (уже проверили выше, но перепроверим для надежности)
          if (!existingOrder) {
            // Если не найден по orderIdentifier, пробуем найти по orderNumber из деталей
            existingOrder = await orderDatabaseService.getOrderByExternalId(orderDetails.orderNumber);

            if (!existingOrder && orderDetails.id) {
              // Если не найден по orderNumber, пробуем найти по id (преобразуем в строку)
              existingOrder = await orderDatabaseService.getOrderByExternalId(orderDetails.id.toString());
            }
          }

          console.log(`   - existingOrder found: ${!!existingOrder}`);
          console.log(`   - orderDetails.orderNumber: ${orderDetails.orderNumber}`);
          console.log(`   - orderDetails.id: ${orderDetails.id}`);


        if (existingOrder) {
          console.log(`🔄 Updating existing order ${existingOrder.externalId}`);

          // Создаем безопасный rawData объект
          const safeRawData = {
            webhookType: req.body.info?.webhookType,
            webhookEvent: req.body.info?.webhookEvent,
            account: req.body.info?.account,
              data: {
                id: req.body.data?.id,
                externalId: req.body.data?.externalId,
                statusId: req.body.data?.statusId,
                orderTime: req.body.data?.orderTime,
                orderDate: parseSalesDriveDate(req.body.data?.orderTime), // Add parsed ISO date
                paymentAmount: req.body.data?.paymentAmount,
                shipping_address: req.body.data?.shipping_address,
                contacts: req.body.data?.contacts,
                products: req.body.data?.products
              }
          };

            const webhookData = req.body.data;
            const newStatus = statusMapping[webhookData.statusId] || orderDetails.status;

            console.log(`🔄 Status mapping: webhook statusId=${webhookData.statusId} -> status='${newStatus}'`);

            const updateData = {
              status: newStatus, // Используем статус из webhook
              statusText: getStatusText(newStatus),
              items: orderDetails.items,
              rawData: safeRawData, // Используем безопасный объект вместо orderDetails
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
              sajt: orderDetails.sajt,
              // Обновляем данные из webhook payload если они есть
              ttn: orderDetails.ttn,
              quantity: orderDetails.quantity
            };

            console.log(`📊 Update data:`, {
              oldStatus: existingOrder.status,
              newStatus: updateData.status,
              statusText: updateData.statusText,
              itemsType: typeof updateData.items,
              rawDataType: typeof updateData.rawData,
              itemsIsArray: Array.isArray(updateData.items),
              hasItems: !!updateData.items,
              hasRawData: !!updateData.rawData,
              customerName: updateData.customerName,
              totalPrice: updateData.totalPrice
            });

            // Проверяем rawData перед передачей
            if (updateData.rawData) {
              try {
                const testSerialize = JSON.stringify(updateData.rawData);
                console.log(`✅ RawData serialization test passed, length: ${testSerialize.length}`);
              } catch (serializeError) {
                console.error(`❌ RawData serialization failed:`, serializeError);
                console.log(`   RawData type: ${typeof updateData.rawData}`);
                console.log(`   RawData keys:`, Object.keys(updateData.rawData || {}));
                // Не передаем rawData если она не сериализуется
                updateData.rawData = null;
              }
            }

            // Проверяем items перед передачей
            if (updateData.items) {
              try {
                const testSerialize = JSON.stringify(updateData.items);
                console.log(`✅ Items serialization test passed, length: ${testSerialize.length}`);
              } catch (serializeError) {
                console.error(`❌ Items serialization failed:`, serializeError);
                console.log(`   Items type: ${typeof updateData.items}`);
                console.log(`   Items isArray: ${Array.isArray(updateData.items)}`);
                // Не передаем items если они не сериализуются
                updateData.items = null;
              }
            }

            // Обновляем существующий заказ
            await orderDatabaseService.updateOrder(existingOrder.externalId, updateData);

            console.log(`✅ Order ${orderDetails.orderNumber} updated via webhook`);
            console.log(`   Status changed: ${existingOrder.status} -> ${newStatus}`);

            // Проверяем, действительно ли статус изменился
            if (existingOrder.status !== newStatus) {
              console.log(`🎉 Status successfully updated to: ${newStatus}`);
            } else {
              console.log(`ℹ️ Status remained the same: ${newStatus}`);
            }
          } else {
            console.log(`🆕 Creating new order ${orderDetails.orderNumber}`);

            // Создаем новый заказ с данными из webhook
            const webhookData = req.body.data;
            // Создаем безопасный rawData для нового заказа
            const safeRawDataForCreate = {
              webhookType: req.body.info?.webhookType,
              webhookEvent: req.body.info?.webhookEvent,
              account: req.body.info?.account,
              data: {
                id: webhookData.id,
                externalId: webhookData.externalId,
                statusId: webhookData.statusId,
                orderTime: webhookData.orderTime,
                orderDate: parseSalesDriveDate(webhookData.orderTime), // Add parsed ISO date
                paymentAmount: webhookData.paymentAmount,
                shipping_address: webhookData.shipping_address,
                contacts: webhookData.contacts,
                products: webhookData.products,
                ord_novaposhta: webhookData.ord_novaposhta
              }
            };

            // Маппинг статуса для нового заказа из webhook
            const newOrderStatus = statusMapping[webhookData.statusId] || '1'; // По умолчанию '1' (Новий)
            const newOrderStatusText = getStatusText(newOrderStatus);

            console.log(`🆕 Creating new order with status: ${newOrderStatus} (${newOrderStatusText})`);

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

            console.log(`✅ Required fields validation passed: id=${requiredFields.id}, externalId=${requiredFields.externalId}`);

            const createData = {
              id: typeof orderDetails.id === 'string' ? parseInt(orderDetails.id) : orderDetails.id,
              externalId: orderDetails.orderNumber,
              orderNumber: orderDetails.orderNumber,
              ttn: orderDetails.ttn,
              quantity: orderDetails.quantity,
              status: newOrderStatus,
              statusText: newOrderStatusText,
              items: orderDetails.items,
              rawData: safeRawDataForCreate, // Используем безопасный объект
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
              const testRawData = JSON.stringify(createData.rawData);

              console.log(`✅ Data serialization test passed: items=${testItems?.length || 0} chars, rawData=${testRawData.length} chars`);
            } catch (serializeError) {
              console.error(`❌ Data serialization failed:`, serializeError);
              console.log(`   Items type: ${typeof createData.items}`);
              console.log(`   RawData type: ${typeof createData.rawData}`);
              // Не создаем заказ если данные не сериализуются
              return res.status(500).json({
                success: false,
                error: 'Data serialization failed',
                details: serializeError.message
              });
            }

            try {
              await orderDatabaseService.createOrder(createData);
              console.log(`✅ Order ${createData.externalId} created via webhook`);
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
