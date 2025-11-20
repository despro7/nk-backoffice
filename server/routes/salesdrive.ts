import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { salesDriveCacheService } from '../services/salesdrive/SalesDriveCacheService.js';

const router = Router();

/**
 * GET /api/salesdrive/cache/status
 * Отримати статус кешу довідників SalesDrive
 */
router.get('/cache/status', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }
    const status = await salesDriveCacheService.getAllCacheStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('❌ [API] Error getting SalesDrive cache status:', error);
    res.status(500).json({ success: false, error: 'Failed to get cache status', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /api/salesdrive/cache/refresh
 * Примусово оновити кеш довідників SalesDrive
 */
router.post('/cache/refresh', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    // Імпортуємо SalesDriveService
    const { salesDriveService } = await import('../services/salesDriveService.js');

    console.log('🔄 [SalesDrive Cache] Starting cache refresh...');

    // Отримуємо свіжі дані з SalesDrive API
    const [channels, paymentMethods, shippingMethods, statuses] = await Promise.all([
      salesDriveService.fetchChannels(),
      salesDriveService.fetchPaymentMethods(),
      salesDriveService.fetchShippingMethods(),
      salesDriveService.fetchStatuses()
    ]);

    // Оновлюємо кеш
    await Promise.all([
      salesDriveCacheService.updateCache('channels', channels),
      salesDriveCacheService.updateCache('paymentMethods', paymentMethods),
      salesDriveCacheService.updateCache('shippingMethods', shippingMethods),
      salesDriveCacheService.updateCache('statuses', statuses)
    ]);

    console.log(`✅ [SalesDrive Cache] Cache refreshed: ${channels.length} channels, ${paymentMethods.length} payment methods, ${shippingMethods.length} shipping methods, ${statuses.length} statuses`);

    res.json({
      success: true,
      message: 'Кеш SalesDrive успішно оновлено',
      data: {
        channels: channels.length,
        paymentMethods: paymentMethods.length,
        shippingMethods: shippingMethods.length,
        statuses: statuses.length
      }
    });
  } catch (error) {
    console.error('❌ [API] Error refreshing SalesDrive cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/salesdrive/cache/clear
 * Очистити весь кеш довідників SalesDrive
 */
router.post('/cache/clear', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    await salesDriveCacheService.clearAllCache();

    res.json({
      success: true,
      message: 'Кеш SalesDrive повністю очищено'
    });
  } catch (error) {
    console.error('❌ [API] Error clearing SalesDrive cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/salesdrive/channels
 * Отримати список каналів продажів SalesDrive (з кешу або API)
 */
router.get('/channels', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { salesDriveService } = await import('../services/salesDriveService.js');
    const channels = await salesDriveService.fetchChannels();

    res.json({
      success: true,
      data: channels
    });
  } catch (error) {
    console.error('❌ [API] Error fetching channels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channels',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/salesdrive/payment-methods
 * Отримати список методів оплати SalesDrive (з кешу або API)
 */
router.get('/payment-methods', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { salesDriveService } = await import('../services/salesDriveService.js');
    const paymentMethods = await salesDriveService.fetchPaymentMethods();

    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('❌ [API] Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment methods',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/salesdrive/shipping-methods
 * Отримати список методів доставки SalesDrive (з кешу або API)
 */
router.get('/shipping-methods', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { salesDriveService } = await import('../services/salesDriveService.js');
    const shippingMethods = await salesDriveService.fetchShippingMethods();

    res.json({
      success: true,
      data: shippingMethods
    });
  } catch (error) {
    console.error('❌ [API] Error fetching shipping methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shipping methods',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/salesdrive/statuses
 * Отримати список статусів заявок SalesDrive (з кешу або API)
 */
router.get('/statuses', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { salesDriveService } = await import('../services/salesDriveService.js');
    const statuses = await salesDriveService.fetchStatuses();

    res.json({
      success: true,
      data: statuses
    });
  } catch (error) {
    console.error('❌ [API] Error fetching statuses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statuses',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as salesdriveRouter };
