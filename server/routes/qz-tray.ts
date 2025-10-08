import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * Ендпоінт для підпису повідомлень для QZ Tray
 * 
 * Це більш безпечний підхід - приватний ключ зберігається тільки на сервері
 * і ніколи не передається клієнту
 */
router.post('/sign', async (req: Request, res: Response) => {
  console.log('🔐 QZ Tray /sign endpoint called');
  console.log('  Message length:', req.body?.message?.length || 0);
  
  try {
    const { message } = req.body;

    if (!message) {
      console.error('  ✗ No message provided');
      res.status(400).json({ 
        error: 'Message is required',
        message: 'Повідомлення для підпису не надано' 
      });
      return;
    }

    // Шлях до приватного ключа
    const privateKeyPath = path.join(process.cwd(), 'certificates', 'private-key.pem');

    // Перевірити наявність ключа
    if (!fs.existsSync(privateKeyPath)) {
      console.error('Private key not found at:', privateKeyPath);
      res.status(500).json({ 
        error: 'Private key not found',
        message: 'Приватний ключ не знайдено. Будь ласка, згенеруйте сертифікат.',
        hint: 'Запустіть: pwsh scripts/generate-qz-certificate.ps1'
      });
      return;
    }

    // Читаємо приватний ключ
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    // Створюємо підпис з SHA1 (QZ Tray за замовчуванням використовує SHA1)
    const sign = crypto.createSign('SHA1');
    sign.update(message);
    sign.end();

    // Підписуємо і конвертуємо в base64
    const signature = sign.sign(privateKey, 'base64');

    console.log('  ✓ Signature created:', signature.substring(0, 50) + '...');

    // Повертаємо підпис
    res.json({ 
      signature,
      timestamp: new Date().toISOString() 
    });

  } catch (error: any) {
    console.error('Error signing message for QZ Tray:', error);
    
    res.status(500).json({ 
      error: 'Failed to sign message',
      message: 'Не вдалося підписати повідомлення',
      details: error.message 
    });
  }
});

/**
 * Ендпоінт для отримання публічного сертифіката
 * 
 * Клієнт може запитувати сертифікат динамічно
 */
router.get('/certificate', async (req: Request, res: Response) => {
  try {
    const certPath = path.join(process.cwd(), 'certificates', 'digital-certificate.pem');

    if (!fs.existsSync(certPath)) {
      res.status(404).json({ 
        error: 'Certificate not found',
        message: 'Сертифікат не знайдено. Будь ласка, згенеруйте сертифікат.',
        hint: 'Запустіть: pwsh scripts/generate-qz-certificate.ps1'
      });
      return;
    }

    const certificate = fs.readFileSync(certPath, 'utf8');

    res.json({ 
      certificate,
      timestamp: new Date().toISOString() 
    });

  } catch (error: any) {
    console.error('Error reading certificate:', error);
    
    res.status(500).json({ 
      error: 'Failed to read certificate',
      message: 'Не вдалося прочитати сертифікат',
      details: error.message 
    });
  }
});

/**
 * Ендпоінт для перевірки стану QZ Tray
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const certExists = fs.existsSync(path.join(process.cwd(), 'certificates', 'digital-certificate.pem'));
    const keyExists = fs.existsSync(path.join(process.cwd(), 'certificates', 'private-key.pem'));

    res.json({
      configured: certExists && keyExists,
      certificate: certExists,
      privateKey: keyExists,
      message: certExists && keyExists 
        ? 'QZ Tray налаштовано' 
        : 'QZ Tray потребує налаштування сертифіката'
    });

  } catch (error: any) {
    console.error('Error checking QZ status:', error);
    
    res.status(500).json({ 
      error: 'Failed to check status',
      details: error.message 
    });
  }
});

export default router;

