import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * Перевіряє існування PDF чека на WordPress сайті
 * GET /api/wordpress-receipt/check/:externalId
 */
router.get('/check/:externalId', authenticateToken, async (req, res) => {
  try {
    const { externalId } = req.params;
    
    if (!externalId) {
      return res.status(400).json({ success: false, message: 'externalId обов\'язковий' });
    }

    const pdfUrl = `https://nk-food.shop/wp-content/plugins/checkbox-pro/receipts-pdf/receipts/${externalId}.pdf`;
    
    // Робимо HEAD запит для перевірки існування файлу
    const response = await fetch(pdfUrl, { method: 'HEAD' });
    
    if (response.ok) {
      return res.json({ 
        success: true, 
        exists: true,
        url: pdfUrl,
        message: 'PDF чек знайдено'
      });
    } else {
      return res.json({ 
        success: true, 
        exists: false,
        message: 'PDF чек не знайдено'
      });
    }
  } catch (error) {
    console.error('Помилка перевірки WordPress PDF:', error);
    return res.status(500).json({ 
      success: false, 
      exists: false,
      message: 'Помилка перевірки файлу'
    });
  }
});

export default router;
