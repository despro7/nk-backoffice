// Тест синхронизации одного товара
import 'dotenv/config';
import { DilovodService } from './services/dilovod/DilovodService.js';

async function testSingleProduct() {
  // Отладочная информация
  console.log('=== ОТЛАДОЧНАЯ ИНФОРМАЦИЯ ===');
  console.log('DILOVOD_API_URL:', process.env.DILOVOD_API_URL ? 'НАСТРОЕН' : 'НЕ НАСТРОЕН');
  console.log('DILOVOD_API_KEY:', process.env.DILOVOD_API_KEY ? 'НАСТРОЕН' : 'НЕ НАСТРОЕН');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'НАСТРОЕН' : 'НЕ НАСТРОЕН');
  
  const dilovodService = new DilovodService();
  
  try {
    console.log('\n=== ТЕСТ СИНХРОНИЗАЦИИ ОДНОГО ТОВАРА ===');
    console.log('Проверяем товар с SKU: 01001');
    
    // Получаем информацию о товаре
    console.log('\n1. Получаем информацию о товаре...');
    const result = await dilovodService.getGoodsInfoWithSetsOptimized(['01001']);
    
    if (result && result.length > 0) {
      const product = result[0];
      console.log('\n2. Информация о товаре:');
      console.log(`SKU: ${product.sku}`);
      console.log(`Название: ${product.name}`);
      console.log(`Категория: ${product.category.name} (ID: ${product.category.id})`);
      console.log(`Цена: ${product.costPerItem} ${product.currency}`);
      console.log(`Вес: ${product.weight || 'не определен'}`);
      console.log(`Комплект: ${product.set.length > 0 ? 'ДА' : 'НЕТ'}`);
      
      if (product.set.length > 0) {
        console.log('Состав комплекта:');
        product.set.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.id} - ${item.quantity}`);
        });
      }
      
      if (product.additionalPrices.length > 0) {
        console.log('Дополнительные цены:');
        product.additionalPrices.forEach((price, index) => {
          console.log(`  ${index + 1}. ${price.priceType}: ${price.priceValue}`);
        });
      }
      
      // Тестируем синхронизацию в базу данных
      console.log('\n3. Тестируем синхронизацию в базу данных...');
      console.log('Примечание: Для синхронизации используйте метод syncProductsWithDilovod()');
      console.log('Этот тест только показывает информацию о товаре');
      
      console.log('\n4. Информация о товаре:');
      console.log(`SKU: ${product.sku}`);
      console.log(`Название: ${product.name}`);
      console.log(`Категория: ${product.category.name}`);
      console.log(`Цена: ${product.costPerItem} ${product.currency}`);
      console.log(`Вес: ${product.weight || 'не определен'}`);
      console.log(`Комплект: ${product.set.length > 0 ? 'ДА' : 'НЕТ'}`);
      
    } else {
      console.log('❌ Товар не найден');
    }
    
  } catch (error) {
    console.error('Ошибка тестирования:', error);
  } finally {
    await dilovodService.disconnect();
  }
}

testSingleProduct();
