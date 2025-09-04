import express from 'express';
import { shippingService } from '../services/shippingService.js';

const router = express.Router();

/**
 * POST /api/shipping/print-ttn
 * Печатает ТТН через API перевозчика
 */
router.post('/print-ttn', async (req, res) => {
  try {
    const { ttn, provider, format = 'pdf' } = req.body;

    if (!ttn || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать ttn и provider'
      });
    }

    const result = await shippingService.printTTN({
      ttn,
      provider,
      format
    });

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        message: `Наклейка ТТН ${ttn} успешно сгенерирована`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Не удалось сгенерировать наклейку'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * GET /api/shipping/ttn-status/:ttn/:provider
 * Получить статус ТТН
 */
router.get('/ttn-status/:ttn/:provider', async (req, res) => {
  try {
    const { ttn, provider } = req.params;

    if (!ttn || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать ttn и provider'
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
      error: 'Не удалось получить статус ТТН'
    });
  }
});

export default router;
