// Скрипт для восстановления тестовых настроек авторизации
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function restoreAuthSettings() {
  try {
    console.log('🔄 Восстанавливаем тестовые настройки авторизации...\n');
    
    // Восстанавливаем тестовые настройки
    const testSettings = [
      {
        key: 'access_token_expires_in',
        value: '5m', // Восстанавливаем короткий период для тестирования
        description: 'Время жизни access токена'
      },
      {
        key: 'middleware_refresh_threshold_seconds', 
        value: '250', // Восстанавливаем тестовое значение
        description: 'Порог обновления токена в middleware в секундах'
      },
      {
        key: 'client_auto_refresh_enabled', 
        value: 'false', // Убеждаемся что отключено для тестирования
        description: 'Включить автоматическое обновление в клиенте'
      }
    ];

    for (const setting of testSettings) {
      await prisma.authSettings.upsert({
        where: { key: setting.key },
        update: { 
          value: setting.value,
          description: setting.description,
          updatedAt: new Date()
        },
        create: {
          key: setting.key,
          value: setting.value,
          description: setting.description
        }
      });

      console.log(`✅ ${setting.key}: ${setting.value}`);
    }

    console.log('\n🧪 ТЕСТОВАЯ КОНФИГУРАЦИЯ ВОССТАНОВЛЕНА:');
    console.log('• Access token: 5 минут (для быстрого тестирования)');
    console.log('• Middleware обновляет: за 250 секунд до истечения');
    console.log('• Client автообновление: ОТКЛЮЧЕНО');

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreAuthSettings();
