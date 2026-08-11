import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * Каталог сертифікатів QZ Tray.
 * Prod: /home/backoffice.nk-food.shop/certs
 * Dev:  <cwd>/certificates
 */
const QZ_CERTS_DIR =
  process.env.QZ_CERTS_DIR || path.join(process.cwd(), 'certificates');

const CERT_CANDIDATES = [
  'digital-certificate.pem',
  'digital-certificate.txt',
  'digital-certificate.crt',
] as const;

function resolvePrivateKeyPath(): string {
  if (process.env.QZ_PRIVATE_KEY_PATH) {
    return process.env.QZ_PRIVATE_KEY_PATH;
  }
  return path.join(QZ_CERTS_DIR, 'private-key.pem');
}

function resolveCertificatePath(): string {
  if (process.env.QZ_CERTIFICATE_PATH) {
    return process.env.QZ_CERTIFICATE_PATH;
  }

  for (const name of CERT_CANDIDATES) {
    const candidate = path.join(QZ_CERTS_DIR, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(QZ_CERTS_DIR, CERT_CANDIDATES[0]);
}

/**
 * Ендпоінт для підпису повідомлень для QZ Tray
 *
 * Це більш безпечний підхід - приватний ключ зберігається тільки на сервері
 * і ніколи не передається клієнту
 */
router.post('/sign', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({
        error: 'Message is required',
        message: 'Повідомлення для підпису не надано',
      });
      return;
    }

    const privateKeyPath = resolvePrivateKeyPath();

    if (!fs.existsSync(privateKeyPath)) {
      console.error('Private key not found at:', privateKeyPath);
      res.status(500).json({
        error: 'Private key not found',
        message: 'Приватний ключ не знайдено. Будь ласка, згенеруйте сертифікат.',
        hint: 'Перевірте QZ_CERTS_DIR / QZ_PRIVATE_KEY_PATH або запустіть: npm run qz:cert',
        path: privateKeyPath,
      });
      return;
    }

    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    // SHA1 — алгоритм підпису за замовчуванням у QZ Tray
    const sign = crypto.createSign('SHA1');
    sign.update(message);
    sign.end();

    const signature = sign.sign(privateKey, 'base64');

    res.json({
      signature,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error signing message for QZ Tray:', error);

    res.status(500).json({
      error: 'Failed to sign message',
      message: 'Не вдалося підписати повідомлення',
      details: error.message,
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
    const certPath = resolveCertificatePath();

    if (!fs.existsSync(certPath)) {
      res.status(404).json({
        error: 'Certificate not found',
        message: 'Сертифікат не знайдено. Будь ласка, згенеруйте сертифікат.',
        hint: 'Перевірте QZ_CERTS_DIR / QZ_CERTIFICATE_PATH або запустіть: npm run qz:cert',
        path: certPath,
      });
      return;
    }

    const certificate = fs.readFileSync(certPath, 'utf8');

    res.json({
      certificate,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error reading certificate:', error);

    res.status(500).json({
      error: 'Failed to read certificate',
      message: 'Не вдалося прочитати сертифікат',
      details: error.message,
    });
  }
});

/**
 * Ендпоінт для перевірки стану QZ Tray
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const certPath = resolveCertificatePath();
    const keyPath = resolvePrivateKeyPath();
    const certExists = fs.existsSync(certPath);
    const keyExists = fs.existsSync(keyPath);

    res.json({
      configured: certExists && keyExists,
      certificate: certExists,
      privateKey: keyExists,
      certsDir: QZ_CERTS_DIR,
      certificatePath: certPath,
      privateKeyPath: keyPath,
      message:
        certExists && keyExists
          ? 'QZ Tray налаштовано'
          : 'QZ Tray потребує налаштування сертифіката',
    });
  } catch (error: any) {
    console.error('Error checking QZ status:', error);

    res.status(500).json({
      error: 'Failed to check status',
      details: error.message,
    });
  }
});

export default router;
