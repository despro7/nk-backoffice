// Скрипт для проверки настроек авторизации
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAuthSettings() {
  try {
    console.log('🔍 Проверяем настройки авторизации...\n');
    
    // Получаем все настройки авторизации
    const authSettings = await prisma.authSettings.findMany({
      orderBy: { key: 'asc' }
    });
    
    console.log('📋 Текущие настройки авторизации:');
    console.log('=====================================');
    
    if (authSettings.length === 0) {
      console.log('⚠️ Настройки авторизации не найдены! Используются значения по умолчанию:');
      console.log('• access_token_expires_in: 1h');
      console.log('• refresh_token_expires_in: 30d');
      console.log('• middleware_refresh_threshold_seconds: 300');
      console.log('• client_refresh_threshold_minutes: 10');
      console.log('• middleware_auto_refresh_enabled: true');
      console.log('• client_auto_refresh_enabled: true');
    } else {
      authSettings.forEach(setting => {
        console.log(`• ${setting.key}: ${setting.value}${setting.description ? ' (' + setting.description + ')' : ''}`);
      });
    }

    console.log('\n🧮 Анализ конфликтов:');
    console.log('======================');
    
    // Парсим время жизни access токена
    const accessExpiresIn = authSettings.find(s => s.key === 'access_token_expires_in')?.value || '1h';
    const middlewareThreshold = parseInt(authSettings.find(s => s.key === 'middleware_refresh_threshold_seconds')?.value || '300');
    const clientThreshold = parseInt(authSettings.find(s => s.key === 'client_refresh_threshold_minutes')?.value || '10') * 60;
    const middlewareEnabled = (authSettings.find(s => s.key === 'middleware_auto_refresh_enabled')?.value || 'true') === 'true';
    const clientEnabled = (authSettings.find(s => s.key === 'client_auto_refresh_enabled')?.value || 'true') === 'true';
    
    // Конвертируем время жизни токена в секунды
    function parseTime(timeStr) {
      const unit = timeStr.slice(-1);
      const value = parseInt(timeStr.slice(0, -1));
      switch (unit) {
        case 's': return value;
        case 'm': return value * 60;
        case 'h': return value * 60 * 60;
        case 'd': return value * 24 * 60 * 60;
        default: return 3600;
      }
    }
    
    const tokenLifetime = parseTime(accessExpiresIn);
    
    console.log(`📊 Access token живет: ${tokenLifetime} секунд (${accessExpiresIn})`);
    console.log(`🔄 Middleware обновляет за: ${middlewareThreshold} секунд до истечения${middlewareEnabled ? ' (ВКЛЮЧЕНО)' : ' (ВЫКЛЮЧЕНО)'}`);
    console.log(`💻 Client обновляет за: ${clientThreshold} секунд до истечения${clientEnabled ? ' (ВКЛЮЧЕНО)' : ' (ВЫКЛЮЧЕНО)'}`);
    
    // Вычисляем когда срабатывают обновления
    const middlewareTriggerTime = tokenLifetime - middlewareThreshold;
    const clientTriggerTime = tokenLifetime - clientThreshold;
    
    console.log(`\n⏰ Timeline обновлений:`);
    console.log(`   0 сек ────────────── ${tokenLifetime} сек (истечение)`);
    if (clientEnabled) {
      console.log(`   ${clientTriggerTime} сек: Client планирует обновление`);
    }
    if (middlewareEnabled) {
      console.log(`   ${middlewareTriggerTime} сек: Middleware начинает обновлять`);
    }
    
    // Проверка на конфликты
    if (middlewareEnabled && clientEnabled) {
      if (Math.abs(middlewareTriggerTime - clientTriggerTime) < 60) {
        console.log('\n❌ КОНФЛИКТ! Middleware и Client обновляют токены почти одновременно!');
        console.log('💡 РЕШЕНИЕ: Либо отключите одно из автообновлений, либо настройте разные интервалы');
      } else {
        console.log('\n✅ Конфликтов не обнаружено - интервалы обновления не пересекаются');
      }
    }
    
    if (middlewareEnabled && clientEnabled && middlewareThreshold > clientThreshold) {
      console.log('\n⚠️ ПРЕДУПРЕЖДЕНИЕ: Middleware обновляет позже клиента - это может быть неоптимально');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAuthSettings();