import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Вспомогательные функции для работы с остатками
const WAREHOUSE_IDS = {
  MAIN: '1',      // Основной склад (Склад ГП)
  KYIV: '2',      // Киевский склад
  SMALL: '3'      // Малый склад
} as const;

/**
 * Обновляет остатки товара на складах
 */
async function updateProductStock(sku: string, sourceWarehouse: string, destinationWarehouse: string, quantity: number) {
  console.log(`📦 [Stock Update] Обновление остатка товара ${sku}: ${sourceWarehouse} -> ${destinationWarehouse}, кол-во: ${quantity}`);

  const product = await prisma.product.findUnique({
    where: { sku }
  });

  if (!product) {
    throw new Error(`Товар с SKU ${sku} не найден`);
  }

  // Парсим текущие остатки
  const currentStock = product.stockBalanceByStock
    ? JSON.parse(product.stockBalanceByStock)
    : {};

  console.log(`📦 [Stock Update] Текущие остатки товара ${sku}:`, currentStock);
  console.log(`📦 [Stock Update] Ищем склады: source=${sourceWarehouse}, dest=${destinationWarehouse}`);

  const sourceStock = currentStock[sourceWarehouse] || 0;
  const destStock = currentStock[destinationWarehouse] || 0;

  console.log(`📦 [Stock Update] Найденные остатки: source=${sourceStock}, dest=${destStock}`);

  // Проверяем достаточность остатков
  if (sourceStock < quantity) {
    throw new Error(`Недостаточно остатков товара ${sku} на складе ${sourceWarehouse}. Доступно: ${sourceStock}, требуется: ${quantity}`);
  }

  // Обновляем остатки
  const newStock = {
    ...currentStock,
    [sourceWarehouse]: Math.max(0, sourceStock - quantity),
    [destinationWarehouse]: destStock + quantity
  };

  // Сохраняем обновленные остатки
  await prisma.product.update({
    where: { sku },
    data: {
      stockBalanceByStock: JSON.stringify(newStock),
      updatedAt: new Date()
    }
  });

  console.log(`✅ [Stock Update] Остатки обновлены: ${sourceWarehouse}: ${sourceStock} -> ${newStock[sourceWarehouse]}, ${destinationWarehouse}: ${destStock} -> ${newStock[destinationWarehouse]}`);

  return {
    previousStock: currentStock,
    newStock,
    sourceBalance: sourceStock,
    destBalance: destStock
  };
}

/**
 * Создает записи в истории движения остатков
 */
async function createStockMovementHistory(
  sku: string,
  sourceWarehouse: string,
  destinationWarehouse: string,
  quantity: number,
  boxQuantity: number,
  portionQuantity: number,
  batchNumber: string,
  movementId: number,
  userId: number,
  stockUpdateResult: any
) {
  console.log(`📊 [Movement History] Создание записей истории для ${sku}`);

  // Списываем с исходного склада
  await prisma.stockMovementHistory.create({
    data: {
      productSku: sku,
      warehouse: sourceWarehouse,
      movementType: 'transfer_out',
      quantity: boxQuantity,
      quantityType: 'box',
      batchNumber: batchNumber || null,
      referenceId: movementId.toString(),
      referenceType: 'warehouse_movement',
      previousBalance: stockUpdateResult.sourceBalance,
      newBalance: stockUpdateResult.newStock[sourceWarehouse],
      notes: `Перемещение в ${destinationWarehouse}`,
      createdBy: userId
    }
  });

  // Приходуем на целевой склад
  await prisma.stockMovementHistory.create({
    data: {
      productSku: sku,
      warehouse: destinationWarehouse,
      movementType: 'transfer_in',
      quantity: boxQuantity,
      quantityType: 'box',
      batchNumber: batchNumber || null,
      referenceId: movementId.toString(),
      referenceType: 'warehouse_movement',
      previousBalance: stockUpdateResult.destBalance,
      newBalance: stockUpdateResult.newStock[destinationWarehouse],
      notes: `Перемещение из ${sourceWarehouse}`,
      createdBy: userId
    }
  });

  console.log(`✅ [Movement History] Записи истории созданы для ${sku}`);
}

async function testWarehouseAPI() {
  console.log('🧪 Тестирование Warehouse API...\n');

  try {
    // Очищаем тестовые данные перед началом
    console.log('🧹 Очистка тестовых данных...');
    await prisma.stockMovementHistory.deleteMany({
      where: {
        productSku: { startsWith: 'TEST-SKU-' }
      }
    });
    await prisma.warehouseMovement.deleteMany({
      where: {
        internalDocNumber: { startsWith: 'WM-TEST-' }
      }
    });
    console.log('✅ Тестовые данные очищены');

    // 1. Создание документа перемещения
    console.log('\n1. Создание документа перемещения...');
    const timestamp = Date.now();
    const movement = await prisma.warehouseMovement.create({
      data: {
        internalDocNumber: `WM-TEST-${timestamp}`,
        items: JSON.stringify([
          {
            sku: 'TEST-SKU-001',
            boxQuantity: 5.0,
            portionQuantity: 120,
            batchNumber: 'BATCH-001'
          },
          {
            sku: 'TEST-SKU-002',
            boxQuantity: 3.0,
            portionQuantity: 72,
            batchNumber: 'BATCH-002'
          }
        ]),
        sourceWarehouse: 'Основной склад',
        destinationWarehouse: 'Малый склад',
        notes: 'Тестовое перемещение',
        createdBy: 1
      }
    });
    console.log('✅ Документ создан:', movement.id);

    // 2. Создание записей в истории движения остатков
    console.log('\n2. Создание записей в истории движения остатков...');
    
    // Списываем с исходного склада
    await prisma.stockMovementHistory.create({
      data: {
        productSku: 'TEST-SKU-001',
        warehouse: 'Основной склад',
        movementType: 'transfer_out',
        quantity: 5.0,
        quantityType: 'box',
        batchNumber: 'BATCH-001',
        referenceId: movement.id.toString(),
        referenceType: 'warehouse_movement',
        previousBalance: 100,
        newBalance: 95,
        notes: 'Перемещение в Малый склад',
        createdBy: 1
      }
    });

    // Приходуем на целевой склад
    await prisma.stockMovementHistory.create({
      data: {
        productSku: 'TEST-SKU-001',
        warehouse: 'Малый склад',
        movementType: 'transfer_in',
        quantity: 5.0,
        quantityType: 'box',
        batchNumber: 'BATCH-001',
        referenceId: movement.id.toString(),
        referenceType: 'warehouse_movement',
        previousBalance: 20,
        newBalance: 25,
        notes: 'Перемещение из Основного склада',
        createdBy: 1
      }
    });

    console.log('✅ Записи в истории созданы');

    // 3. Получение текущих остатков
    console.log('\n3. Получение текущих остатков...');
    const currentStock = await prisma.stockMovementHistory.groupBy({
      by: ['productSku', 'warehouse'],
      _max: {
        movementDate: true
      }
    });

    console.log('📊 Группировка по SKU и складу:', currentStock.length, 'записей');

    // 4. Получение последних записей для каждого SKU и склада
    console.log('\n4. Получение последних записей...');
    const stockData = await Promise.all(
      currentStock.map(async (item) => {
        const lastRecord = await prisma.stockMovementHistory.findFirst({
          where: {
            productSku: item.productSku,
            warehouse: item.warehouse,
            movementDate: item._max.movementDate
          }
        });
        return lastRecord;
      })
    );

    console.log('📋 Текущие остатки:');
    stockData.filter(Boolean).forEach(record => {
      console.log(`   ${record?.productSku} на ${record?.warehouse}: ${record?.newBalance} ${record?.quantityType}`);
    });

    // 5. Получение истории движения для конкретного SKU
    console.log('\n5. Получение истории движения для TEST-SKU-001...');
    const history = await prisma.stockMovementHistory.findMany({
      where: {
        productSku: 'TEST-SKU-001'
      },
      orderBy: {
        movementDate: 'asc'
      }
    });

    console.log('📈 История движения:');
    history.forEach(record => {
      console.log(`   ${record.movementDate.toISOString()} - ${record.warehouse}: ${record.previousBalance} → ${record.newBalance} (${record.movementType})`);
    });

    // 6. Обновление документа
    console.log('\n6. Обновление документа...');
    const updatedMovement = await prisma.warehouseMovement.update({
      where: { id: movement.id },
      data: {
        status: 'sent',
        sentToDilovodAt: new Date()
      }
    });
    console.log('✅ Документ обновлен, статус:', updatedMovement.status);

    // 7. Получение всех документов
    console.log('\n7. Получение всех документов...');
    const allMovements = await prisma.warehouseMovement.findMany({
      orderBy: { draftCreatedAt: 'desc' }
    });
    console.log('📄 Всего документов:', allMovements.length);

    console.log('\n🎉 Тестирование завершено успешно!');

    // 8. Тестирование новой логики обновления остатков
    console.log('\n8. Тестирование обновления остатков товаров...');

    // Создаем тестовый товар с остатками
    const testProduct = await prisma.product.upsert({
      where: { sku: 'TEST-STOCK-001' },
      update: {
        name: 'Тестовый товар для проверки остатков',
        stockBalanceByStock: JSON.stringify({
          "1": 100, // Основной склад
          "2": 0,   // Киевский склад
          "3": 0    // Малый склад
        })
      },
      create: {
        sku: 'TEST-STOCK-001',
        name: 'Тестовый товар для проверки остатков',
        stockBalanceByStock: JSON.stringify({
          "1": 100, // Основной склад
          "2": 0,   // Киевский склад
          "3": 0    // Малый склад
        })
      }
    });

    console.log('📦 Создан тестовый товар:', testProduct.sku);

    // Тестируем новую логику напрямую (без API)
    console.log('🔄 [Test] Тестируем функцию updateProductStock напрямую...');

    try {
      const stockUpdateResult = await updateProductStock(
        'TEST-STOCK-001',
        '1', // sourceWarehouse
        '3', // destinationWarehouse
        10  // quantity
      );

      console.log('✅ [Test] Функция updateProductStock выполнена успешно');
      console.log('📊 [Test] Результат:', stockUpdateResult);

      // Создаем записи в истории
      await createStockMovementHistory(
        'TEST-STOCK-001',
        '1',
        '3',
        10,
        10,
        240,
        'STOCK-BATCH-001',
        999, // dummy movementId
        1,
        stockUpdateResult
      );

      console.log('✅ [Test] Записи в истории созданы');

    } catch (error) {
      console.error('🚨 [Test] Ошибка при тестировании:', error);
    }

    // Создаем документ перемещения через API эмуляцию
    console.log('🔄 [Test] Создаем документ через API эмуляцию...');

    const stockMovement = await prisma.warehouseMovement.create({
      data: {
        internalDocNumber: `STOCK-TEST-${Date.now()}`,
        items: JSON.stringify([
          {
            sku: 'TEST-STOCK-001',
            boxQuantity: 5.0,
            portionQuantity: 120,
            batchNumber: 'STOCK-BATCH-002'
          }
        ]),
        sourceWarehouse: '1', // Основной склад
        destinationWarehouse: '3', // Малый склад
        notes: 'Тест обновления остатков через API',
        createdBy: 1
      }
    });

    console.log('📋 Создан документ перемещения:', stockMovement.id);

    // Теперь вызываем API логику обновления остатков для этого документа
    console.log('🔄 [Test] Вызываем API логику обновления остатков...');

    const items = JSON.parse(stockMovement.items as string) as any[];
    for (const item of items) {
      console.log(`📦 [Test] Обработка товара ${item.sku}, количество: ${item.boxQuantity} ящиков`);

      try {
        const stockUpdateResult = await updateProductStock(
          item.sku,
          stockMovement.sourceWarehouse,
          stockMovement.destinationWarehouse,
          item.boxQuantity
        );

        await createStockMovementHistory(
          item.sku,
          stockMovement.sourceWarehouse,
          stockMovement.destinationWarehouse,
          item.boxQuantity,
          item.boxQuantity,
          item.portionQuantity,
          item.batchNumber,
          stockMovement.id,
          1,
          stockUpdateResult
        );

        console.log(`✅ [Test] Товар ${item.sku} обработан успешно`);
      } catch (itemError) {
        console.error(`🚨 [Test] Ошибка обработки товара ${item.sku}:`, itemError);
      }
    }

    // Проверяем обновленные остатки
    const updatedProduct = await prisma.product.findUnique({
      where: { sku: 'TEST-STOCK-001' }
    });

    if (updatedProduct?.stockBalanceByStock) {
      const stockBalances = JSON.parse(updatedProduct.stockBalanceByStock);
      console.log('📊 Остатки после перемещения:');
      console.log(`   Основной склад (1): ${stockBalances["1"]} (ожидалось: 85)`);
      console.log(`   Малый склад (3): ${stockBalances["3"]} (ожидалось: 15)`);

      // После двух перемещений: 100 - 10 - 5 = 85 (основной), 0 + 10 + 5 = 15 (малый)
      if (stockBalances["1"] === 85 && stockBalances["3"] === 15) {
        console.log('✅ Остатки обновлены корректно!');
      } else {
        console.log('❌ Остатки не соответствуют ожидаемым значениям');
      }
    }

    // Проверяем записи в истории движения
    const historyRecords = await prisma.stockMovementHistory.findMany({
      where: {
        referenceId: stockMovement.id.toString(),
        referenceType: 'warehouse_movement'
      }
    });

    console.log(`📈 Найдено записей в истории: ${historyRecords.length}`);
    historyRecords.forEach(record => {
      console.log(`   ${record.warehouse}: ${record.previousBalance} → ${record.newBalance} (${record.movementType})`);
    });

    // 9. Очистка тестовых данных
    console.log('\n9. Очистка тестовых данных...');
    await prisma.stockMovementHistory.deleteMany({
      where: {
        OR: [
          { productSku: { startsWith: 'TEST-SKU-' } },
          { productSku: { startsWith: 'TEST-STOCK-' } }
        ]
      }
    });
    await prisma.warehouseMovement.deleteMany({
      where: {
        OR: [
          { internalDocNumber: { startsWith: 'WM-TEST-' } },
          { internalDocNumber: { startsWith: 'STOCK-TEST-' } }
        ]
      }
    });
    await prisma.product.deleteMany({
      where: {
        sku: { startsWith: 'TEST-STOCK-' }
      }
    });
    console.log('✅ Тестовые данные очищены');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск теста
testWarehouseAPI();
