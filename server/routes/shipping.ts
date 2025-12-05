import express from 'express';
import { shippingService } from '../services/shippingService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/shipping/print-ttn
 * Друкує ТТН через API перевізника
 */
router.post('/print-ttn', authenticateToken, async (req, res) => {
  try {
    const { ttn, provider, senderId, format = 'pdf' } = req.body;

    if (!ttn || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Необхідно вказати ttn та provider'
      });
    }

    const result = await shippingService.printTTN({
      ttn,
      provider,
      senderId,
      format
    });

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        format: result.format,
        message: `Стікер ТТН ${ttn} успішно сгенеровано`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Не вдалося сгенерувати стікер'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Внутрішня помилка сервера'
    });
  }
});

/**
 * GET /api/shipping/ttn-status/:ttn/:provider
 * Отримати статус ТТН
 */
router.get('/ttn-status/:ttn/:provider', authenticateToken, async (req, res) => {
  try {
    const { ttn, provider } = req.params;

    if (!ttn || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Необхідно вказати ttn та provider'
      });
    }

    const status = await shippingService.getTTNStatus(ttn, provider as 'novaposhta' | 'ukrposhta');

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Не вдалося отримати статус ТТН'
    });
  }
});

/**
 * POST /api/shipping/ttn-zpl
 * Відправляє запит на отримання ZPL-коду для ТТН
 */
router.post('/ttn-zpl', authenticateToken, async (req, res) => {
  try {
    const { ttn, provider, senderId } = req.body;

    if (!ttn || !provider) {
      return res.status(400).json({ success: false, error: 'Необхідно вказати ttn та provider' });
    }

    const result = await shippingService.printTTN({ ttn, provider, senderId, format: 'zpl' });

    if (result.success) {
      res.json({ success: true, data: result.data, format: result.format });
    } else {
      res.status(400).json({ success: false, error: result.error || 'Не вдалося отримати ZPL-код' });
    }
  } catch (error) {
    console.error('Error getting ZPL for TTN:', error);
    res.status(500).json({ success: false, error: 'Внутрішня помилка сервера' });
  }
});

export default router;
