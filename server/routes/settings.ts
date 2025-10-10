import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import EquipmentSettingsService from '../services/settingsService.js';
const router = express.Router();
const equipmentSettingsService = EquipmentSettingsService.getInstance();

// Получить настройки оборудования
router.get('/equipment', authenticateToken, async (req, res) => {
  try {
    const settings = await equipmentSettingsService.getEquipmentSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error getting equipment settings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get equipment settings' 
    });
  }
});

// Сохранить настройки оборудования
router.post('/equipment', authenticateToken, async (req, res) => {
  try {
    const settings = req.body;
    
    // Валидация настроек
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid settings data'
      });
    }

    await equipmentSettingsService.saveEquipmentSettings(settings);
    
    res.json({ 
      success: true, 
      message: 'Equipment settings saved successfully' 
    });
  } catch (error) {
    console.error('Error saving equipment settings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save equipment settings' 
    });
  }
});

// Обновить конкретную настройку оборудования
router.patch('/equipment/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Value is required'
      });
    }

    await equipmentSettingsService.updateEquipmentSetting(key, value);
    
    res.json({ 
      success: true, 
      message: `Setting ${key} updated successfully` 
    });
  } catch (error) {
    console.error('Error updating equipment setting:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update equipment setting' 
    });
  }
});

// Сбросить настройки к значениям по умолчанию
router.post('/equipment/reset', authenticateToken, async (req, res) => {
  try {
    const defaultSettings = await equipmentSettingsService.resetEquipmentSettings();
    
    res.json({ 
      success: true, 
      message: 'Equipment settings reset to defaults',
      data: defaultSettings
    });
  } catch (error) {
    console.error('Error resetting equipment settings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset equipment settings' 
    });
  }
});

// Получить историю изменений настроек
router.get('/equipment/history', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await equipmentSettingsService.getSettingsHistory(limit);
    
    res.json({ 
      success: true, 
      data: history 
    });
  } catch (error) {
    console.error('Error getting settings history:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get settings history' 
    });
  }
});

// Получить все настройки по категориям
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const settings = await prisma.settingsBase.findMany({
      where: { isActive: true },
      orderBy: [
        { category: 'asc' },
        { key: 'asc' }
      ]
    });

    // Return array format that SettingsManager expects
    const formattedSettings = settings.map(setting => ({
      id: setting.id,
      key: setting.key,
      value: setting.value,
      description: setting.description,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt
    }));

    res.json(formattedSettings);
  } catch (error) {
    console.error('Error getting all settings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get settings' 
    });
  }
});

// CRUD операции для настроек

// Создать новую настройку
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const { key, value, description, category } = req.body;
    
    if (!key || !value) {
      return res.status(400).json({
        success: false,
        error: 'Key and value are required'
      });
    }

    // Проверяем, что настройка с таким ключом не существует
    const existingSetting = await prisma.settingsBase.findUnique({
      where: { key }
    });

    if (existingSetting) {
      return res.status(400).json({
        success: false,
        error: 'Setting with this key already exists'
      });
    }

    const newSetting = await prisma.settingsBase.create({
      data: {
        key,
        value,
        description,
        category: category || 'general',
        isActive: true
      }
    });

    res.json({
      id: newSetting.id,
      key: newSetting.key,
      value: newSetting.value,
      description: newSetting.description,
      createdAt: newSetting.createdAt,
      updatedAt: newSetting.updatedAt
    });
  } catch (error) {
    console.error('Error creating setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create setting'
    });
  }
});

// === LOGGING SETTINGS ===
// Get logging settings from DB
router.get('/logging', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const setting = await prisma.settingsBase.findUnique({
      where: { key: 'logging_settings' }
    });
    if (!setting) {
      // Повертаємо дефолтні налаштування якщо їх немає в БД
      const defaults = {
        authContextLogs: true,
        apiCallLogs: false,
        routingLogs: false,
        equipmentLogs: true,
        debugLogs: false,
        performanceLogs: false,
        loggingSettingsLogs: false,
        orderAssemblyLogs: false,
        cookieLogs: false,
        warehouseMovementLogs: false,
        productSetsLogs: false
      };
      return res.json(defaults);
    }
    res.json(JSON.parse(setting.value));
  } catch (error) {
    console.error('Error getting logging settings:', error);
    res.status(500).json({ success: false, error: 'Failed to get logging settings' });
  }
});

// Save logging settings to DB
router.put('/logging', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const newSettings = req.body;
    
    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid logging settings data' });
    }
    
    // Валідація: видаляємо зайві поля (тільки дозволені поля)
    const allowedKeys = [
      'authContextLogs', 'apiCallLogs', 'routingLogs', 'equipmentLogs',
      'debugLogs', 'performanceLogs', 'loggingSettingsLogs', 'orderAssemblyLogs',
      'cookieLogs', 'warehouseMovementLogs', 'productSetsLogs'
    ];
    
    const cleanSettings = {};
    for (const key of allowedKeys) {
      if (key in newSettings) {
        cleanSettings[key] = newSettings[key];
      }
    }
    
    await prisma.settingsBase.upsert({
      where: { key: 'logging_settings' },
      update: { value: JSON.stringify(cleanSettings) },
      create: {
        key: 'logging_settings',
        value: JSON.stringify(cleanSettings),
        description: 'Logging settings',
        category: 'logging',
        isActive: true
      }
    });
    
    res.json({ success: true, message: 'Logging settings saved successfully', data: cleanSettings });
  } catch (error) {
    console.error('Error saving logging settings:', error);
    res.status(500).json({ success: false, error: 'Failed to save logging settings' });
  }
});

// === TOAST SETTINGS ===
// Get toast settings from DB
router.get('/toast', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const setting = await prisma.settingsBase.findUnique({
      where: { key: 'toast_settings' }
    });
    if (!setting) {
      return res.status(404).json({ success: false, error: 'Toast settings not found' });
    }
    res.json(JSON.parse(setting.value));
  } catch (error) {
    console.error('Error getting toast settings:', error);
    res.status(500).json({ success: false, error: 'Failed to get toast settings' });
  }
});

// Save toast settings to DB
router.put('/toast', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const newSettings = req.body;
    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid toast settings data' });
    }
    await prisma.settingsBase.upsert({
      where: { key: 'toast_settings' },
      update: { value: JSON.stringify(newSettings) },
      create: {
        key: 'toast_settings',
        value: JSON.stringify(newSettings),
        description: 'Toast settings',
        category: 'toast',
        isActive: true
      }
    });
    res.json({ success: true, message: 'Toast settings saved successfully', data: newSettings });
  } catch (error) {
    console.error('Error saving toast settings:', error);
    res.status(500).json({ success: false, error: 'Failed to save toast settings' });
  }
});

// === WEIGHT TOLERANCE SETTINGS ===
// Спеціальні роути для налаштувань похибки ваги
router.get('/weight-tolerance/values', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const [maxToleranceSetting, minToleranceSetting, maxPortionsSetting, minPortionsSetting, portionMultiplierSetting, toleranceReductionSetting] = await Promise.all([
      prisma.settingsBase.findUnique({
        where: { key: 'weight_tolerance_max' }
      }),
      prisma.settingsBase.findUnique({
        where: { key: 'weight_tolerance_min' }
      }),
      prisma.settingsBase.findUnique({
        where: { key: 'weight_tolerance_max_portions' }
      }),
      prisma.settingsBase.findUnique({
        where: { key: 'weight_tolerance_min_portions' }
      }),
      prisma.settingsBase.findUnique({
        where: { key: 'weight_tolerance_portion_multiplier' }
      }),
      prisma.settingsBase.findUnique({
        where: { key: 'weight_tolerance_reduction_percent' }
      })
    ]);

    res.json({
      maxTolerance: maxToleranceSetting ? parseFloat(maxToleranceSetting.value) : 30,
      minTolerance: minToleranceSetting ? parseFloat(minToleranceSetting.value) : 10,
      maxPortions: maxPortionsSetting ? parseInt(maxPortionsSetting.value) : 12,
      minPortions: minPortionsSetting ? parseInt(minPortionsSetting.value) : 1,
      portionMultiplier: portionMultiplierSetting ? parseFloat(portionMultiplierSetting.value) : 2,
      toleranceReductionPercent: toleranceReductionSetting ? parseFloat(toleranceReductionSetting.value) : 60
    });
  } catch (error) {
    console.error('Error getting weight tolerance settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get weight tolerance settings'
    });
  }
});

router.put('/weight-tolerance/values', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const { maxTolerance, minTolerance, maxPortions, minPortions, portionMultiplier, toleranceReductionPercent } = req.body;

    if (maxTolerance === undefined || minTolerance === undefined || maxPortions === undefined || minPortions === undefined) {
      return res.status(400).json({
        success: false,
        error: 'MaxTolerance, minTolerance, maxPortions and minPortions values are required'
      });
    }

    // Використовуємо upsert для створення або оновлення налаштувань
    await Promise.all([
      prisma.settingsBase.upsert({
        where: { key: 'weight_tolerance_max' },
        update: { value: maxTolerance?.toString() || '30' },
        create: {
          key: 'weight_tolerance_max',
          value: maxTolerance?.toString() || '30',
          description: 'Максимальна похибка ваги (г)',
          category: 'weight_tolerance',
          isActive: true
        }
      }),
      prisma.settingsBase.upsert({
        where: { key: 'weight_tolerance_min' },
        update: { value: minTolerance?.toString() || '10' },
        create: {
          key: 'weight_tolerance_min',
          value: minTolerance?.toString() || '10',
          description: 'Мінімальна похибка ваги (г)',
          category: 'weight_tolerance',
          isActive: true
        }
      }),
      prisma.settingsBase.upsert({
        where: { key: 'weight_tolerance_max_portions' },
        update: { value: maxPortions?.toString() || '12' },
        create: {
          key: 'weight_tolerance_max_portions',
          value: maxPortions?.toString() || '12',
          description: 'Максимальна кількість порцій для максимальної похибки',
          category: 'weight_tolerance',
          isActive: true
        }
      }),
      prisma.settingsBase.upsert({
        where: { key: 'weight_tolerance_min_portions' },
        update: { value: minPortions?.toString() || '1' },
        create: {
          key: 'weight_tolerance_min_portions',
          value: minPortions?.toString() || '1',
          description: 'Мінімальна кількість порцій для максимальної похибки',
          category: 'weight_tolerance',
          isActive: true
        }
      }),
      prisma.settingsBase.upsert({
        where: { key: 'weight_tolerance_portion_multiplier' },
        update: { value: portionMultiplier?.toString() || '2' },
        create: {
          key: 'weight_tolerance_portion_multiplier',
          value: portionMultiplier?.toString() || '2',
          description: 'Коефіцієнт множення порцій для екстра-зменшення похибки',
          category: 'weight_tolerance',
          isActive: true
        }
      }),
      prisma.settingsBase.upsert({
        where: { key: 'weight_tolerance_reduction_percent' },
        update: { value: toleranceReductionPercent?.toString() || '60' },
        create: {
          key: 'weight_tolerance_reduction_percent',
          value: toleranceReductionPercent?.toString() || '60',
          description: 'Процент зменшення похибки при великій кількості порцій',
          category: 'weight_tolerance',
          isActive: true
        }
      })
    ]);

    res.json({
      maxTolerance: parseFloat(maxTolerance || 30),
      minTolerance: parseFloat(minTolerance || 10),
      maxPortions: parseInt(maxPortions || 12),
      minPortions: parseInt(minPortions || 1),
      portionMultiplier: parseFloat(portionMultiplier || 2),
      toleranceReductionPercent: parseFloat(toleranceReductionPercent || 60)
    });
  } catch (error) {
    console.error('Error updating weight tolerance settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update weight tolerance settings'
    });
  }
});

// Обновить настройку
router.put('/:key', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Value is required'
      });
    }

    const updatedSetting = await prisma.settingsBase.update({
      where: { key },
      data: { value }
    });

    res.json({
      id: updatedSetting.id,
      key: updatedSetting.key,
      value: updatedSetting.value,
      description: updatedSetting.description,
      createdAt: updatedSetting.createdAt,
      updatedAt: updatedSetting.updatedAt
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Setting not found'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to update setting'
    });
  }
});

// Публичные настройки, доступные без авторизации
const PUBLIC_SETTINGS = ['server_check_interval', 'server_status_enabled'];

const isPublicSetting = (key: string): boolean => {
  return PUBLIC_SETTINGS.includes(key);
};

// Получить конкретную настройку по ключу (публичный для безопасных настроек)
router.get('/:key', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const { key } = req.params;

    // Если настройка не публичная, требуем авторизацию
    if (!isPublicSetting(key)) {
      // Для непубличных настроек проверяем авторизацию
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required for this setting'
        });
      }

      // Импортируем и проверяем токен
      const jwt = await import('jsonwebtoken');
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return res.status(500).json({
          success: false,
          error: 'Server configuration error'
        });
      }

      try {
        jwt.verify(token, jwtSecret);
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      }
    }

    const setting = await prisma.settingsBase.findUnique({
      where: { key, isActive: true }
    });

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'Setting not found'
      });
    }

    res.json({
      id: setting.id,
      key: setting.key,
      value: setting.value,
      description: setting.description,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt
    });
  } catch (error) {
    console.error('Error getting setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get setting'
    });
  }
});

// Удалить настройку
router.delete('/:key', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const { key } = req.params;

    await prisma.settingsBase.delete({
      where: { key }
    });

    res.json({
      success: true,
      message: 'Setting deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting setting:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Setting not found'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to delete setting'
    });
  }
});

export default router;