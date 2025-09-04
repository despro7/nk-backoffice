import { Router, Request, Response } from 'express';
import { salesDriveService } from '../services/salesDriveService.js';
import { orderDatabaseService } from '../services/orderDatabaseService.js';

// Добавляем типизацию для webhook payload
interface SalesDriveWebhookPayload {
  orderId?: string;
  externalId?: string;
  status?: string;
  action: 'created' | 'updated' | 'deleted';
  timestamp?: string;
}

const router = Router();

/**
 * POST /api/webhooks/salesdrive/order-update
 * WebHook от SalesDrive для обновления заказов
 */
router.post('/salesdrive/order-update', async (req: Request<{}, {}, SalesDriveWebhookPayload>, res: Response) => {
  try {
    const { orderId, externalId, status, action, timestamp } = req.body;
    
    console.log(`🔔 WebHook received: ${action} for order ${externalId || orderId}`);
    
    if (!externalId && !orderId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing order identifier' 
      });
    }

    const orderIdentifier = externalId || orderId;

    if (action === 'created' || action === 'updated') {
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
    } else if (action === 'deleted') {
      // Обработка удаления заказа (опционально)
      console.log(`🗑️ Order ${orderIdentifier} deleted in SalesDrive`);
    }
    
    res.json({ 
      success: true, 
      message: `Webhook processed: ${action} for order ${orderIdentifier}`,
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
