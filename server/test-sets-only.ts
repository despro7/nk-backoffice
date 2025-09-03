// Тест для проверки только комплектов (parent = 1100300000001315)
import 'dotenv/config';
import { DilovodService } from './services/dilovod/DilovodService';

async function testSetsOnly() {
  const dilovodService = new DilovodService();
  
  try {
    console.log('=== ТЕСТ ТОЛЬКО КОМПЛЕКТОВ ===');
    console.log('Проверяем товары с parent = 1100300000001315');
    
    // Получаем SKU для тестирования
    console.log('\n1. Получаем SKU для тестирования...');
    const skus = await dilovodService.getTestSkus();
    console.log(`Получено ${skus.length} SKU:`, skus);
    
    // Тестируем получение товаров по SKU
    console.log('\n2. Тестируем получение товаров по SKU...');
    const result = await dilovodService.getGoodsInfoWithSetsOptimized(skus);
    
    console.log('\n3. Результат:');
    console.log(`Всего товаров: ${result.length}`);
    
    // Анализируем результат
    const productsWithSets = result.filter(p => p.set && p.set.length > 0);
    const regularProducts = result.filter(p => !p.set || p.set.length === 0);
    
    console.log(`Комплектов: ${productsWithSets.length}`);
    console.log(`Обычных товаров: ${regularProducts.length}`);
    
    // Группируем по parent ID
    const byParent: { [key: string]: any[] } = {};
    result.forEach(product => {
      const parent = (product as any).parent || 'unknown';
      if (!byParent[parent]) {
        byParent[parent] = [];
      }
      byParent[parent].push(product);
    });
    
    console.log('\n📊 Группировка по parent ID:');
    Object.keys(byParent).forEach(parent => {
      console.log(`  Parent ${parent}: ${byParent[parent].length} товаров`);
      byParent[parent].slice(0, 3).forEach((product, index) => {
        console.log(`    ${index + 1}. ${product.sku} - ${product.name}`);
      });
    });
    
    if (productsWithSets.length > 0) {
      console.log('\n🎯 Найденные комплекты:');
      productsWithSets.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.sku} - ${product.name} (${product.set.length} компонентов)`);
        console.log(`     Состав:`, product.set);
      });
    }
    
    if (regularProducts.length > 0) {
      console.log('\n📦 Обычные товары (первые 5):');
      regularProducts.slice(0, 5).forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.sku} - ${product.name}`);
      });
    }
    
  } catch (error) {
    console.error('Ошибка тестирования:', error);
  } finally {
    await dilovodService.disconnect();
  }
}

testSetsOnly();
