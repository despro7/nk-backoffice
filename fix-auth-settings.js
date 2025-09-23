// Скрипт для исправления настроек авторизации
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixAuthSettings() {
  try {
    console.log('🔧 Исправляем настройки авторизации...\n');
    
    // Рекомендуемые настройки для устранения race condition
    const recommendations = [
      {
        key: 'access_token_expires_in',
        value: '1h', // Увеличиваем с 5m до 1h
        description: 'Время жизни access токена',
        reason: '5 минут слишком мало - вызывает частые обновления'
      },
      {
        key: 'middleware_refresh_threshold_seconds', 
        value: '300', // 5 минут до истечения
        description: 'Порог обновления токена в middleware в секундах',
        reason: 'При 1h токене, middleware обновляет за 5 минут до истечения'
      },
      {
        key: 'client_refresh_threshold_minutes',
        value: '10', // 10 минут до истечения  
        description: 'Порог обновления токена в клиенте в минутах',
        reason: 'Client отключен, но если включить - будет обновлять за 10 минут'
      },
      {
        key: 'middleware_auto_refresh_enabled',
        value: 'true',
        description: 'Включить автоматическое обновление в middleware',
        reason: 'Оставляем включенным - middleware обрабатывает обновления'
      },
      {
        key: 'client_auto_refresh_enabled', 
        value: 'false', // Убеждаемся что отключено
        description: 'Включить автоматическое обновление в клиенте',
        reason: 'ОТКЛЮЧАЕМ для избежания race condition с middleware'
      }
    ];

    console.log('📋 Применяем рекомендуемые настройки:\n');

    for (const rec of recommendations) {
      // Получаем текущее значение
      const current = await prisma.authSettings.findUnique({
        where: { key: rec.key }
      });

      console.log(`🔧 ${rec.key}:`);
      console.log(`   Текущее: ${current?.value || 'не установлено'}`);
      console.log(`   Новое: ${rec.value}`);
      console.log(`   Причина: ${rec.reason}`);

      // Обновляем настройку
      await prisma.authSettings.upsert({
        where: { key: rec.key },
        update: { 
          value: rec.value,
          description: rec.description,
          updatedAt: new Date()
        },
        create: {
          key: rec.key,
          value: rec.value,
          description: rec.description
        }
      });

      console.log(`   ✅ Обновлено\n`);
    }

    console.log('🎯 ИТОГОВАЯ КОНФИГУРАЦИЯ:');
    console.log('==========================');
    console.log('• Access token: 1 час (3600 секунд)');
    console.log('• Middleware обновляет: за 5 минут до истечения (на 55-й минуте)');
    console.log('• Client автообновление: ОТКЛЮЧЕНО (избегаем race condition)');
    console.log('• Refresh token: 30 дней');
    console.log('\n✅ Настройки успешно исправлены!');
    console.log('\n📝 СЛЕДУЮЩИЕ ШАГИ:');
    console.log('1. Перезапустите сервер');
    console.log('2. Пользователям нужно будет перезайти для получения новых токенов с правильным временем жизни');

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAuthSettings();
