import { Router } from 'express';
import { authenticateToken, requireRole, requireMinRole, ROLE_SETS, ROLES } from '../middleware/auth.js';
import { salesDriveCacheService } from '../services/salesdrive/SalesDriveCacheService.js';
import type { SalesDriveChannel } from '../services/salesdrive/SalesDriveTypes.js';

const router = Router();

/**
 * GET /api/salesdrive/cache/status
 * Отримати статус кешу довідників SalesDrive
 */
router.get('/cache/status', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
  try {
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
router.post('/cache/refresh', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
  try {
    // Імпортуємо SalesDriveService
    const { salesDriveService } = await import('../services/salesDriveService.js');

    console.log('🔄 [SalesDrive Cache] Starting cache refresh...');

    // Канали — user-managed, без API-джерела; оновлюємо лише якщо DB порожня
    const existingChannels = await salesDriveCacheService.getRawFromDB<SalesDriveChannel[]>('channels');
    if (!existingChannels) {
      const channels = await salesDriveService.fetchChannels();
      await salesDriveCacheService.updateCache('channels', channels);
      console.log(`✅ [SalesDrive Cache] Seeded ${channels.length} channels from static list`);
    } else {
      console.log(`ℹ️ [SalesDrive Cache] Channels are user-managed, skipping refresh (${existingChannels.length} records in DB)`);
    }

    // Оновлюємо дані з SalesDrive API
    const [paymentMethods, shippingMethods, statuses] = await Promise.all([
      salesDriveService.fetchPaymentMethods(),
      salesDriveService.fetchShippingMethods(),
      salesDriveService.fetchStatuses()
    ]);

    await Promise.all([
      salesDriveCacheService.updateCache('paymentMethods', paymentMethods),
      salesDriveCacheService.updateCache('shippingMethods', shippingMethods),
      salesDriveCacheService.updateCache('statuses', statuses)
    ]);

    console.log(`✅ [SalesDrive Cache] Cache refreshed: ${paymentMethods.length} payment methods, ${shippingMethods.length} shipping methods, ${statuses.length} statuses`);

    res.json({
      success: true,
      message: 'Кеш SalesDrive успішно оновлено',
      data: {
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
router.post('/cache/clear', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
  try {
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
 * Отримати список каналів продажів SalesDrive.
 * Канали зберігаються в DB і управляються вручну (без API-джерела).
 * Якщо в DB нічого немає — сідимо зі статичного списку.
 */
router.get('/channels', authenticateToken, async (req, res) => {
  try {
    // Читаємо з DB незалежно від TTL (канали user-managed)
    let channels = await salesDriveCacheService.getRawFromDB<SalesDriveChannel[]>('channels');

    if (!channels) {
      // Перший запуск — сідимо зі статичного списку
      const { salesDriveService } = await import('../services/salesDriveService.js');
      channels = await salesDriveService.fetchChannels();
      await salesDriveCacheService.updateCache('channels', channels);
      console.log(`✅ [SalesDrive] Seeded ${channels.length} channels from static list`);
    }

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
 * PUT /api/salesdrive/channels
 * Зберегти оновлений список каналів продажів у DB.
 */
router.put('/channels', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
  try {
    const { channels } = req.body as { channels: unknown };

    if (!Array.isArray(channels)) {
      return res.status(400).json({ success: false, error: 'channels must be an array' });
    }

    for (const ch of channels as any[]) {
      if (typeof ch?.id !== 'string' || !String(ch.id).trim() || typeof ch?.name !== 'string' || !String(ch.name).trim()) {
        return res.status(400).json({
          success: false,
          error: 'Кожен канал повинен мати непорожні поля id (string) і name (string)'
        });
      }
    }

    const validated: SalesDriveChannel[] = (channels as any[]).map(ch => ({
      id: String(ch.id).trim(),
      name: String(ch.name).trim()
    }));

    await salesDriveCacheService.updateCache('channels', validated);
    console.log(`✅ [SalesDrive] Channels updated: ${validated.length} records`);

    res.json({
      success: true,
      message: `Канали продажів оновлено (${validated.length} записів)`,
      data: validated
    });
  } catch (error) {
    console.error('❌ [API] Error updating channels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update channels',
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
