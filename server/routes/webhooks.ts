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

/**
 * POST /api/webhooks/salesdrive/order-update
 * WebHook от SalesDrive для обновления заказов
 */
router.post('/salesdrive/order-update', async (req: Request, res: Response) => {
  try {
    console.log('🔔 WebHook received - Raw body:', JSON.stringify(req.body, null, 2));

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
    if (req.body.info?.webhookEvent === 'status_change') {
      // Синхронизируем конкретный заказ
      try {
        console.log(`🔍 Looking for existing order in database first...`);

        // Сначала проверим, есть ли заказ в нашей БД
        let existingOrder = await orderDatabaseService.getOrderByExternalId(orderIdentifier);
        let orderDetails = null;

        if (existingOrder) {
          console.log(`✅ Found existing order ${existingOrder.externalId} in database`);
          // Используем данные из БД как orderDetails
          orderDetails = {
            id: existingOrder.id,
            orderNumber: existingOrder.externalId,
            status: existingOrder.status,
            statusText: existingOrder.statusText,
            items: existingOrder.items ? JSON.parse(existingOrder.items) : [],
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
          console.log(`❌ Order ${orderIdentifier} not found in database, fetching from SalesDrive...`);
          // Если заказа нет в БД, получаем детали из SalesDrive
          orderDetails = await salesDriveService.getOrderDetails(orderIdentifier);
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
              // Если не найден по orderNumber, пробуем найти по id
              existingOrder = await orderDatabaseService.getOrderByExternalId(orderDetails.id);
            }
          }

          console.log(`   - existingOrder found: ${!!existingOrder}`);
          console.log(`   - orderDetails.orderNumber: ${orderDetails.orderNumber}`);
          console.log(`   - orderDetails.id: ${orderDetails.id}`);

          if (existingOrder) {
            console.log(`🔄 Updating existing order ${existingOrder.externalId}`);

            const updateData = {
              status: orderDetails.status,
              statusText: orderDetails.statusText,
              items: orderDetails.items,
              rawData: orderDetails,
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
              status: updateData.status,
              statusText: updateData.statusText,
              hasItems: !!updateData.items,
              hasRawData: !!updateData.rawData,
              customerName: updateData.customerName,
              totalPrice: updateData.totalPrice
            });

            // Обновляем существующий заказ
            await orderDatabaseService.updateOrder(existingOrder.externalId, updateData);
            
            console.log(`✅ Order ${orderDetails.orderNumber} updated via webhook`);
          } else {
            console.log(`🆕 Creating new order ${orderDetails.orderNumber}`);

            // Создаем новый заказ с данными из webhook
            const webhookData = req.body.data;
            await orderDatabaseService.createOrder({
              id: webhookData.id?.toString() || orderDetails.id?.toString(),
              externalId: webhookData.externalId || orderDetails.orderNumber,
              orderNumber: webhookData.externalId || orderDetails.orderNumber,
              ttn: webhookData.ord_novaposhta?.EN || orderDetails.ttn,
              quantity: webhookData.kilTPorcij || orderDetails.quantity,
              status: orderDetails.status,
              statusText: orderDetails.statusText,
              items: orderDetails.items,
              rawData: req.body, // Сохраняем полный webhook payload как объект
              customerName: webhookData.contacts?.[0]?.fName + ' ' + webhookData.contacts?.[0]?.lName,
              customerPhone: webhookData.contacts?.[0]?.phone?.[0],
              deliveryAddress: webhookData.shipping_address,
              totalPrice: webhookData.paymentAmount,
              orderDate: webhookData.orderTime,
              shippingMethod: webhookData.shipping_method?.toString(),
              paymentMethod: webhookData.payment_method?.toString(),
              cityName: webhookData.ord_novaposhta?.cityName,
              provider: 'SalesDrive',
              pricinaZnizki: webhookData.pricinaZnizki,
              sajt: webhookData.sajt
            });
            
            console.log(`✅ Order ${orderDetails.orderNumber} created via webhook`);
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
