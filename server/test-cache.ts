// Тестовый скрипт для проверки работы кеша SKU
import 'dotenv/config';
import { DilovodCacheManager } from './services/dilovod/DilovodCacheManager.ts';

async function testCache() {
  const cacheManager = new DilovodCacheManager();
  
  try {
    console.log('=== Тестирование кеша SKU ===');
    
    // Получаем статистику кеша
    console.log('\n1. Статистика кеша:');
    const stats = await cacheManager.getCacheStats();
    console.log(JSON.stringify(stats, null, 2));
    
    // Принудительно обновляем кеш
    console.log('\n2. Принудительное обновление кеша:');
    const refreshResult = await cacheManager.forceRefreshCache();
    console.log(JSON.stringify(refreshResult, null, 2));
    
    // Получаем SKU
    console.log('\n3. Получение SKU:');
    const skus = await cacheManager.getInStockSkusFromWordPress();
    console.log(`Получено SKU: ${skus.length}`);
    if (skus.length > 0) {
      console.log(`Первые 5 SKU: ${skus.slice(0, 5).join(', ')}`);
    }
    
    // Снова получаем статистику
    console.log('\n4. Обновленная статистика кеша:');
    const updatedStats = await cacheManager.getCacheStats();
    console.log(JSON.stringify(updatedStats, null, 2));
    
  } catch (error) {
    console.error('Ошибка тестирования:', error);
  } finally {
    await cacheManager.disconnect();
  }
}

testCache();
