// Тестовый скрипт для проверки testProductsBySku
import 'dotenv/config';
import { DilovodService } from './services/dilovod/DilovodService';

async function testProductsBySku() {
  const dilovodService = new DilovodService();
  
  try {
    console.log('=== Тестирование testProductsBySku ===');
    
    // Получаем SKU для тестирования
    console.log('\n1. Получаем SKU для тестирования...');
    const skus = await dilovodService.getTestSkus();
    console.log(`Получено ${skus.length} SKU:`, skus.slice(0, 5));
    
    // Тестируем получение товаров по SKU
    console.log('\n2. Тестируем получение товаров по SKU...');
    const result = await dilovodService.getGoodsInfoWithSetsOptimized(skus.slice(0, 15)); // Берем первые 15 для теста
    
    console.log('\n3. Результат:');
    console.log(`Всего товаров: ${result.length}`);
    
    // Анализируем результат
    const productsWithSets = result.filter(p => p.set && p.set.length > 0);
    const regularProducts = result.filter(p => !p.set || p.set.length === 0);
    
    console.log(`Комплектов: ${productsWithSets.length}`);
    console.log(`Обычных товаров: ${regularProducts.length}`);
    
    if (productsWithSets.length > 0) {
      console.log('\n🎯 Найденные комплекты:');
      productsWithSets.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.sku} - ${product.name} (${product.set.length} компонентов)`);
        console.log(`     Состав:`, product.set);
      });
    }
    
    if (regularProducts.length > 0) {
      console.log('\n📦 Обычные товары:');
      regularProducts.slice(0, 3).forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.sku} - ${product.name}`);
      });
    }
    
  } catch (error) {
    console.error('Ошибка тестирования:', error);
  } finally {
    await dilovodService.disconnect();
  }
}

testProductsBySku();
