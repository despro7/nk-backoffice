import { Router } from 'express';
import { prisma } from '../lib/utils.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Вспомогательные функции для работы с остатками
const WAREHOUSE_IDS = {
  MAIN: '1',      // Основной склад (Склад ГП)
  KYIV: '2',      // Киевский склад
  SMALL: '3'      // Малый склад
} as const;

/**
 * Обновляет остатки товара на складах
 */
async function updateProductStock(sku: string, sourceWarehouse: string, destinationWarehouse: string, portionsQuantity: number) {
  console.log(`📦 [Stock Update] Обновление остатка товара ${sku}: ${sourceWarehouse} -> ${destinationWarehouse}, порций: ${portionsQuantity}`);

  const product = await prisma.product.findUnique({
    where: { sku }
  });

  if (!product) {
    throw new Error(`Товар с SKU ${sku} не найден`);
  }

  // Маппинг названий складов на их ID (как хранится в БД)
  const warehouseMapping = {
    "Основний склад": "1",
    "Київський склад": "2",
    "Малий склад": "3"
  };

  // Получаем ID складов
  const sourceWarehouseId = warehouseMapping[sourceWarehouse] || sourceWarehouse;
  const destinationWarehouseId = warehouseMapping[destinationWarehouse] || destinationWarehouse;

  // Парсим текущие остатки (в порциях)
  const currentStock = product.stockBalanceByStock
    ? JSON.parse(product.stockBalanceByStock)
    : {};

  const sourceStockPortions = currentStock[sourceWarehouseId] || 0;
  const destStockPortions = currentStock[destinationWarehouseId] || 0;

  console.log(`📦 [Stock Update] Текущие остатки:`);
  console.log(`   ${sourceWarehouse} (ID: ${sourceWarehouseId}): ${sourceStockPortions} порций`);
  console.log(`   ${destinationWarehouse} (ID: ${destinationWarehouseId}): ${destStockPortions} порций`);

  // Проверяем достаточность остатков
  if (sourceStockPortions < portionsQuantity) {
    throw new Error(`Недостаточно остатков товара ${sku} на складе ${sourceWarehouse}. Доступно: ${sourceStockPortions} порций, требуется: ${portionsQuantity} порций`);
  }

  // Обновляем остатки (работаем с порциями)
  const newStock = {
    ...currentStock,
    [sourceWarehouseId]: Math.max(0, sourceStockPortions - portionsQuantity),
    [destinationWarehouseId]: destStockPortions + portionsQuantity
  };

  // Сохраняем обновленные остатки
  await prisma.product.update({
    where: { sku },
    data: {
      stockBalanceByStock: JSON.stringify(newStock),
      updatedAt: new Date()
    }
  });

  console.log(`✅ [Stock Update] Остатки обновлены:`);
  console.log(`   ${sourceWarehouse}: ${sourceStockPortions} -> ${newStock[sourceWarehouseId]} порций`);
  console.log(`   ${destinationWarehouse}: ${destStockPortions} -> ${newStock[destinationWarehouseId]} порций`);

  return {
    previousStock: currentStock,
    newStock,
    sourceBalance: sourceStockPortions,
    destBalance: destStockPortions,
    movedPortions: portionsQuantity
  };
}

/**
 * Создает записи в истории движения остатков
 */
async function createStockMovementHistory(
  sku: string,
  sourceWarehouse: string,
  destinationWarehouse: string,
  movedPortions: number,
  boxQuantity: number,
  portionQuantity: number,
  batchNumber: string,
  movementId: number,
  userId: number,
  stockUpdateResult: any
) {
  console.log(`📊 [Movement History] Создание записей истории для ${sku}: перемещено ${movedPortions} порций`);

  // Маппинг названий складов на их ID (как хранится в БД)
  const warehouseMapping = {
    "Основний склад": "1",
    "Київський склад": "2",
    "Малий склад": "3"
  };

  // Получаем ID складов
  const sourceWarehouseId = warehouseMapping[sourceWarehouse] || sourceWarehouse;
  const destinationWarehouseId = warehouseMapping[destinationWarehouse] || destinationWarehouse;

  // Списываем с исходного склада
  await prisma.stockMovementHistory.create({
    data: {
      productSku: sku,
      warehouse: sourceWarehouse,
      movementType: 'transfer_out',
      quantity: movedPortions,  // Количество порций
      quantityType: 'portion',  // Тип: порции
      batchNumber: batchNumber || null,
      referenceId: movementId.toString(),
      referenceType: 'warehouse_movement',
      previousBalance: stockUpdateResult.sourceBalance,
      newBalance: stockUpdateResult.newStock[sourceWarehouseId],
      notes: `Перемещение ${movedPortions} порций в ${destinationWarehouse}`,
      createdBy: userId
    }
  });

  // Приходуем на целевой склад
  await prisma.stockMovementHistory.create({
    data: {
      productSku: sku,
      warehouse: destinationWarehouse,
      movementType: 'transfer_in',
      quantity: movedPortions,  // Количество порций
      quantityType: 'portion',  // Тип: порции
      batchNumber: batchNumber || null,
      referenceId: movementId.toString(),
      referenceType: 'warehouse_movement',
      previousBalance: stockUpdateResult.destBalance,
      newBalance: stockUpdateResult.newStock[destinationWarehouseId],
      notes: `Перемещение ${movedPortions} порций из ${sourceWarehouse}`,
      createdBy: userId
    }
  });

  console.log(`✅ [Movement History] Записи истории созданы для ${sku}: ${movedPortions} порций`);
}

// Получить все документы перемещения
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, warehouse, page = 1, limit = 20 } = req.query;
    
    const where: any = {};
    if (status) where.status = status;
    if (warehouse) {
      where.OR = [
        { sourceWarehouse: warehouse },
        { destinationWarehouse: warehouse }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const [movements, total] = await Promise.all([
      prisma.warehouseMovement.findMany({
        where,
        orderBy: { draftCreatedAt: 'desc' },
        skip,
        take: Number(limit),
        // include можно добавить для связанных данных при необходимости
      }),
      prisma.warehouseMovement.count({ where })
    ]);

    res.json({
      movements,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching warehouse movements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /drafts - получить черновики пользователя
router.get('/drafts', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] GET /drafts - запрос черновиков...');
    const userId = (req as any).user?.userId || (req as any).user?.id;
    
    if (!userId) {
      console.error('❌ [Warehouse] Missing userId from authentication token');
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    const drafts = await prisma.warehouseMovement.findMany({
      where: {
        createdBy: userId,
        status: 'draft'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`✅ [Warehouse] Найдено ${drafts.length} черновиков для пользователя ${userId}`);
    res.json({ drafts });
  } catch (error) {
    console.error('🚨 [Warehouse] Error fetching drafts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить товары с остатками для перемещения между складами
router.get('/products-for-movement', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] GET /products-for-movement - запрос товаров для перемещения...');

    // Получаем товары где есть остатки на основном складе (склад "1")
    const products = await prisma.product.findMany({
      where: {
        stockBalanceByStock: {
          not: null
        }
      },
      orderBy: { name: 'asc' }
    });

    console.log(`🏪 [Warehouse] Найдено ${products.length} товаров с остатками`);

    // Фильтруем товары с остатками на основном складе и парсим JSON
    const productsWithStock = products
      .map(product => {
        try {
          const stockBalance = product.stockBalanceByStock
            ? JSON.parse(product.stockBalanceByStock)
            : {};

          // Остатки хранятся как порции в соответствующих складах
          const mainStockPortions = stockBalance["1"] || 0;  // Порции на основном складе
          const kyivStockPortions = stockBalance["2"] || 0;   // Порции на киевском складе
          const smallStockPortions = stockBalance["3"] || 0;  // Порции на малом складе

          // Для отображения конвертируем в формат "ящики / порции"
          const PORTIONS_PER_BOX = 24;
          const mainStockBoxes = Math.floor(mainStockPortions / PORTIONS_PER_BOX);
          const mainStockRemainder = mainStockPortions % PORTIONS_PER_BOX;
          const smallStockBoxes = Math.floor(smallStockPortions / PORTIONS_PER_BOX);
          const smallStockRemainder = smallStockPortions % PORTIONS_PER_BOX;



          // Возвращаем только товары с остатками на основном складе
          if (mainStockPortions > 0) {
            return {
              id: product.sku, // Используем SKU как ID
              sku: product.sku,
              name: product.name,
              balance: `${mainStockPortions} / ${smallStockPortions}`, // основной / малый (в порциях)
              details: {
                boxes: 0, // Прогнозируемое количество ящиков (начальное значение)
                portions: 0, // Автоматически рассчитывается
                forecast: 125, // Заглушка, позже зададим логику
                batchNumber: '' // Номер партии (пока пустой)
              },
              stockData: {
                mainStock: mainStockPortions,     // Порции на основном складе
                kyivStock: kyivStockPortions,     // Порции на киевском складе
                smallStock: smallStockPortions,   // Порции на малом складе
                displayFormat: {
                  main: `${mainStockBoxes} / ${mainStockRemainder}`,     // "ящики / порции"
                  small: `${smallStockBoxes} / ${smallStockRemainder}`   // "ящики / порции"
                }
              }
            };
          }
          return null;
        } catch (error) {
          console.warn(`🚨 [Warehouse] Failed to parse stockBalanceByStock for product ${product.sku}:`, error);
          console.warn(`🚨 [Warehouse] Raw data:`, product.stockBalanceByStock);
          return null;
        }
      })
      .filter(Boolean);

    console.log(`✅ [Warehouse] Отфильтровано ${productsWithStock.length} товаров с остатками на основном складе`);

    res.json({
      products: productsWithStock,
      total: productsWithStock.length
    });
  } catch (error) {
    console.error('🚨 [Warehouse] Error fetching products for movement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить документ по ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Проверяем наличие и валидность ID
    if (!id || isNaN(Number(id))) {
      console.error('❌ [Warehouse] Invalid ID parameter:', id);
      return res.status(400).json({ error: 'Valid movement ID is required' });
    }
    
    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) }
    });

    if (!movement) {
      return res.status(404).json({ error: 'Movement not found' });
    }

    res.json(movement);
  } catch (error) {
    console.error('❌ [Warehouse] Error fetching warehouse movement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:id - обновить черновик
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] PUT /:id - обновление черновика...');
    const { id } = req.params;
    const { items, deviations, notes } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid ID parameter' });
    }

    if (!userId) {
      console.error('❌ [Warehouse] Missing userId from authentication token');
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    // Проверяем что черновик принадлежит пользователю и имеет статус draft
    const existingDraft = await prisma.warehouseMovement.findFirst({
      where: {
        id: Number(id),
        createdBy: userId,
        status: 'draft'
      }
    });

    if (!existingDraft) {
      console.error('❌ [Warehouse] Draft not found or not editable');
      return res.status(404).json({ error: 'Draft not found or not editable' });
    }



    const updatedDraft = await prisma.warehouseMovement.update({
      where: { id: Number(id) },
      data: {
        items: items,
        deviations: deviations,
        notes: notes || existingDraft.notes,
        updatedAt: new Date()
      }
    });

    console.log('✅ [Warehouse] Draft updated successfully:', updatedDraft.id);
    res.json(updatedDraft);
  } catch (error) {
    console.error('🚨 [Warehouse] Error updating draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Создать новый документ
router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] POST / - создание нового документа...');
    console.log('🏪 [Warehouse] Request body:', JSON.stringify(req.body, null, 2));
    
    const { items, deviations, sourceWarehouse, destinationWarehouse, notes } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    console.log('🏪 [Warehouse] User from token:', (req as any).user);
    console.log('🏪 [Warehouse] Extracted userId:', userId);

    // Валидация обязательных полей
    if (!items || !sourceWarehouse || !destinationWarehouse) {
      console.error('❌ [Warehouse] Missing required fields:', { items: !!items, sourceWarehouse, destinationWarehouse });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!userId) {
      console.error('❌ [Warehouse] Missing userId from authentication token');
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    // Генерируем уникальный номер документа
    const totalCount = await prisma.warehouseMovement.count();
    const nextDocNumber = (totalCount + 1).toString().padStart(5, '0');



    const movement = await prisma.warehouseMovement.create({
      data: {
        internalDocNumber: nextDocNumber,
        items: items, // Prisma автоматически сериализует в JSON
        deviations: deviations, // Сохраняем отклонения
        sourceWarehouse,
        destinationWarehouse,
        notes,
        createdBy: userId
      }
    });

    console.log('✅ [Warehouse] Warehouse movement created:', movement.id);

    // Обновляем остатки товаров и создаем историю движения
    try {
      console.log('🔄 [Warehouse] Начинаем обновление остатков товаров...');
      console.log('🔄 [Warehouse] Items:', JSON.stringify(items, null, 2));
      console.log('🔄 [Warehouse] Source warehouse:', sourceWarehouse);
      console.log('🔄 [Warehouse] Destination warehouse:', destinationWarehouse);

      for (const item of items) {
        const itemData = item as any; // Type assertion для работы с JSON
        console.log(`📦 [Warehouse] Обработка товара ${itemData.sku}, порций: ${itemData.portionQuantity}`);

        try {
          // Перемещаем порции согласно указанному количеству
          const stockUpdateResult = await updateProductStock(
            itemData.sku,
            sourceWarehouse,
            destinationWarehouse,
            itemData.portionQuantity  // Используем количество порций
          );

          // Создаем записи в истории движения
          await createStockMovementHistory(
            itemData.sku,
            sourceWarehouse,
            destinationWarehouse,
            itemData.portionQuantity,  // Количество порций
            itemData.portionQuantity,  // Количество порций
            itemData.portionQuantity,  // Количество порций
            itemData.batchNumber,
            movement.id,
            userId,
            stockUpdateResult
          );

          console.log(`✅ [Warehouse] Товар ${itemData.sku} обработан успешно: перемещено ${itemData.portionQuantity} порций`);
        } catch (itemError) {
          console.error(`🚨 [Warehouse] Ошибка обработки товара ${itemData.sku}:`, itemError);
          throw itemError; // Передаем ошибку выше
        }
      }

      console.log('✅ [Warehouse] Остатки товаров успешно обновлены');
    } catch (stockError) {
      console.error('🚨 [Warehouse] Ошибка при обновлении остатков:', stockError);

      // Если произошла ошибка при обновлении остатков, удаляем созданный документ
      await prisma.warehouseMovement.delete({
        where: { id: movement.id }
      });

      throw new Error(`Не удалось обновить остатки товаров: ${stockError.message}`);
    }

    res.status(201).json(movement);
  } catch (error) {
    console.error('🚨 [Warehouse] Error creating warehouse movement:', error);
    console.error('🚨 [Warehouse] Stack trace:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Обновить документ
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { items, deviations, status, notes } = req.body;

    const movement = await prisma.warehouseMovement.update({
      where: { id: Number(id) },
      data: {
        items,
        deviations,
        status,
        notes,
        draftLastEditedAt: new Date()
      }
    });

    res.json(movement);
  } catch (error) {
    console.error('Error updating warehouse movement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отправить в Dilovod (обновляет статус и фиксирует остатки)
router.post('/:id/send', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    console.log(`🏪 [Warehouse] Отправка документа ${id} в Dilovod...`);

    // Получаем документ
    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) }
    });

    if (!movement) {
      return res.status(404).json({ error: 'Movement not found' });
    }

    if (movement.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft documents can be sent' });
    }

    // Если остатки еще не были обновлены (например, если документ был создан до добавления этой логики),
    // обновляем их сейчас
    if (movement.items && Array.isArray(movement.items) && movement.items.length > 0) {
      console.log('🔄 [Warehouse] Проверка и обновление остатков перед отправкой...');

      for (const item of movement.items) {
        const itemData = item as any; // Type assertion для работы с JSON

        // Проверяем, есть ли уже записи в истории движения для этого документа
        const existingHistory = await prisma.stockMovementHistory.findFirst({
          where: {
            referenceId: movement.id.toString(),
            referenceType: 'warehouse_movement',
            productSku: itemData.sku
          }
        });

        // Если записей нет, обновляем остатки
        if (!existingHistory) {
          console.log(`📦 [Warehouse] Обновление остатков для товара ${itemData.sku}...`);

          try {
            console.log(`📦 [Warehouse] При отправке в Dilovod для ${itemData.sku}:`);
            console.log(`   Порций для перемещения: ${itemData.portionQuantity}`);

            const stockUpdateResult = await updateProductStock(
              itemData.sku,
              movement.sourceWarehouse,
              movement.destinationWarehouse,
              itemData.portionQuantity  // Используем количество порций
            );

            await createStockMovementHistory(
              itemData.sku,
              movement.sourceWarehouse,
              movement.destinationWarehouse,
              itemData.portionQuantity,  // Перемещенные порции
              itemData.portionQuantity,  // Порции
              itemData.portionQuantity,  // Порции
              itemData.batchNumber,
              movement.id,
              userId,
              stockUpdateResult
            );
          } catch (stockError) {
            console.error(`🚨 [Warehouse] Ошибка обновления остатков для ${itemData.sku}:`, stockError);
            return res.status(400).json({
              error: `Не удалось обновить остатки для товара ${itemData.sku}: ${stockError.message}`
            });
          }
        }
      }
    }

    // Обновляем статус документа
    const updatedMovement = await prisma.warehouseMovement.update({
      where: { id: Number(id) },
      data: {
        status: 'sent',
        sentToDilovodAt: new Date()
      }
    });

    console.log(`✅ [Warehouse] Документ ${id} отправлен в Dilovod`);
    res.json(updatedMovement);
  } catch (error) {
    console.error('🚨 [Warehouse] Error sending warehouse movement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить историю движения остатков
router.get('/stock/history', authenticateToken, async (req, res) => {
  try {
    const { sku, warehouse, movementType, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    const where: any = {};
    if (sku) where.productSku = sku;
    if (warehouse) where.warehouse = warehouse;
    if (movementType) where.movementType = movementType;
    if (startDate || endDate) {
      where.movementDate = {};
      if (startDate) where.movementDate.gte = new Date(startDate as string);
      if (endDate) where.movementDate.lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const [history, total] = await Promise.all([
      prisma.stockMovementHistory.findMany({
        where,
        orderBy: { movementDate: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.stockMovementHistory.count({ where })
    ]);

    res.json({
      history,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching stock history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить текущие остатки по складам
router.get('/stock/current', authenticateToken, async (req, res) => {
  try {
    const { warehouse } = req.query;
    
    const where: any = {};
    if (warehouse) where.warehouse = warehouse;

    const currentStock = await prisma.stockMovementHistory.groupBy({
      by: ['productSku', 'warehouse'],
      where,
      _max: {
        movementDate: true
      }
    });

    // Получаем последние записи для каждого SKU и склада
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

    res.json(stockData.filter(Boolean));
  } catch (error) {
    console.error('Error fetching current stock:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Отменяет перемещение остатков (возвращает товары обратно)
 */
async function revertStockMovement(
  sku: string,
  sourceWarehouse: string,
  destinationWarehouse: string,
  portionsToReturn: number,
  movementId: number,
  userId: number
) {
  console.log(`🔄 [Stock Revert] Отмена перемещения товара ${sku}: ${destinationWarehouse} -> ${sourceWarehouse}, порций: ${portionsToReturn}`);

  const product = await prisma.product.findUnique({
    where: { sku }
  });

  if (!product) {
    throw new Error(`Товар с SKU ${sku} не найден`);
  }

  // Маппинг названий складов на их ID (как хранится в БД)
  const warehouseMapping = {
    "Основний склад": "1",
    "Київський склад": "2",
    "Малий склад": "3"
  };

  // Получаем ID складов
  const sourceWarehouseId = warehouseMapping[sourceWarehouse] || sourceWarehouse;
  const destinationWarehouseId = warehouseMapping[destinationWarehouse] || destinationWarehouse;

  // Парсим текущие остатки (в порциях)
  const currentStock = product.stockBalanceByStock
    ? JSON.parse(product.stockBalanceByStock)
    : {};

  const sourceStockPortions = currentStock[sourceWarehouseId] || 0;
  const destStockPortions = currentStock[destinationWarehouseId] || 0;

  console.log(`🔄 [Stock Revert] Текущие остатки:`);
  console.log(`   ${sourceWarehouse} (ID: ${sourceWarehouseId}): ${sourceStockPortions} порций`);
  console.log(`   ${destinationWarehouse} (ID: ${destinationWarehouseId}): ${destStockPortions} порций`);

  // Проверяем достаточность остатков на целевом складе
  if (destStockPortions < portionsToReturn) {
    console.warn(`⚠️ [Stock Revert] Недостаточно остатков на целевом складе. Доступно: ${destStockPortions} порций, требуется: ${portionsToReturn} порций`);
    // Возвращаем максимально возможное количество
  }

  // Возвращаем товары обратно (работаем с порциями)
  const actualReturnPortions = Math.min(destStockPortions, portionsToReturn);

  const newStock = {
    ...currentStock,
    [sourceWarehouseId]: sourceStockPortions + actualReturnPortions,
    [destinationWarehouseId]: Math.max(0, destStockPortions - actualReturnPortions)
  };

  // Сохраняем обновленные остатки
  await prisma.product.update({
    where: { sku },
    data: {
      stockBalanceByStock: JSON.stringify(newStock),
      updatedAt: new Date()
    }
  });

  // Создаем записи в истории об отмене
  await prisma.stockMovementHistory.create({
    data: {
      productSku: sku,
      warehouse: destinationWarehouse,
      movementType: 'adjustment',
      quantity: -actualReturnPortions,  // Отрицательное количество порций
      quantityType: 'portion',
      referenceId: movementId.toString(),
      referenceType: 'warehouse_movement',
      previousBalance: destStockPortions,
      newBalance: newStock[destinationWarehouseId],
      notes: `Отмена перемещения - возврат ${actualReturnPortions} порций из ${sourceWarehouse}`,
      createdBy: userId
    }
  });

  await prisma.stockMovementHistory.create({
    data: {
      productSku: sku,
      warehouse: sourceWarehouse,
      movementType: 'adjustment',
      quantity: actualReturnPortions,   // Положительное количество порций
      quantityType: 'portion',
      referenceId: movementId.toString(),
      referenceType: 'warehouse_movement',
      previousBalance: sourceStockPortions,
      newBalance: newStock[sourceWarehouseId],
      notes: `Отмена перемещения - возврат ${actualReturnPortions} порций в ${sourceWarehouse}`,
      createdBy: userId
    }
  });

  console.log(`✅ [Stock Revert] Перемещение отменено: возвращено ${actualReturnPortions} порций`);
}

// DELETE /:id - удалить черновик и отменить перемещение остатков
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    console.log(`🗑️ [Warehouse] Удаление черновика ${id}...`);

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid ID parameter' });
    }

    if (!userId) {
      console.error('❌ [Warehouse] Missing userId from authentication token');
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    // Получаем документ
    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) }
    });

    if (!movement) {
      return res.status(404).json({ error: 'Movement not found' });
    }

    // Проверяем что документ принадлежит пользователю и имеет статус draft
    if (movement.createdBy !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (movement.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft documents can be deleted' });
    }

    // Отменяем перемещение остатков
    if (movement.items && Array.isArray(movement.items) && movement.items.length > 0) {
      console.log('🔄 [Warehouse] Отмена перемещения остатков...');

      for (const item of movement.items) {
        const itemData = item as any; // Type assertion для работы с JSON
        try {
          // Отменяем перемещение, используя количество порций
          await revertStockMovement(
            itemData.sku,
            movement.sourceWarehouse,
            movement.destinationWarehouse,
            itemData.portionQuantity,  // Количество порций для возврата
            movement.id,
            userId
          );
        } catch (revertError) {
          console.error(`🚨 [Warehouse] Ошибка отмены перемещения для ${itemData.sku}:`, revertError);
          // Продолжаем удаление документа даже если не удалось отменить остатки
        }
      }
    }

    // Удаляем записи из истории движения
    await prisma.stockMovementHistory.deleteMany({
      where: {
        referenceId: movement.id.toString(),
        referenceType: 'warehouse_movement'
      }
    });

    // Удаляем документ
    await prisma.warehouseMovement.delete({
      where: { id: Number(id) }
    });

    console.log(`✅ [Warehouse] Черновик ${id} успешно удален`);
    res.json({ message: 'Draft deleted successfully' });
  } catch (error) {
    console.error('🚨 [Warehouse] Error deleting draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
