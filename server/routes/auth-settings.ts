import { Router } from 'express';
import { AuthSettingsService } from '../services/authSettingsService.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Получить настройки авторизации (для клиента)
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await AuthSettingsService.getAuthSettings();
    res.json(settings);
  } catch (error) {
    console.error('❌ [AuthSettings API] Ошибка получения настроек:', error);
    res.status(500).json({ error: 'Ошибка получения настроек' });
  }
});

// Получить настройки авторизации (только для админов)
router.get('/settings/admin', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const settings = await AuthSettingsService.getAuthSettings();
    res.json(settings);
  } catch (error) {
    console.error('❌ [AuthSettings API] Ошибка получения настроек:', error);
    res.status(500).json({ error: 'Ошибка получения настроек' });
  }
});

// Обновить настройки авторизации
router.put('/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const {
      accessTokenExpiresIn,
      refreshTokenExpiresIn,
      userActivityThresholdDays,
      middlewareRefreshThresholdSeconds,
      clientRefreshThresholdMinutes,
      tokenRefreshEnabled,
      middlewareAutoRefreshEnabled,
      clientAutoRefreshEnabled
    } = req.body;

    // Валидация
    if (!accessTokenExpiresIn || !refreshTokenExpiresIn) {
      return res.status(400).json({ error: 'Обязательные поля не заполнены' });
    }

    // Обновляем настройки
    await Promise.all([
      AuthSettingsService.setSetting('access_token_expires_in', accessTokenExpiresIn, 'Время жизни access токена'),
      AuthSettingsService.setSetting('refresh_token_expires_in', refreshTokenExpiresIn, 'Время жизни refresh токена'),
      AuthSettingsService.setSetting('user_activity_threshold_days', userActivityThresholdDays.toString(), 'Порог неактивности пользователя в днях'),
      AuthSettingsService.setSetting('middleware_refresh_threshold_seconds', middlewareRefreshThresholdSeconds.toString(), 'Порог обновления токена в middleware в секундах'),
      AuthSettingsService.setSetting('client_refresh_threshold_minutes', clientRefreshThresholdMinutes.toString(), 'Порог обновления токена в клиенте в минутах'),
      AuthSettingsService.setSetting('token_refresh_enabled', tokenRefreshEnabled.toString(), 'Включить автоматическое обновление токенов'),
      AuthSettingsService.setSetting('middleware_auto_refresh_enabled', middlewareAutoRefreshEnabled.toString(), 'Включить автоматическое обновление в middleware'),
      AuthSettingsService.setSetting('client_auto_refresh_enabled', clientAutoRefreshEnabled.toString(), 'Включить автоматическое обновление в клиенте')
    ]);

    console.log('✅ [AuthSettings API] Настройки авторизации обновлены');
    res.json({ message: 'Настройки успешно обновлены' });
  } catch (error) {
    console.error('❌ [AuthSettings API] Ошибка обновления настроек:', error);
    res.status(500).json({ error: 'Ошибка обновления настроек' });
  }
});

// Сбросить настройки к значениям по умолчанию
router.post('/settings/reset', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const defaultSettings = [
      { key: 'access_token_expires_in', value: '1h', description: 'Время жизни access токена' },
      { key: 'refresh_token_expires_in', value: '30d', description: 'Время жизни refresh токена' },
      { key: 'user_activity_threshold_days', value: '30', description: 'Порог неактивности пользователя в днях' },
      { key: 'middleware_refresh_threshold_seconds', value: '300', description: 'Порог обновления токена в middleware в секундах' },
      { key: 'client_refresh_threshold_minutes', value: '10', description: 'Порог обновления токена в клиенте в минутах' },
      { key: 'token_refresh_enabled', value: 'true', description: 'Включить автоматическое обновление токенов' },
      { key: 'middleware_auto_refresh_enabled', value: 'true', description: 'Включить автоматическое обновление в middleware' },
      { key: 'client_auto_refresh_enabled', value: 'true', description: 'Включить автоматическое обновление в клиенте' }
    ];

    // Сбрасываем все настройки
    await Promise.all(
      defaultSettings.map(setting => 
        AuthSettingsService.setSetting(setting.key, setting.value, setting.description)
      )
    );

    console.log('✅ [AuthSettings API] Настройки сброшены к значениям по умолчанию');
    res.json({ message: 'Настройки сброшены к значениям по умолчанию' });
  } catch (error) {
    console.error('❌ [AuthSettings API] Ошибка сброса настроек:', error);
    res.status(500).json({ error: 'Ошибка сброса настроек' });
  }
});

// Очистить кеш настроек
router.post('/settings/clear-cache', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    AuthSettingsService.clearCache();
    console.log('✅ [AuthSettings API] Кеш настроек очищен');
    res.json({ message: 'Кеш настроек очищен' });
  } catch (error) {
    console.error('❌ [AuthSettings API] Ошибка очистки кеша:', error);
    res.status(500).json({ error: 'Ошибка очистки кеша' });
  }
});

// Получить все настройки (для админки)
router.get('/settings/all', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const settings = await AuthSettingsService.getAllSettings();
    res.json(settings);
  } catch (error) {
    console.error('❌ [AuthSettings API] Ошибка получения всех настроек:', error);
    res.status(500).json({ error: 'Ошибка получения всех настроек' });
  }
});

export default router;
