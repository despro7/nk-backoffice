import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { shippingProviderService } from '../services/shippingProviderService.js';

const router = express.Router();

/**
 * GET /api/shipping-providers
 * Отримати всіх провайдерів доставки
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const providers = await shippingProviderService.getAllProviders();
    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    console.error('Error getting shipping providers:', error);
    res.status(500).json({
      success: false,
      error: 'Не вдалося отримати список провайдерів'
    });
  }
});

/**
 * GET /api/shipping-providers/active
 * Отримати активний провайдер
 */
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const activeProvider = await shippingProviderService.getActiveProvider();
    res.json({
      success: true,
      data: activeProvider
    });
  } catch (error) {
    console.error('Error getting active provider:', error);
    res.status(500).json({
      success: false,
      error: 'Не вдалося отримати активний провайдер'
    });
  }
});

/**
 * POST /api/shipping-providers
 * Створити нового провайдера
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, providerType, senderName, isActive, apiKey, bearerEcom, counterpartyToken, bearerStatus } = req.body;

    if (!name || !providerType || !senderName) {
      return res.status(400).json({
        success: false,
        error: 'Необхідно вказати name, providerType та senderName'
      });
    }

    if (!['novaposhta', 'ukrposhta'].includes(providerType)) {
      return res.status(400).json({
        success: false,
        error: 'providerType повинен бути "novaposhta" або "ukrposhta"'
      });
    }

    const provider = await shippingProviderService.createProvider({
      name,
      providerType,
      senderName,
      isActive: isActive || false,
      apiKey,
      bearerEcom,
      counterpartyToken,
      bearerStatus
    });

    res.status(201).json({
      success: true,
      data: provider,
      message: 'Провайдер успішно створено'
    });
  } catch (error) {
    console.error('Error creating shipping provider:', error);
    res.status(500).json({
      success: false,
      error: 'Не вдалося створити провайдера'
    });
  }
});

/**
 * PUT /api/shipping-providers/order
 * Оновити порядок провайдерів
 */
router.put('/order', authenticateToken, async (req, res) => {
  try {
    const { providers } = req.body;

    if (!Array.isArray(providers)) {
      return res.status(400).json({
        success: false,
        error: 'Необхідно передати масив провайдерів з id та order'
      });
    }

    await shippingProviderService.updateProviderOrder(providers);

    res.json({
      success: true,
      message: 'Порядок провайдерів успішно оновлено'
    });
  } catch (error) {
    console.error('Error updating provider order:', error);
    res.status(500).json({
      success: false,
      error: 'Не вдалося оновити порядок провайдерів'
    });
  }
});

/**
 * PUT /api/shipping-providers/:id
 * Оновити провайдера
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, providerType, senderName, isActive, apiKey, bearerEcom, counterpartyToken, bearerStatus } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Невалідний ID провайдера'
      });
    }

    if (providerType && !['novaposhta', 'ukrposhta'].includes(providerType)) {
      return res.status(400).json({
        success: false,
        error: 'providerType повинен бути "novaposhta" або "ukrposhta"'
      });
    }

    const provider = await shippingProviderService.updateProvider({
      id,
      name,
      providerType,
      senderName,
      isActive,
      apiKey,
      bearerEcom,
      counterpartyToken,
      bearerStatus
    });

    res.json({
      success: true,
      data: provider,
      message: 'Провайдер успішно оновлено'
    });
  } catch (error) {
    console.error('Error updating shipping provider:', error);
    res.status(500).json({
      success: false,
      error: 'Не вдалося оновити провайдера'
    });
  }
});

/**
 * DELETE /api/shipping-providers/:id
 * Видалити провайдера
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Невалідний ID провайдера'
      });
    }

    await shippingProviderService.deleteProvider(id);

    res.json({
      success: true,
      message: 'Провайдер успішно видалено'
    });
  } catch (error) {
    console.error('Error deleting shipping provider:', error);
    res.status(500).json({
      success: false,
      error: 'Не вдалося видалити провайдера'
    });
  }
});

/**
 * POST /api/shipping-providers/:id/activate
 * Активувати провайдера
 */
router.post('/:id/activate', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Невалідний ID провайдера'
      });
    }

    const provider = await shippingProviderService.setActiveProvider(id);

    res.json({
      success: true,
      data: provider,
      message: 'Провайдер успішно активовано'
    });
  } catch (error) {
    console.error('Error activating shipping provider:', error);
    res.status(500).json({
      success: false,
      error: 'Не вдалося активувати провайдера'
    });
  }
});

/**
 * POST /api/shipping-providers/:id/validate
 * Валідувати API ключі провайдера
 */
router.post('/:id/validate', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Невалідний ID провайдера'
      });
    }

    const provider = await shippingProviderService.getProviderById(id);
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Провайдер не знайдено'
      });
    }

    const validation = await shippingProviderService.validateProviderCredentials(provider);

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Error validating shipping provider:', error);
    res.status(500).json({
      success: false,
      error: 'Не вдалося валідувати провайдера'
    });
  }
});

export default router;
