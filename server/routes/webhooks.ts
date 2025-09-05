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
        // Получаем детали заказа из SalesDrive
        const orderDetails = await salesDriveService.getOrderDetails(orderIdentifier);
        
        if (orderDetails) {
          // Проверяем существование в БД
          const existingOrder = await orderDatabaseService.getOrderByExternalId(orderDetails.orderNumber);
          
          if (existingOrder) {
            // Обновляем существующий заказ
            await orderDatabaseService.updateOrder(orderDetails.orderNumber, {
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
              provider: orderDetails.provider
            });
            
            console.log(`✅ Order ${orderDetails.orderNumber} updated via webhook`);
          } else {
            // Создаем новый заказ
            await orderDatabaseService.createOrder({
              id: orderDetails.id,
              externalId: orderDetails.orderNumber,
              orderNumber: orderDetails.orderNumber,
              ttn: orderDetails.ttn,
              quantity: orderDetails.quantity,
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
              sajt: orderDetails.sajt
            });
            
            console.log(`✅ Order ${orderDetails.orderNumber} created via webhook`);
          }
        } else {
          console.warn(`⚠️ Order ${orderIdentifier} not found in SalesDrive`);
        }
      } catch (error) {
        console.error(`❌ Error processing webhook for order ${orderIdentifier}:`, error);
        return res.status(500).json({
          success: false,
          error: 'Failed to process order update'
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
