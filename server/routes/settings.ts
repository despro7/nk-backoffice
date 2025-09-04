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

// Специальные роуты для настроек погрешности веса
router.get('/weight-tolerance/values', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const [typeSetting, percentageSetting, absoluteSetting] = await Promise.all([
      prisma.settingsBase.findUnique({
        where: { key: 'weight_tolerance_type' }
      }),
      prisma.settingsBase.findUnique({
        where: { key: 'weight_tolerance_percentage' }
      }),
      prisma.settingsBase.findUnique({
        where: { key: 'weight_tolerance_absolute' }
      })
    ]);

    res.json({
      type: typeSetting?.value || 'combined',
      percentage: percentageSetting ? parseFloat(percentageSetting.value) : 5,
      absolute: absoluteSetting ? parseFloat(absoluteSetting.value) : 20
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
    
    const { type, percentage, absolute } = req.body;

    if (!type || percentage === undefined || absolute === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Type, percentage and absolute values are required'
      });
    }

    // Используем upsert для создания или обновления настроек
    await Promise.all([
      prisma.settingsBase.upsert({
        where: { key: 'weight_tolerance_type' },
        update: { value: type },
        create: {
          key: 'weight_tolerance_type',
          value: type,
          description: 'Тип погрешности веса',
          category: 'weight_tolerance',
          isActive: true
        }
      }),
      prisma.settingsBase.upsert({
        where: { key: 'weight_tolerance_percentage' },
        update: { value: percentage.toString() },
        create: {
          key: 'weight_tolerance_percentage',
          value: percentage.toString(),
          description: 'Процентная погрешность веса',
          category: 'weight_tolerance',
          isActive: true
        }
      }),
      prisma.settingsBase.upsert({
        where: { key: 'weight_tolerance_absolute' },
        update: { value: absolute.toString() },
        create: {
          key: 'weight_tolerance_absolute',
          value: absolute.toString(),
          description: 'Абсолютная погрешность веса в граммах',
          category: 'weight_tolerance',
          isActive: true
        }
      })
    ]);

    res.json({
      type: type,
      percentage: parseFloat(percentage),
      absolute: parseFloat(absolute)
    });
  } catch (error) {
    console.error('Error updating weight tolerance settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update weight tolerance settings'
    });
  }
});

export default router;
