import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';

const router = Router();

// Путь к файлу настроек
const SETTINGS_FILE = path.join(process.cwd(), 'logging-settings.json');

// Типы для настроек логирования (синхронизированы с клиентом)
interface ConsoleLoggingSettings {
  authContextLogs: boolean;
  apiCallLogs: boolean; 
  routingLogs: boolean;
  equipmentLogs: boolean;
  debugLogs: boolean;
  performanceLogs: boolean;
  // Новые категории логирования
  loggingSettingsLogs: boolean;
  orderAssemblyLogs: boolean;
  cookieLogs: boolean;
  warehouseMovementLogs: boolean;
}

interface ToastLoggingSettings {
  authSuccess: boolean;
  authErrors: boolean;
  tokenRefresh: boolean;
  tokenExpiry: boolean;
  apiErrors: boolean;
  equipmentStatus: boolean;
  systemNotifications: boolean;
}

interface LoggingSettings {
  console: ConsoleLoggingSettings;
  toast: ToastLoggingSettings;
}

// Настройки по умолчанию
const defaultSettings: LoggingSettings = {
  console: {
    authContextLogs: true,
    apiCallLogs: false,
    routingLogs: false,
    equipmentLogs: true,
    debugLogs: false,
    performanceLogs: false,
    // Новые категории по умолчанию
    loggingSettingsLogs: false,
    orderAssemblyLogs: false,
    cookieLogs: false,
    warehouseMovementLogs: false
  },
  toast: {
    authSuccess: true,
    authErrors: true,
    tokenRefresh: true,
    tokenExpiry: true,
    apiErrors: true,
    equipmentStatus: true,
    systemNotifications: true
  }
};

// Функции для работы с файлом настроек
function loadSettingsFromFile(): LoggingSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const settings = JSON.parse(data);
      console.log('📋 [LoggingRoute] Настройки загружены из файла');
      return { ...defaultSettings, ...settings };
    }
  } catch (error) {
    console.error('❌ [LoggingRoute] Ошибка загрузки настроек из файла:', error);
  }
  console.log('📋 [LoggingRoute] Используем настройки по умолчанию');
  return defaultSettings;
}

function saveSettingsToFile(settings: LoggingSettings): boolean {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log('💾 [LoggingRoute] Настройки сохранены в файл');
    return true;
  } catch (error) {
    console.error('❌ [LoggingRoute] Ошибка сохранения настроек в файл:', error);
    return false;
  }
}

// Загружаем настройки при старте
let loggingSettings: LoggingSettings = loadSettingsFromFile();

// GET /api/settings/logging - получить настройки логирования (без аутентификации)
router.get('/', (req: Request, res: Response) => {
  try {
    console.log('🔧 [LoggingRoute] Запрос настроек логирования (без аутентификации)');
    
    // Перезагружаем настройки из файла при каждом GET запросе
    loggingSettings = loadSettingsFromFile();
    
    res.json(loggingSettings);
  } catch (error) {
    console.error('❌ [LoggingRoute] Ошибка получения настроек:', error);
    res.status(500).json({ 
      error: 'Не вдалося отримати налаштування логування' 
    });
  }
});

// PUT /api/settings/logging - сохранить настройки логирования
router.put('/', authenticateToken, (req: Request, res: Response) => {
  try {
    console.log('🔧 [LoggingRoute] Сохранение настроек логирования от пользователя:', req.user?.email);

    // Валидация структуры данных
    const { console: consoleSettings, toast: toastSettings } = req.body;
    
    if (!consoleSettings || !toastSettings) {
      console.error('❌ [LoggingRoute] Некорректная структура данных');
      return res.status(400).json({ 
        error: 'Некоректна структура данних' 
      });
    }

    // Проверяем наличие всех необходимых полей console
    const requiredConsoleFields: (keyof ConsoleLoggingSettings)[] = [
      'authContextLogs', 'apiCallLogs', 'routingLogs', 'equipmentLogs', 'debugLogs', 'performanceLogs',
      // Новые категории логирования
      'loggingSettingsLogs', 'orderAssemblyLogs', 'cookieLogs', 'warehouseMovementLogs'
    ];

    const requiredToastFields: (keyof ToastLoggingSettings)[] = [
      'authSuccess', 'authErrors', 'tokenRefresh', 'tokenExpiry', 'apiErrors', 'equipmentStatus', 'systemNotifications'
    ];

    for (const field of requiredConsoleFields) {
      if (typeof consoleSettings[field] !== 'boolean') {
        console.error(`❌ [LoggingRoute] Отсутствует или некорректное поле console.${field}`);
        return res.status(400).json({ 
          error: `Відсутнє або некоректне поле console.${field}` 
        });
      }
    }

    for (const field of requiredToastFields) {
      if (typeof toastSettings[field] !== 'boolean') {
        console.error(`❌ [LoggingRoute] Отсутствует или некорректное поле toast.${field}`);
        return res.status(400).json({ 
          error: `Відсутнє або некоректне поле toast.${field}` 
        });
      }
    }

    // Сохраняем настройки в памяти
    loggingSettings = {
      console: { ...consoleSettings },
      toast: { ...toastSettings }
    };

    // Сохраняем в файл
    const fileSaved = saveSettingsToFile(loggingSettings);
    if (!fileSaved) {
      return res.status(500).json({
        success: false,
        error: 'Не удалось сохранить настройки в файл'
      });
    }

    console.log('✅ [LoggingRoute] Настройки логирования успешно сохранены');

    res.json({ 
      success: true, 
      message: 'Налаштування логування успішно збережено',
      settings: loggingSettings 
    });
    
  } catch (error) {
    console.error('❌ [LoggingRoute] Ошибка сохранения настроек:', error);
    res.status(500).json({ 
      error: 'Не вдалося зберегти налаштування логування' 
    });
  }
});

// POST /api/settings/logging/reset - сбросить к настройкам по умолчанию
router.post('/reset', authenticateToken, (req: Request, res: Response) => {
  try {
    console.log('🔧 [LoggingRoute] Сброс настроек логирования к умолчаниям от пользователя:', req.user?.email);

    // Возвращаем настройки по умолчанию
    loggingSettings = { ...defaultSettings };
    
    // Сохраняем в файл
    const fileSaved = saveSettingsToFile(loggingSettings);
    if (!fileSaved) {
      return res.status(500).json({
        success: false,
        error: 'Не удалось сохранить настройки по умолчанию в файл'
      });
    }

    console.log('✅ [LoggingRoute] Настройки успешно сброшены к умолчаниям');

    res.json({ 
      success: true, 
      message: 'Налаштування логування скинуто до типових',
      settings: loggingSettings 
    });
    
  } catch (error) {
    console.error('❌ [LoggingRoute] Ошибка сброса настроек:', error);
    res.status(500).json({ 
      error: 'Не вдалося скинути налаштування логування' 
    });
  }
});

export default router;
